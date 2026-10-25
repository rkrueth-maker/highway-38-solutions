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

import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

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
                maybeReportOwnerPosition();
            });
            handler.postDelayed(this, GATE_RECHECK_MS);
        }
    };

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
                if (!s.present()) return;
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
                if (!updatesActive) requestUpdates(false);
                break;
            }
            case WAITING_CLOCKIN: {
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

    private void requestUpdates(boolean driving) {
        if (!hasFineLocation()) return;
        drivingProfile = driving;
        LocationRequest req;
        if (driving) {
            req = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5_000)
                    .setMinUpdateIntervalMillis(3_000)
                    .setMinUpdateDistanceMeters(10)
                    .build();
        } else {
            req = new LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, 60_000)
                    .setMinUpdateIntervalMillis(30_000)
                    .setMinUpdateDistanceMeters(40)
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
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, n);
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
