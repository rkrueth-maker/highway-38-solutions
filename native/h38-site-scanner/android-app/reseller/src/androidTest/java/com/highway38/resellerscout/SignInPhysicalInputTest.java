package com.highway38.resellerscout;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.Until;

import org.json.JSONArray;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.Collection;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public class SignInPhysicalInputTest {
    private Instrumentation instrumentation;
    private UiDevice device;
    private Bundle args;

    @Before public void launchOwnerApp() throws Exception {
        instrumentation = InstrumentationRegistry.getInstrumentation();
        device = UiDevice.getInstance(instrumentation);
        args = InstrumentationRegistry.getArguments();
        device.pressHome();
        Context target = instrumentation.getTargetContext();
        Intent intent = target.getPackageManager().getLaunchIntentForPackage(target.getPackageName());
        assertNotNull("Owner app launch intent must exist", intent);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK | Intent.FLAG_ACTIVITY_NEW_TASK);
        target.startActivity(intent);
        assertTrue("Owner package did not become visible", device.wait(Until.hasObject(By.pkg(target.getPackageName()).depth(0)), 15_000));
        assertTrue("Owner login form did not render", waitUntil(20_000, () -> boolEval("!!document.querySelector('#loginForm input[name=email]')&&!!document.querySelector('#loginForm input[name=password]')")));
    }

    @Test public void androidInputCanSignInThroughOriginalForm() throws Exception {
        String email = requiredArg("SCOUT_EMAIL");
        String password = requiredArg("SCOUT_PASSWORD");

        tapSelector("#loginForm input[name=email]");
        assertTrue("Email field did not take physical focus", waitUntil(3_000, () -> boolEval("document.activeElement===document.querySelector('#loginForm input[name=email]')")));
        device.executeShellCommand("input text " + shellQuote(email));
        assertTrue("Android input did not reach email field", waitUntil(3_000, () -> boolEval("(document.querySelector('#loginForm input[name=email]').value||'').length>3")));

        tapSelector("#loginForm input[name=password]");
        assertTrue("Password field did not take physical focus", waitUntil(3_000, () -> boolEval("document.activeElement===document.querySelector('#loginForm input[name=password]')")));
        device.executeShellCommand("input text " + shellQuote(password));
        assertTrue("Android input did not reach password field", waitUntil(3_000, () -> boolEval("(document.querySelector('#loginForm input[name=password]').value||'').length>0")));

        tapSelector("#loginForm button[type=submit]");
        assertTrue("Physical owner sign-in did not reach Discover", waitUntil(30_000, () -> boolEval("!document.getElementById('appView').classList.contains('hidden')&&document.body.innerText.includes('Find anything worth reselling')")));
    }

    private String requiredArg(String key) {
        String value = args.getString(key, "");
        assertTrue("Missing instrumentation arg " + key, value != null && !value.isBlank());
        return value;
    }

    private String shellQuote(String value) {
        return "'" + value.replace("'", "'\\''") + "'";
    }

    private void tapSelector(String selector) throws Exception {
        String js = "(function(){var e=document.querySelector(" + org.json.JSONObject.quote(selector) + ");if(!e)return null;var r=e.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2,document.documentElement.clientWidth];})()";
        JSONArray rect = new JSONArray(eval(js));
        WebView web = webView();
        assertNotNull("Active Scout WebView not found", web);
        int[] loc = new int[2];
        int[] width = new int[1];
        instrumentation.runOnMainSync(() -> { web.getLocationOnScreen(loc); width[0] = web.getWidth(); });
        double cssWidth = rect.getDouble(2);
        double scale = cssWidth > 0 ? width[0] / cssWidth : 1.0;
        int x = loc[0] + (int)Math.round(rect.getDouble(0) * scale);
        int y = loc[1] + (int)Math.round(rect.getDouble(1) * scale);
        assertTrue("Tap coordinate outside display", x >= 0 && y >= 0 && x < device.getDisplayWidth() && y < device.getDisplayHeight());
        device.click(x, y);
        device.waitForIdle(500);
    }

    private WebView webView() {
        AtomicReference<WebView> out = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> {
            Collection<Activity> activities = ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED);
            if (!activities.isEmpty()) {
                Activity activity = activities.iterator().next();
                out.set(findWebView(activity.getWindow().getDecorView()));
            }
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
        while (web == null && System.currentTimeMillis() < end) {
            web = webView();
            if (web == null) Thread.sleep(150);
        }
        assertNotNull("Active Scout WebView not found", web);
        AtomicReference<String> result = new AtomicReference<>("null");
        CountDownLatch latch = new CountDownLatch(1);
        WebView finalWeb = web;
        finalWeb.post(() -> finalWeb.evaluateJavascript(javascript, value -> { result.set(value == null ? "null" : value); latch.countDown(); }));
        assertTrue("WebView JavaScript result timed out", latch.await(8, TimeUnit.SECONDS));
        return result.get();
    }

    private boolean boolEval(String js) throws Exception { return "true".equals(eval(js)); }

    private boolean waitUntil(long timeoutMs, Checked condition) throws Exception {
        long end = System.currentTimeMillis() + timeoutMs;
        do { if (condition.run()) return true; Thread.sleep(200); } while (System.currentTimeMillis() < end);
        return false;
    }

    private interface Checked { boolean run() throws Exception; }
}
