package com.highway38.office;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * Single entry point for "the policy changed — do the right thing now".
 * Used by the bridge (web pushes), the wizard, sign-in/out, and the boot
 * receiver. The service itself re-evaluates the gate on every start and on
 * its 15-minute re-check, so starting it is always safe: it stops itself
 * immediately when the gate says OFF.
 */
public final class TrackingController {

    private TrackingController() {}

    public static GateEvaluator.Gate currentGate(Context ctx) {
        return GateEvaluator.evaluate(PolicyStore.loadPolicy(ctx), System.currentTimeMillis());
    }

    public static void reevaluate(Context ctx) {
        GateEvaluator.Gate gate = currentGate(ctx);
        Intent svc = new Intent(ctx, TrackingService.class);
        if (gate == GateEvaluator.Gate.RECORDING || gate == GateEvaluator.Gate.WAITING_CLOCKIN) {
            // A location foreground service may only be started while the
            // location permission is held. On a fresh install the recording
            // policy arms at sign-in (owners default on) BEFORE the setup
            // wizard's location step grants that permission, and an
            // unguarded startForegroundService then throws SecurityException
            // in the caller — the app died on every open for a fresh owner
            // install (2026-10-25, Amanda). Tracking must never be able to
            // crash the app: skip the start while the permission is missing
            // (the permission callbacks and the wizard re-evaluate when it
            // is granted), and swallow any platform refusal (e.g. a
            // background start after reboot) — the service re-arms on the
            // next open, resume, or policy push.
            if (!StatusReporter.foregroundLocationGranted(ctx)) return;
            try {
                if (Build.VERSION.SDK_INT >= 26) {
                    ctx.startForegroundService(svc);
                } else {
                    ctx.startService(svc);
                }
            } catch (RuntimeException ignored) {
                // ForegroundServiceStartNotAllowedException / SecurityException.
            }
            scheduleWatchdog(ctx);
        } else {
            try { ctx.stopService(svc); } catch (RuntimeException ignored) {}
        }
    }

    // -------------------------------------------------------------- watchdog

    /**
     * Survival chain (1.0.4). Before 1.0.4 the service's only resurrection
     * paths were a reboot (BootReceiver) and somebody opening the app —
     * and several OEM builds suppress the START_STICKY restart after the
     * task is swiped away, so a killed watcher could stay dead for days
     * while its notification-free absence looked exactly like "armed".
     * This one-shot alarm re-evaluates the gate every ~30 minutes while
     * tracking is armed; the watchdog broadcast itself calls reevaluate,
     * which re-arms the service if needed and schedules the next beat.
     * It only ever runs while the gate is armed (it is scheduled solely
     * from the armed branch above), and nothing here survives a
     * force-stop — Android reserves that kill for the user, honestly.
     */
    private static final long WATCHDOG_MS = 30L * 60L * 1000L;
    private static final int WATCHDOG_REQUEST = 3802;

    private static void scheduleWatchdog(Context ctx) {
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent i = new Intent(ctx, BootReceiver.class).setAction(BootReceiver.ACTION_WATCHDOG);
            PendingIntent pi = PendingIntent.getBroadcast(ctx, WATCHDOG_REQUEST, i,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,
                    System.currentTimeMillis() + WATCHDOG_MS, pi);
        } catch (Exception ignored) {
            // Alarms are a resilience bonus, never a reason to fail a start.
        }
    }
}
