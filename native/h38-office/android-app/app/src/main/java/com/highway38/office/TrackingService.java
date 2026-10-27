package com.highway38.office;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.content.ContextCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.Tasks;

import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * The always-on mileage watcher. Runs as a foreground service whenever the
 * recording policy says tracking is armed:
 *
 *   RECORDING        — location updates feed the TripDetector (low-power
 *                      while parked, high-accuracy while driving). The
 *                      persistent notification reads "Mileage tracking is on".
 *   WAITING_CLOCKIN  — employees only: no location is read at all; the
 *                      service re-checks the clock state on the server every
 *                      15 minutes. Notification says so, plainly.
 *   OFF / PAUSED     — the service stops itself. No notification, no GPS.
 *
 * Detected trips go to the on-device queue and are synced to the Office by
 * SyncEngine; the service also retries the queue periodically.
 */
public final class TrackingService extends Service {

    static final String CHANNEL_ID = "mileage_tracking";
    private static final int NOTIFICATION_ID = 3801;
    private static final long GATE_RECHECK_MS = 15L * 60L * 1000L;
    private static final long SYNC_RETRY_MS = 30L * 60L * 1000L;

    private FusedLocationProviderClient fused;
    private TripDetector detector;
    private Handler handler;
    private ExecutorService io;
    private GateEvaluator.Gate gate = GateEvaluator.Gate.OFF;
    private boolean updatesActive = false;
    private boolean drivingProfile = false;
    private TripStore tripStore;
    // Latest fix seen, for the owner "Find my phone" heartbeat.
    private double lastFixLat, lastFixLng, lastFixAcc;
    private long lastFixMs = 0;

    // --- Parked movement confirm window (1.0.4) ---------------------------
    // The detector only accepts fixes with accuracy <= 65 m, but the
    // balanced-power parked profile away from Wi-Fi delivers cell-grade
    // fixes far coarser than that — so on 1.0.0–1.0.3 a drive could begin
    // and end without the detector ever seeing one acceptable fix: the
    // high-accuracy profile only engaged AFTER a detection that the parked
    // profile could not produce. The raw anchor below breaks the circle:
    // coarse displacement past a loose threshold buys a 3-minute
    // high-accuracy window in which the detector can do its precise work.
    private static final long CONFIRM_WINDOW_MS = 180_000L;
    private double rawAnchorLat, rawAnchorLng;
    private boolean rawAnchorSet = false;
    private boolean confirming = false;

    // Identity snapshot taken whenever the gate is RECORDING. A trip that
    // completes after the native session was wiped is filed under this
    // snapshot and QUEUED — never silently dropped (1.0.0–1.0.3 dropped
    // it outright when the session read came back empty).
    private PolicyStore.Session sessionSnapshot;

    private final Runnable confirmExpiry = new Runnable() {
        @Override public void run() {
            confirming = false;
            if (gate == GateEvaluator.Gate.RECORDING && updatesActive && !drivingProfile) {
                applyProfile(false);
            }
            if (lastFixMs > 0) {
                rawAnchorLat = lastFixLat;
                rawAnchorLng = lastFixLng;
                rawAnchorSet = true;
            }
        }
    };

    private final LocationCallback locationCallback = new LocationCallback() {
        @Override public void onLocationResult(LocationResult result) {
            if (result == null) return;
            for (Location loc : result.getLocations()) {
                if (loc == null) continue;
                Double speed = loc.hasSpeed() ? (double) loc.getSpeed() : null;
                double acc = loc.hasAccuracy() ? loc.getAccuracy() : -1;
                lastFixLat = loc.getLatitude();
                lastFixLng = loc.getLongitude();
                lastFixAcc = acc;
                lastFixMs = loc.getTime();

                if (!drivingProfile) {
                    // Movement trigger: coarse but far = really moving.
                    if (!confirming && rawAnchorSet
                            && GeoMath.shouldConfirmDrive(rawAnchorLat, rawAnchorLng,
                                    loc.getLatitude(), loc.getLongitude(), acc)) {
                        confirming = true;
                        handler.post(() -> {
                            if (gate == GateEvaluator.Gate.RECORDING && updatesActive && !drivingProfile) {
                                applyProfile(true);
                                handler.removeCallbacks(confirmExpiry);
                                handler.postDelayed(confirmExpiry, CONFIRM_WINDOW_MS);
                            } else {
                                confirming = false;
                            }
                        });
                    }
                    // The raw anchor only follows settled fixes, exactly
                    // like the detector's parked anchor.
                    boolean settledFix = speed != null
                            ? speed < TripDetector.STILL_SPEED_MPS
                            : (rawAnchorSet && GeoMath.haversineM(rawAnchorLat, rawAnchorLng,
                                    loc.getLatitude(), loc.getLongitude()) <= TripDetector.STILL_RADIUS_M);
                    if (!rawAnchorSet || settledFix) {
                        rawAnchorLat = loc.getLatitude();
                        rawAnchorLng = loc.getLongitude();
                        rawAnchorSet = true;
                    }
                }

                detector.onFix(new TripDetector.Fix(
                        loc.getLatitude(), loc.getLongitude(), acc, speed, loc.getTime()));
            }
        }
    };

