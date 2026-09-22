package com.highway38.resellerscout;

import android.os.Bundle;
import android.os.SystemClock;
import android.webkit.WebView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.Assert;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.lang.reflect.Field;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Physical-device gate for the owner-phone regression where tapping Sign in
 * left the hosted H38 Deals shell on the login screen without a session.
 */
@RunWith(AndroidJUnit4.class)
public final class HostedAuthInstrumentedTest {
    private static WebView webView(MainActivity activity) throws Exception {
        Field field = MainActivity.class.getDeclaredField("webView");
        field.setAccessible(true);
        return (WebView) field.get(activity);
    }

    private static String evaluate(ActivityScenario<MainActivity> scenario, String javascript) throws Exception {
        AtomicReference<String> value = new AtomicReference<>("not-run");
        CountDownLatch latch = new CountDownLatch(1);
        scenario.onActivity(activity -> {
            try {
                webView(activity).evaluateJavascript(javascript, result -> {
                    value.set(result == null ? "null" : result);
                    latch.countDown();
                });
            } catch (Throwable error) {
                value.set("exception:" + error.getClass().getSimpleName() + ":" + error.getMessage());
                latch.countDown();
            }
        });
        latch.await(8, TimeUnit.SECONDS);
        return value.get();
    }

    @Test public void realCredentialsCreateSessionAndShowProductChooser() throws Exception {
        Bundle args = InstrumentationRegistry.getArguments();
        String email = args.getString("SCOUT_EMAIL", "").trim();
        String password = args.getString("SCOUT_PASSWORD", "");
        Assert.assertFalse("SCOUT_EMAIL instrumentation argument is missing", email.isEmpty());
        Assert.assertFalse("SCOUT_PASSWORD instrumentation argument is missing", password.isEmpty());

        AtomicReference<String> last = new AtomicReference<>("not-run");
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            long readyDeadline = SystemClock.elapsedRealtime() + 45000L;
            while (SystemClock.elapsedRealtime() < readyDeadline) {
                String ready = evaluate(scenario,
                        "(function(){return !!document.getElementById('loginForm')" +
                                "&&!!document.getElementById('email')" +
                                "&&!!document.getElementById('password')" +
                                "&&!!document.getElementById('signin')" +
                                "&&document.body.dataset.h38LoginRepair==='v316-deal-engine';})()");
                last.set("ready=" + ready);
                if ("true".equalsIgnoreCase(ready)) break;
                SystemClock.sleep(1000L);
            }
            Assert.assertEquals("H38 login shell did not become ready. Last=" + last.get(), "true",
                    evaluate(scenario,
                            "(function(){return !!document.getElementById('loginForm')" +
                                    "&&document.body.dataset.h38LoginRepair==='v316-deal-engine';})()"));

            String submit = "(function(){" +
                    "var e=document.getElementById('email'),p=document.getElementById('password'),f=document.getElementById('loginForm');" +
                    "if(!e||!p||!f)return 'missing-form';" +
                    "e.value=" + JSONObject.quote(email) + ";" +
                    "p.value=" + JSONObject.quote(password) + ";" +
                    "e.dispatchEvent(new Event('input',{bubbles:true}));" +
                    "p.dispatchEvent(new Event('input',{bubbles:true}));" +
                    "if(typeof f.requestSubmit==='function')f.requestSubmit();" +
                    "else f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));" +
                    "return 'submitted';})()";
            Assert.assertEquals("\"submitted\"", evaluate(scenario, submit));

            long authDeadline = SystemClock.elapsedRealtime() + 45000L;
            while (SystemClock.elapsedRealtime() < authDeadline) {
                String probe = evaluate(scenario,
                        "(function(){" +
                                "var products=document.getElementById('products');" +
                                "var out=document.getElementById('signout');" +
                                "var penny=document.getElementById('product-penny');" +
                                "var resale=document.getElementById('product-resale');" +
                                "var coupon=document.getElementById('product-coupon');" +
                                "return document.body.dataset.h38Auth==='signed-in'" +
                                "&&!!products&&!products.classList.contains('hidden')" +
                                "&&!!out&&!out.classList.contains('hidden')" +
                                "&&!!penny&&!!resale&&!!coupon;" +
                                "})()");
                last.set(probe);
                if ("true".equalsIgnoreCase(probe)) {
                    return;
                }
                SystemClock.sleep(1000L);
            }
        }
        Assert.fail("H38 physical sign-in/session/product chooser failed. Last DOM state=" + last.get());
    }
}
