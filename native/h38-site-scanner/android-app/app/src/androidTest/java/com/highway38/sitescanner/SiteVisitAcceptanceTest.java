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
    private static final String SITE_VISIT_CONTRACT =
            "JSON.stringify({meeting:typeof window.H38_SITE_VISIT_MEETING_SEED?.finishVisit==='function',"
                    + "report:window.H38_SITE_VISIT_FINISH_PERSISTENCE?.durableVisitReport===true,"
                    + "offline:window.H38_SITE_VISIT_FINISH_PERSISTENCE?.offlineQueue===true,"
                    + "noAutoApproval:window.H38_SITE_VISIT_FINISH_PERSISTENCE?.automaticApproval===false,"
                    + "phone:window.H38_SITE_VISIT_FINAL_PHONE_REPAIR?.legacySiteVisitChromeRemoved===true,"
                    + "workspace:window.H38_SITE_VISIT_MOBILE_WORKSPACE_V3?.workspaceRebuild===true,"
                    + "capture:window.H38_SITE_VISIT_MOBILE_WORKSPACE_V3?.singleCaptureRow===true,"
                    + "analysis:window.H38_SITE_VISIT_MOBILE_WORKSPACE_V3?.dimensionAnalysisButton===true,"
                    + "legacy:window.H38_SITE_VISIT_MOBILE_WORKSPACE_V3?.noLegacyStageRail===true,"
                    + "duplicates:window.H38_SITE_VISIT_MOBILE_WORKSPACE_V3?.noDuplicateCaptureButtons===true})";

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

    private boolean fullSiteVisitContract(String snapshot) {
        return snapshot.contains("\\\"meeting\\\":true")
                && snapshot.contains("\\\"report\\\":true")
                && snapshot.contains("\\\"offline\\\":true")
                && snapshot.contains("\\\"noAutoApproval\\\":true")
                && snapshot.contains("\\\"phone\\\":true")
                && snapshot.contains("\\\"workspace\\\":true")
                && snapshot.contains("\\\"capture\\\":true")
                && snapshot.contains("\\\"analysis\\\":true")
                && snapshot.contains("\\\"legacy\\\":true")
                && snapshot.contains("\\\"duplicates\\\":true");
    }

    private void forceFreshSiteVisitAuthorities(WebView webView) throws Exception {
        String cacheBust = String.valueOf(System.currentTimeMillis());
        String expression = "(()=>{const base='./';const build='android-acceptance-" + cacheBust
                + "';for(const file of ['site-visit-meeting-seed.js','site-visit-finish-persistence.js','site-visit-final-phone-repair.js','site-visit-mobile-workspace-v3.js']){const s=document.createElement('script');s.src=base+file+'?build='+build;s.async=false;s.dataset.h38AndroidAcceptanceRefresh='1';document.head.appendChild(s);}return true;})()";
        assertEquals("true", js(webView, expression));
    }

    private String waitForFinalSiteVisitAuthorities(WebView webView) throws Exception {
        long firstDeadline = System.currentTimeMillis() + 8_000;
        String snapshot = "";
        while (System.currentTimeMillis() < firstDeadline) {
            snapshot = js(webView, SITE_VISIT_CONTRACT);
            if (fullSiteVisitContract(snapshot)) return snapshot;
            Thread.sleep(500);
        }

        // PR Android CI runs against the currently deployed Office while the candidate web fix is
        // still unmerged. If WebView/CDN cache serves stale authority objects, reload the canonical
        // production assets with a one-use cache key and verify the full behavioral contract.
        forceFreshSiteVisitAuthorities(webView);
        long deadline = System.currentTimeMillis() + 45_000;
        while (System.currentTimeMillis() < deadline) {
            snapshot = js(webView, SITE_VISIT_CONTRACT);
            if (fullSiteVisitContract(snapshot)) return snapshot;
            Thread.sleep(500);
        }
        throw new AssertionError("Final Site Visit behavioral authorities did not load: " + snapshot);
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

            String contract = waitForFinalSiteVisitAuthorities(webView);
            assertTrue("Site Visit meeting/finish authority missing: " + contract, contract.contains("\\\"meeting\\\":true"));
            assertTrue("Durable Visit Report authority missing: " + contract, contract.contains("\\\"report\\\":true"));
            assertTrue("Offline Site Visit queue contract missing: " + contract, contract.contains("\\\"offline\\\":true"));
            assertTrue("Site Visit must never auto-approve: " + contract, contract.contains("\\\"noAutoApproval\\\":true"));
            assertTrue("Final phone repair authority missing: " + contract, contract.contains("\\\"phone\\\":true"));
            assertTrue("Mobile Site Visit workspace missing: " + contract, contract.contains("\\\"workspace\\\":true"));
            assertTrue("Single capture row contract missing: " + contract, contract.contains("\\\"capture\\\":true"));
            assertTrue("Dimension analysis contract missing: " + contract, contract.contains("\\\"analysis\\\":true"));
            assertTrue("Legacy Site Visit stage rail is not suppressed: " + contract, contract.contains("\\\"legacy\\\":true"));
            assertTrue("Duplicate capture controls are not suppressed: " + contract, contract.contains("\\\"duplicates\\\":true"));
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
