package com.highway38.office;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.PowerManager;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

/** One place that answers "what is the tracking setup state right now". */
public final class StatusReporter {

    private StatusReporter() {}

    public static boolean foregroundLocationGranted(Context ctx) {
        return ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    public static boolean backgroundLocationGranted(Context ctx) {
        if (Build.VERSION.SDK_INT < 29) return foregroundLocationGranted(ctx);
        return ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    public static boolean notificationsGranted(Context ctx) {
        if (Build.VERSION.SDK_INT >= 33) {
            return ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS)
                    == PackageManager.PERMISSION_GRANTED;
        }
        return NotificationManagerCompat.from(ctx).areNotificationsEnabled();
    }

    public static boolean batteryExempt(Context ctx) {
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
    }

    /** The status object the web app renders in Fleet → Mileage / the Today card. */
    public static JSONObject statusJson(Context ctx) {
        JSONObject j = new JSONObject();
        try {
            GateEvaluator.Policy p = PolicyStore.loadPolicy(ctx);
            GateEvaluator.Gate gate = GateEvaluator.evaluate(p, System.currentTimeMillis());
            j.put("available", true);
            j.put("app", "H38 Office");
            j.put("version", BuildConfig.VERSION_NAME);
            j.put("setupComplete", PolicyStore.setupComplete(ctx));
            j.put("signedIn", p != null && p.signedIn);
            j.put("sessionPresent", PolicyStore.loadSession(ctx).present());
            j.put("sessionAuthDead", PolicyStore.sessionAuthDeadAt(ctx) > 0);
            j.put("gate", gate.name());
            j.put("recording", gate == GateEvaluator.Gate.RECORDING);
            j.put("waitingClockIn", gate == GateEvaluator.Gate.WAITING_CLOCKIN);
            j.put("foregroundLocation", foregroundLocationGranted(ctx));
            j.put("backgroundLocation", backgroundLocationGranted(ctx));
            j.put("notifications", notificationsGranted(ctx));
            j.put("batteryExempt", batteryExempt(ctx));
            j.put("pendingTrips", new TripStore(ctx).count());
            j.put("policyUpdatedAt", p != null ? p.pushedAtMs : 0);
        } catch (Exception ignored) {}
        return j;
    }
}
