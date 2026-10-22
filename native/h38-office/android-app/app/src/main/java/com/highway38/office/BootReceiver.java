package com.highway38.office;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Re-arms tracking after a reboot. The service re-evaluates the recording
 * policy on start and stops itself if the gate is off, so this receiver only
 * needs to nudge it when a signed-in setup exists.
 */
public final class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context ctx, Intent intent) {
        if (intent == null || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        if (!PolicyStore.setupComplete(ctx)) return;
        if (!PolicyStore.loadSession(ctx).present()) return;
        TrackingController.reevaluate(ctx);
    }
}
