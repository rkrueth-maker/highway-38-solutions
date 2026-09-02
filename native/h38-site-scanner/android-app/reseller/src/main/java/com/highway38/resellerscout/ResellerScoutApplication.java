package com.highway38.resellerscout;

import android.app.Activity;
import android.app.Application;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebView;

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
    public static final String PRESERVE_WEBVIEW_TEXT_INPUT_V318 =
            "PRESERVE_WEBVIEW_TEXT_INPUT_V318";

    @Override public void onCreate() {
        super.onCreate();
        registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks() {
            @Override public void onActivityCreated(Activity a, Bundle b) { prepareWebInputHost(a); }
            @Override public void onActivityStarted(Activity a) {}
            @Override public void onActivityResumed(Activity a) { prepareWebInputHost(a); }
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

    private static void prepareWebInputHost(Activity activity) {
        try {
            if (activity == null || activity.getWindow() == null) return;
            WebView web = findWebView(activity.getWindow().getDecorView());
            if (web == null) return;
            web.setFocusable(true);
            web.setFocusableInTouchMode(true);
            if (!web.hasFocus()) web.requestFocus(View.FOCUS_DOWN);
        } catch (Throwable ignored) {}
    }

    private static WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                WebView found = findWebView(group.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }

    private static void flushWebCookies() {
        try { CookieManager.getInstance().flush(); }
        catch (Throwable ignored) {}
    }
}
