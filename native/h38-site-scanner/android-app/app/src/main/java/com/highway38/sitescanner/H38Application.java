package com.highway38.sitescanner;

import android.app.Activity;
import android.app.Application;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.View;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewRenderProcess;

import java.lang.ref.WeakReference;
import java.lang.reflect.Field;

/**
 * Native owner-phone watchdog for the published Business Office WebView.
 *
 * CameraX can remain healthy while the WebView renderer is alive-but-wedged.
 * JavaScript timers cannot recover that state because they run in the wedged
 * renderer. This watchdog runs from the Android process, probes the renderer,
 * and terminates only a renderer that fails to answer a trivial JS probe.
 * MainActivity.onRenderProcessGone() remains the authority that recreates the
 * WebView and preserves pending walkthrough evidence.
 */
public final class H38Application extends Application implements Application.ActivityLifecycleCallbacks {
    private static final String PREFS = "h38-walkthrough-capture";
    private static final String LAST_FORCED_RENDERER_RECOVERY = "last_forced_renderer_recovery_ms";
    private static final long FIRST_PROBE_DELAY_MS = 6500L;
    private static final long PROBE_RESPONSE_TIMEOUT_MS = 4000L;
    private static final long RESPONSIVE_STARTUP_FAIL_OPEN_MS = 15000L;
    private static final long MIN_FORCED_RECOVERY_GAP_MS = 45000L;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private WeakReference<MainActivity> currentMain = new WeakReference<>(null);
    private int generation;
    private long resumedAt;
    private boolean responsiveRendererSeen;
    private boolean failOpenApplied;

    @Override
    public void onCreate() {
        super.onCreate();
        registerActivityLifecycleCallbacks(this);
    }

    @Override
    public void onActivityResumed(Activity activity) {
        if (!(activity instanceof MainActivity)) return;
        MainActivity main = (MainActivity) activity;
        currentMain = new WeakReference<>(main);
        generation++;
        resumedAt = SystemClock.elapsedRealtime();
        responsiveRendererSeen = false;
        failOpenApplied = false;
        final int token = generation;
        mainHandler.postDelayed(() -> probeOffice(main, token), FIRST_PROBE_DELAY_MS);
    }

    @Override
    public void onActivityPaused(Activity activity) {
        if (activity instanceof MainActivity) generation++;
    }

    private void probeOffice(MainActivity activity, int token) {
        if (!isCurrent(activity, token)) return;
        WebView webView = webView(activity);
        if (webView == null) return;

        final boolean[] answered = { false };
        try {
            webView.evaluateJavascript(
                    "(function(){try{var m=document.getElementById('mainContent');var n=document.getElementById('mainNav');var t=String(m&&m.textContent||'');var actionable=/sign in|session expired|access denied|could not open|membership suspended|membership revoked|no active membership/i.test(t);var ready=!!(window.state&&window.state.businessId&&window.state.snapshot&&n&&n.querySelector('button'));return ready||actionable;}catch(e){return false;}})();",
                    value -> {
                        answered[0] = true;
                        if (!isCurrent(activity, token)) return;
                        responsiveRendererSeen = true;
                        if ("true".equals(String.valueOf(value))) {
                            clearForcedRecoveryAge();
                            return;
                        }
                        long elapsed = SystemClock.elapsedRealtime() - resumedAt;
                        if (elapsed >= RESPONSIVE_STARTUP_FAIL_OPEN_MS && !failOpenApplied) {
                            failOpenApplied = true;
                            exposeUnderlyingOffice(webView);
                            Toast.makeText(
                                    activity,
                                    "Highway 38 startup is taking too long. Showing the Business Office recovery state.",
                                    Toast.LENGTH_LONG
                            ).show();
                            return;
                        }
                        mainHandler.postDelayed(() -> probeOffice(activity, token), 1800L);
                    }
            );
        } catch (Throwable ignored) {
        }

        mainHandler.postDelayed(() -> {
            if (!isCurrent(activity, token) || answered[0]) return;
            forceHungRendererRecovery(activity, webView);
        }, PROBE_RESPONSE_TIMEOUT_MS);
    }

    private void exposeUnderlyingOffice(WebView webView) {
        try {
            webView.evaluateJavascript(
                    "(function(){try{document.documentElement.classList.remove('h38-early-native-startup');var s=document.getElementById('h38EarlyNativeStartupStyle');if(s)s.remove();var h=document.getElementById('h38StartupHammer');if(h)h.classList.remove('show');return true;}catch(e){return false;}})();",
                    null
            );
        } catch (Throwable ignored) {
        }
    }

    private void forceHungRendererRecovery(MainActivity activity, WebView webView) {
        long now = System.currentTimeMillis();
        long last = getSharedPreferences(PREFS, MODE_PRIVATE)
                .getLong(LAST_FORCED_RENDERER_RECOVERY, 0L);
        if (now - last < MIN_FORCED_RECOVERY_GAP_MS) {
            exposeUnderlyingOffice(webView);
            return;
        }
        getSharedPreferences(PREFS, MODE_PRIVATE)
                .edit()
                .putLong(LAST_FORCED_RENDERER_RECOVERY, now)
                .apply();
        try {
            WebViewRenderProcess process = WebViewCompat.getWebViewRenderProcess(webView);
            if (process != null && process.terminate()) {
                Toast.makeText(
                        activity,
                        "Restoring Highway 38 after the web screen stopped responding.",
                        Toast.LENGTH_SHORT
                ).show();
                return;
            }
        } catch (Throwable ignored) {
        }
        try {
            activity.recreate();
        } catch (Throwable ignored) {
        }
    }

    private void clearForcedRecoveryAge() {
        getSharedPreferences(PREFS, MODE_PRIVATE)
                .edit()
                .remove(LAST_FORCED_RENDERER_RECOVERY)
                .apply();
    }

    private boolean isCurrent(MainActivity activity, int token) {
        return token == generation && currentMain.get() == activity && !activity.isFinishing();
    }

    private WebView webView(MainActivity activity) {
        try {
            Field field = MainActivity.class.getDeclaredField("webView");
            field.setAccessible(true);
            Object value = field.get(activity);
            return value instanceof WebView ? (WebView) value : null;
        } catch (Throwable ignored) {
            return null;
        }
    }

    @Override public void onActivityCreated(Activity activity, Bundle state) {}
    @Override public void onActivityStarted(Activity activity) {}
    @Override public void onActivityStopped(Activity activity) {}
    @Override public void onActivitySaveInstanceState(Activity activity, Bundle state) {}
    @Override public void onActivityDestroyed(Activity activity) {
        if (activity == currentMain.get()) {
            generation++;
            currentMain.clear();
        }
    }
}
