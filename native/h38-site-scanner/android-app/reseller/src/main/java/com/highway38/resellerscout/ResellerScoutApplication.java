package com.highway38.resellerscout;

import android.app.Activity;
import android.app.Application;
import android.os.Bundle;
import android.webkit.CookieManager;

/**
 * Scout application shell. v2.5 keeps retailer/Facebook WebView sessions on-device
 * and explicitly flushes the shared WebView cookie jar whenever an activity stops.
 * Cookie values never leave the phone.
 */
public final class ResellerScoutApplication extends Application {
    public static final String LEGACY_OPPORTUNITY_SCANNER_REMOVED_V1 =
            "LEGACY_OPPORTUNITY_SCANNER_REMOVED_V1";
    public static final String PERSIST_DEVICE_WEB_SESSIONS_V250 =
            "PERSIST_DEVICE_WEB_SESSIONS_V250";

    @Override public void onCreate() {
        super.onCreate();
        registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks() {
            @Override public void onActivityCreated(Activity a, Bundle b) {}
            @Override public void onActivityStarted(Activity a) {}
            @Override public void onActivityResumed(Activity a) {
                if (a instanceof MainActivity) NativeLoginOverlay.attach(a);
            }
            @Override public void onActivityPaused(Activity a) { flushWebCookies(); }
            @Override public void onActivityStopped(Activity a) { flushWebCookies(); }
            @Override public void onActivitySaveInstanceState(Activity a, Bundle b) {}
            @Override public void onActivityDestroyed(Activity a) { flushWebCookies(); }
        });
    }

    @Override public void onTrimMemory(int level) {
        flushWebCookies();
        super.onTrimMemory(level);
    }

    private static void flushWebCookies() {
        try { CookieManager.getInstance().flush(); }
        catch (Throwable ignored) {}
    }
}
