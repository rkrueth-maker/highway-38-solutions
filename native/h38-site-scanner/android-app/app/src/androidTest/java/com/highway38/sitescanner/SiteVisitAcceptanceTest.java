package com.highway38.sitescanner;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.webkit.WebView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public final class SiteVisitAcceptanceTest {
    private String js(WebView webView, String expression) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>("");
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
                webView.evaluateJavascript(expression, value -> {
                    result.set(value == null ? "" : value);
                    latch.countDown();
                })
        );
        assertTrue("JavaScript result timed out", latch.await(20, TimeUnit.SECONDS));
        return result.get();
    }

    private void waitForOffice(WebView webView) throws Exception {
        long deadline = System.currentTimeMillis() + 45_000;
        while (System.currentTimeMillis() < deadline) {
            String ready = js(webView, "Boolean(document.body && document.querySelector('#mainNav'))");
            if ("true".equals(ready)) return;
            Thread.sleep(500);
        }
        throw new AssertionError("Business Office did not load");
    }

    @Test
    public void ownerOfficeAndSiteVisitContractRemainStable() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<WebView> web = new AtomicReference<>();
            scenario.onActivity(activity -> web.set((WebView) activity.findViewById(
                    ((android.view.ViewGroup) activity.findViewById(android.R.id.content)).getChildAt(0).getId()
            )));
            // MainActivity owns one WebView; locate it safely if the content root wrapper changes.
            scenario.onActivity(activity -> {
                android.view.View root = activity.findViewById(android.R.id.content);
                web.set(findWebView(root));
            });
            WebView webView = web.get();
            assertTrue("Main WebView missing", webView != null);
            waitForOffice(webView);

            assertEquals("true", js(webView,
                    "location.href.startsWith('https://highway38solutions.com/commercial-app/')"));
            assertEquals("true", js(webView,
                    "document.querySelector('link[rel=icon]')?.href.includes('assets/highway38-logo.png')"));
            assertEquals("true", js(webView,
                    "document.querySelector('link[rel=icon]')?.href.includes('0cbc4514')"));

            String nav = js(webView,
                    "(()=>Array.from(document.querySelectorAll('[data-h38-owner-bottom-nav] button,.h38-owner-bottom-nav button')).map(x=>x.textContent.trim()).join('|'))()");
            if (!"\"\"".equals(nav)) {
                assertTrue(nav.contains("Today"));
                assertTrue(nav.contains("Customers"));
                assertTrue(nav.contains("Schedule"));
                assertTrue(nav.contains("Messages"));
                assertTrue(nav.contains("More"));
                assertFalse(nav.toLowerCase().contains("field view"));
            }

            String contract = js(webView,
                    "JSON.stringify({workspace:!!window.H38_SITE_VISIT_MOBILE_WORKSPACE_V3,report:!!window.H38_SITE_VISIT_FINISH_PERSISTENCE?.durableVisitReport,analysis:!!window.H38_SITE_VISIT_MOBILE_WORKSPACE_V3?.dimensionAnalysisButton,legacy:!!window.H38_SITE_VISIT_MOBILE_WORKSPACE_V3?.noLegacyStageRail,duplicates:!!window.H38_SITE_VISIT_MOBILE_WORKSPACE_V3?.noDuplicateCaptureButtons})");
            assertTrue(contract.contains("\\\"workspace\\\":true"));
            assertTrue(contract.contains("\\\"report\\\":true"));
            assertTrue(contract.contains("\\\"analysis\\\":true"));
            assertTrue(contract.contains("\\\"legacy\\\":true"));
            assertTrue(contract.contains("\\\"duplicates\\\":true"));
        }
    }

    private static WebView findWebView(android.view.View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof android.view.ViewGroup) {
            android.view.ViewGroup group = (android.view.ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                WebView found = findWebView(group.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }
}