    private final Runnable gateRecheck = new Runnable() {
        @Override public void run() {
            io.execute(() -> {
                boolean[] inputs = SyncEngine.readGateInputs(TrackingService.this);
                if (inputs != null) {
                    PolicyStore.refreshGateInputs(TrackingService.this, inputs[0], inputs[1]);
                }
                handler.post(() -> applyGate(true));
                SyncEngine.syncPendingTrips(TrackingService.this);
                refreshSessionSnapshot();
                refreshLastFixFromCurrentLocation();
                maybeReportOwnerPosition();
            });
            handler.postDelayed(this, GATE_RECHECK_MS);
        }
    };

    private void refreshSessionSnapshot() {
        PolicyStore.Session s = PolicyStore.loadSession(this);
        if (s.present()) sessionSnapshot = s;
    }

    /**
     * Actively fetch one current fix for the heartbeat. On 1.0.0–1.0.3 the
     * heartbeat only reused whatever the location callback had last
     * delivered — and the parked request's 40 m minimum displacement
     * meant a stationary phone delivered one fix and then went silent, so
     * the "fix no older than 30 minutes" gate below starved forever while
     * the phone sat still. A heartbeat must ask, not wait.
     */
    private void refreshLastFixFromCurrentLocation() {
        if (gate != GateEvaluator.Gate.RECORDING || !hasFineLocation()) return;
        try {
            Location loc = Tasks.await(
                    fused.getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, null),
                    12, TimeUnit.SECONDS);
            if (loc != null) {
                lastFixLat = loc.getLatitude();
                lastFixLng = loc.getLongitude();
                lastFixAcc = loc.hasAccuracy() ? loc.getAccuracy() : -1;
                lastFixMs = loc.getTime();
            }
        } catch (Exception ignored) {
            // No fix right now (airplane mode, GPS off): the heartbeat
            // freshness gate simply skips this round, as before.
        }
    }

    /**
     * Find-my-phone heartbeat: on the 15-minute gate recheck, report the
     * latest fix — owners only, only while recording, only with a fix no
     * older than 30 minutes. Employees are never position-reported by the
     * background runner.
     */
    private void maybeReportOwnerPosition() {
        if (gate != GateEvaluator.Gate.RECORDING || lastFixMs <= 0) return;
        if (System.currentTimeMillis() - lastFixMs > 30L * 60L * 1000L) return;
        GateEvaluator.Policy policy = PolicyStore.loadPolicy(TrackingService.this);
        if (policy == null || !policy.ownerAdmin) return;
        SyncEngine.reportOwnerPosition(TrackingService.this,
                lastFixLat, lastFixLng, lastFixAcc, lastFixMs);
    }

    private final Runnable syncRetry = new Runnable() {
        @Override public void run() {
            io.execute(() -> SyncEngine.syncPendingTrips(TrackingService.this));
            handler.postDelayed(this, SYNC_RETRY_MS);
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        handler = new Handler(Looper.getMainLooper());
        io = Executors.newSingleThreadExecutor();
        tripStore = new TripStore(this);
        fused = LocationServices.getFusedLocationProviderClient(this);
        detector = new TripDetector(new TripDetector.Listener() {
            @Override public void onTripCompleted(TripDetector.CompletedTrip trip) {
                PolicyStore.Session s = PolicyStore.loadSession(TrackingService.this);
                if (!s.present()) s = sessionSnapshot;
                if (s == null || s.businessId.isEmpty() || s.userId.isEmpty()) {
                    // Never armed with an identity — the gate only reaches
                    // RECORDING after a session push, so this guard should
                    // be unreachable; if it is ever hit there is honestly
                    // nothing to file the trip under.
                    return;
                }
                String tripId = TripPayload.newTripId();
                Map<String, Object> payload = TripPayload.build(trip, tripId,
                        s.businessId, s.userId, s.userName, System.currentTimeMillis());
                tripStore.add(SyncEngine.toJson(payload));
                io.execute(() -> {
                    SyncEngine.syncPendingTrips(TrackingService.this);
                    // A finished drive is also a fresh last-seen for
                    // Find my phone (owners only).
                    GateEvaluator.Policy policy = PolicyStore.loadPolicy(TrackingService.this);
                    if (policy != null && policy.ownerAdmin) {
                        SyncEngine.reportOwnerPosition(TrackingService.this,
                                trip.endLat, trip.endLng, -1, trip.endedAtMs);
                    }
                });
            }

            @Override public void onDrivingChanged(boolean driving) {
                handler.post(() -> {
                    if (gate == GateEvaluator.Gate.RECORDING && updatesActive) {
                        requestUpdates(driving);
                    }
                });
            }
        });
        createChannel();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        applyGate(false);
        return START_STICKY;
    }

    /** Reads the policy, applies the gate, starts/stops as it dictates. */
    private void applyGate(boolean fromRecheck) {
        GateEvaluator.Policy policy = PolicyStore.loadPolicy(this);
        GateEvaluator.Gate next = GateEvaluator.evaluate(policy, System.currentTimeMillis());
        boolean gateChanged = next != gate;
        gate = next;

        switch (gate) {
            case RECORDING: {
                if (!hasFineLocation()) { stopSelf(); return; }
                startForegroundWith(drivingProfile
                        ? "Mileage tracking is on — recording this drive"
                        : "Mileage tracking is on");
                refreshSessionSnapshot();
                if (!updatesActive) requestUpdates(false);
                break;
            }
            case WAITING_CLOCKIN: {
                // The typed startForeground below throws SecurityException
                // on SDK 34+ when the location permission is not held —
                // same fresh-install trap as the controller's start; an
                // armed-but-unpermissioned service must stop, not crash.
                if (!hasFineLocation()) { stopSelf(); return; }
                startForegroundWith("Mileage tracking is on — starts when you clock in");
                removeUpdates();
                break;
            }
            default: { // OFF or PAUSED_STALE: honest stop, no GPS, no notice.
                removeUpdates();
                stopForeground(STOP_FOREGROUND_REMOVE);
                stopSelf();
                return;
            }
        }

        if (!fromRecheck && gateChanged) {
            handler.removeCallbacks(gateRecheck);
            handler.postDelayed(gateRecheck, GATE_RECHECK_MS);
            handler.removeCallbacks(syncRetry);
            handler.postDelayed(syncRetry, SYNC_RETRY_MS);
        }
    }

    /** Detector-driven profile change: driving confirmed, or drive over. */
    private void requestUpdates(boolean driving) {
        drivingProfile = driving;
        if (driving) {
            // The detector confirmed the drive itself — the confirm
            // window has done its job.
            confirming = false;
            handler.removeCallbacks(confirmExpiry);
        }
        applyProfile(driving);
    }

    private void applyProfile(boolean highAccuracy) {
        if (!hasFineLocation()) return;
        LocationRequest req;
        if (highAccuracy) {
            req = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5_000)
                    .setMinUpdateIntervalMillis(3_000)
                    .setMinUpdateDistanceMeters(10)
                    .build();
        } else {
            // No minimum displacement (1.0.4): the old 40 m floor meant a
            // stationary phone delivered one fix and went silent, which
            // starved both the raw anchor above and the heartbeat.
            req = new LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, 60_000)
                    .setMinUpdateIntervalMillis(30_000)
                    .build();
        }
        try {
            fused.removeLocationUpdates(locationCallback);
            fused.requestLocationUpdates(req, locationCallback, Looper.getMainLooper());
            updatesActive = true;
        } catch (SecurityException ignored) {
            updatesActive = false;
        }
    }

    private void removeUpdates() {
        if (!updatesActive) return;
        try { fused.removeLocationUpdates(locationCallback); } catch (Exception ignored) {}
        updatesActive = false;
        drivingProfile = false;
        confirming = false;
        rawAnchorSet = false;
        handler.removeCallbacks(confirmExpiry);
        detector.reset();
    }

    private boolean hasFineLocation() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    private void createChannel() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "Mileage tracking", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Shown while mileage tracking is on.");
            nm.createNotificationChannel(ch);
        }
    }

    private void startForegroundWith(String text) {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, CHANNEL_ID)
                .setContentTitle("H38 Office")
                .setContentText(text)
                .setSmallIcon(R.drawable.office_notification_icon)
                .setContentIntent(pi)
                .setOngoing(true)
                .build();
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIFICATION_ID, n);
            }
        } catch (SecurityException ignored) {
            // Permission revoked between the gate check and this call —
            // stop quietly; tracking re-arms when the app next re-evaluates.
            stopSelf();
        }
    }

    @Override public void onDestroy() {
        removeUpdates();
        handler.removeCallbacksAndMessages(null);
        if (io != null) io.shutdownNow();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) {
        return null;
    }
}
