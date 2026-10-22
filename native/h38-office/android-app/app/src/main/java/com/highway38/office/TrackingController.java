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
            if (Build.VERSION.SDK_INT >= 26) {
                ctx.startForegroundService(svc);
            } else {
                ctx.startService(svc);
            }
        } else {
            ctx.stopService(svc);
        }
    }
}
