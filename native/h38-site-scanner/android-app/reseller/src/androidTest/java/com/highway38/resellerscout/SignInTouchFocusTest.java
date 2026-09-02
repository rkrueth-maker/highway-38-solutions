package com.highway38.resellerscout;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import androidx.test.uiautomator.UiDevice;

import org.json.JSONArray;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.Collection;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public class SignInTouchFocusTest {
    private Instrumentation instrumentation;
    private UiDevice device;

    @Before public void launchOwnerApp() throws Exception {
        instrumentation = InstrumentationRegistry.getInstrumentation();
        device = UiDevice.getInstance(instrumentation);
        device.pressHome();
        Context target = instrumentation.getTargetContext();
        Intent intent = target.getPackageManager().getLaunchIntentForPackage(target.getPackageName());
        assertNotNull("Owner app launch intent must exist", intent);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK | Intent.FLAG_ACTIVITY_NEW_TASK);
        target.startActivity(intent);
        assertTrue("Login inputs did not render", waitUntil(20_000, () -> boolEval("!!document.getElementById('h38OwnerEmail')&&!!document.getElementById('h38OwnerPassword')")));
    }

    @Test public void physicalTapFocusesEmailAndPasswordFields() throws Exception {
        tapDomCenter("h38OwnerEmail");
        assertTrue("Physical tap did not focus email input", waitUntil(3_000, () -> boolEval("document.activeElement===document.getElementById('h38OwnerEmail')")));
        device.executeShellCommand("input text h38focus");
        assertTrue("Focused email input did not accept device text", waitUntil(3_000, () -> boolEval("(document.getElementById('h38OwnerEmail').value||'').includes('h38focus')")));

        tapDomCenter("h38OwnerPassword");
        assertTrue("Physical tap did not focus password input", waitUntil(3_000, () -> boolEval("document.activeElement===document.getElementById('h38OwnerPassword')")));
        device.executeShellCommand("input text h38pass");
        assertTrue("Focused password input did not accept device text", waitUntil(3_000, () -> boolEval("(document.getElementById('h38OwnerPassword').value||'').includes('h38pass')")));
    }

    private void tapDomCenter(String id) throws Exception {
        JSONArray rect = new JSONArray(eval("(function(){var e=document.getElementById('" + id + "');if(!e)return null;var r=e.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2,document.documentElement.clientWidth];})()"));
        WebView web = webView();
        assertNotNull("Active Scout WebView not found", web);
        int[] loc = new int[2];
        int[] width = new int[1];
        instrumentation.runOnMainSync(() -> { web.getLocationOnScreen(loc); width[0] = web.getWidth(); });
        double cssWidth = rect.getDouble(2);
        double scale = width[0] / Math.max(1.0, cssWidth);
        int x = (int)Math.round(loc[0] + rect.getDouble(0) * scale);
        int y = (int)Math.round(loc[1] + rect.getDouble(1) * scale);
        assertTrue("UiDevice tap failed", device.click(x, y));
        device.waitForIdle();
        Thread.sleep(350);
    }

    private WebView webView() {
        AtomicReference<WebView> out = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> {
            Collection<Activity> activities = ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED);
            if (!activities.isEmpty()) out.set(findWebView(activities.iterator().next().getWindow().getDecorView()));
        });
        return out.get();
    }

    private WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView)view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup)view;
            for (int i = 0; i < group.getChildCount(); i++) {
                WebView found = findWebView(group.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }

    private String eval(String javascript) throws Exception {
        WebView web = null;
        long end = System.currentTimeMillis() + 10_000;
        while (web == null && System.currentTimeMillis() < end) { web = webView(); if (web == null) Thread.sleep(150); }
        assertNotNull("Active Scout WebView not found", web);
        AtomicReference<String> out = new AtomicReference<>("null");
        CountDownLatch latch = new CountDownLatch(1);
        WebView finalWeb = web;
        finalWeb.post(() -> finalWeb.evaluateJavascript(javascript, value -> { out.set(value == null ? "null" : value); latch.countDown(); }));
        assertTrue("WebView JavaScript evaluation timed out", latch.await(8, TimeUnit.SECONDS));
        return out.get();
    }

    private boolean boolEval(String javascript) throws Exception { return "true".equals(eval(javascript)); }

    private interface CheckedBoolean { boolean get() throws Exception; }
    private boolean waitUntil(long timeoutMs, CheckedBoolean check) throws Exception {
        long end = System.currentTimeMillis() + timeoutMs;
        Throwable last = null;
        while (System.currentTimeMillis() < end) {
            try { if (check.get()) return true; } catch (Throwable t) { last = t; }
            Thread.sleep(200);
        }
        if (last instanceof Exception) throw (Exception)last;
        return false;
    }
}
