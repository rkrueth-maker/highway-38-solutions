package com.highway38.office;

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
        } else {
            try { ctx.stopService(svc); } catch (RuntimeException ignored) {}
        }
    }
}
