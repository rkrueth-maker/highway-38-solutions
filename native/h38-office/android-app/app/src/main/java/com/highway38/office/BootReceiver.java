package com.highway38.office;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Re-arms tracking when the phone or the app state changes underneath it:
 * after a reboot, after the app itself is updated in place (an update
 * kills the service process and nothing else would ever restart it —
 * 1.0.4), and on the controller's watchdog beat. The service re-evaluates
 * the recording policy on start and stops itself if the gate is off, so
 * this receiver only needs to nudge it when a signed-in setup exists.
 */
public final class BootReceiver extends BroadcastReceiver {

    /** Custom action for the TrackingController watchdog alarm. */
    public static final String ACTION_WATCHDOG = "com.highway38.office.action.TRACKING_WATCHDOG";

    @Override public void onReceive(Context ctx, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                && !ACTION_WATCHDOG.equals(action)) return;
        if (!PolicyStore.setupComplete(ctx)) return;
        if (!PolicyStore.loadSession(ctx).present()) return;
        TrackingController.reevaluate(ctx);
    }
}
