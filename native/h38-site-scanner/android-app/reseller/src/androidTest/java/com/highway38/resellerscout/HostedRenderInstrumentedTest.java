package com.highway38.resellerscout;

import android.os.SystemClock;
import android.webkit.WebView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.Assert;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.lang.reflect.Field;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Physical-device release gate for the exact regression seen on the owner phone. */
@RunWith(AndroidJUnit4.class)
public final class HostedRenderInstrumentedTest {
    @Test public void dealEngineRendersStyledHtmlInsteadOfSource() throws Exception {
        AtomicReference<String> last = new AtomicReference<>("not-run");
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                try {
                    Field field = MainActivity.class.getDeclaredField("webView");
                    field.setAccessible(true);
                    WebView webView = (WebView) field.get(activity);
                    webView.loadUrl("https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/h38-deal-engine-web");
                } catch (Throwable error) {
                    last.set("navigation-exception:" + error.getClass().getSimpleName() + ":" + error.getMessage());
                }
            });

            long deadline = SystemClock.elapsedRealtime() + 45000L;
            while (SystemClock.elapsedRealtime() < deadline) {
                CountDownLatch latch = new CountDownLatch(1);
                scenario.onActivity(activity -> {
                    try {
                        Field field = MainActivity.class.getDeclaredField("webView");
                        field.setAccessible(true);
                        WebView webView = (WebView) field.get(activity);
                        String probe = "(function(){" +
                                "var body=(document.body&&document.body.innerText||'').trim().toLowerCase();" +
                                "var wrap=document.querySelector('main.wrap');" +
                                "var top=document.querySelector('.top h1');" +
                                "var auth=document.getElementById('auth');" +
                                "var app=document.getElementById('app');" +
                                "return document.contentType==='text/html'" +
                                "&&document.title.indexOf('Today\\'s Best')===0" +
                                "&&!!wrap&&!!top&&top.textContent.trim()==='Today\\'s Best'" +
                                "&&(!!auth||!!app)" +
                                "&&!body.startsWith('<!doctype html')&&!body.startsWith('<html');" +
                                "})()";
                        webView.evaluateJavascript(probe, value -> {
                            last.set(value == null ? "null" : value);
                            latch.countDown();
                        });
                    } catch (Throwable error) {
                        last.set("exception:" + error.getClass().getSimpleName() + ":" + error.getMessage());
                        latch.countDown();
                    }
                });
                latch.await(6, TimeUnit.SECONDS);
                if ("true".equalsIgnoreCase(last.get())) return;
                SystemClock.sleep(1000L);
            }
        }
        Assert.fail("H38 Deal Engine did not render as HTML. Last probe=" + last.get());
    }

    @Test public void shellRendersStyledHtmlAndJavascriptInsteadOfSource() throws Exception {
        AtomicReference<String> last = new AtomicReference<>("not-run");
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            long deadline = SystemClock.elapsedRealtime() + 45000L;
            while (SystemClock.elapsedRealtime() < deadline) {
                CountDownLatch latch = new CountDownLatch(1);
                scenario.onActivity(activity -> {
                    try {
                        Field field = MainActivity.class.getDeclaredField("webView");
                        field.setAccessible(true);
                        WebView webView = (WebView) field.get(activity);
                        String probe = "(function(){" +
                                "var body=(document.body&&document.body.innerText||'').trim().toLowerCase();" +
                                "var hero=document.querySelector('.hero h1');" +
                                "var signin=document.getElementById('signin');" +
                                "var styled=hero&&getComputedStyle(hero).fontSize==='30px';" +
                                "return document.contentType==='text/html'" +
                                "&&document.title==='H38 Deals'" +
                                "&&hero&&hero.textContent.trim()==='H38 Deals'" +
                                "&&signin&&styled" +
                                "&&typeof window.supabase!=='undefined'" +
                                "&&!body.startsWith('<!doctype html')&&!body.startsWith('<html');" +
                                "})()";
                        webView.evaluateJavascript(probe, value -> {
                            last.set(value == null ? "null" : value);
                            latch.countDown();
                        });
                    } catch (Throwable error) {
                        last.set("exception:" + error.getClass().getSimpleName() + ":" + error.getMessage());
                        latch.countDown();
                    }
                });
                latch.await(6, TimeUnit.SECONDS);
                if ("true".equalsIgnoreCase(last.get())) return;
                SystemClock.sleep(1000L);
            }
        }
        Assert.fail("H38 hosted shell did not become rendered/styled/live HTML. Last probe=" + last.get());
    }
}
