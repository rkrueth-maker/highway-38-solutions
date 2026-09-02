package com.highway38.resellerscout;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import android.view.View;
import android.view.ViewGroup;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.Until;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.Collection;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@RunWith(AndroidJUnit4.class)
public class RemoteOwnerUxTest {
    private static final long SHORT = 8_000;
    private Instrumentation instrumentation;
    private UiDevice device;
    private Bundle args;

    @Before
    public void launchOwnerApp() throws Exception {
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
        assertTrue("Owner WebView did not render login or Discover", waitForDom("Sign in", 20_000) || waitForDom("Find anything worth reselling", 2_000));
    }

    @Test
    public void knownDefect00ProfitFirstFacebookSourcing() throws Exception {
        signInAsOwnerIfNeeded();
        ensureDiscover();
        assertTrue("Profit-first Facebook status missing", waitForDom("PROFIT-FIRST FACEBOOK", 15_000));
        assertTrue("Profit-first Facebook resale lanes missing", domContains("resale lanes"));
        assertTrue("Profit-first Facebook action missing", clickText("Hunt profitable Facebook deals"));
        boolean completed = waitUntil(150_000, () -> {
            String body = bodyText();
            return Pattern.compile("\\b[1-9][0-9]* candidates\\b").matcher(body).find()
                    || body.contains("No public Marketplace cards were found")
                    || body.contains("Local Facebook inventory remains unknown")
                    || body.contains("No ranked local-listing matches yet");
        });
        assertTrue("Facebook sourcing produced neither candidates nor explicit provider truth", completed);
        assertFalse("Stale lawn-care card resurfaced", domContains("Lawn care equipment"));
        assertFalse("Stale DG Inventory Checker query resurfaced", domContains("Dollar General Inventory Checker"));
    }

    @Test
    public void knownDefect01FacebookFridgeSearch() throws Exception {
        signInAsOwnerIfNeeded();
        ensureDiscover();
        assertTrue("Discover search input unavailable", setDiscoverSearch("fridge"));
        assertTrue("Discover Search button missing", clickText("Search"));
        assertTrue("fridge query was overwritten", waitUntil(10_000, () -> domInputValueContains("fridge")));
        boolean completed = waitUntil(95_000, () -> {
            String body = bodyText().toLowerCase();
            return body.contains("refrigerator") || body.contains("fridge")
                    || body.contains("no public marketplace cards were found")
                    || body.contains("local facebook inventory remains unknown")
                    || body.contains("no ranked local-listing matches yet");
        });
        assertTrue("Fridge search produced no relevant result/provider truth", completed);
        assertFalse("Known stale lawn-care card resurfaced", domContains("Lawn care equipment"));
        assertFalse("Known stale DG Inventory Checker query resurfaced", domContains("Dollar General Inventory Checker"));
    }

    @Test
    public void knownDefect02LocalSalesInAuctions() throws Exception {
        signInAsOwnerIfNeeded();
        assertTrue("Auctions nav missing", clickText("Auctions"));
        assertTrue("Auctions page did not render", waitForDom("Real multi-source auction ingestion", 15_000));
        assertTrue("Local sales/Craigslist surface missing", domContains("Local sales") || domContains("Craigslist"));
        assertFalse("Known non-sale cattle listing resurfaced", domContains("Red angus bull"));
        assertFalse("Known non-sale trolling-motor listing resurfaced", domContains("Mercury trolling motor"));
    }

    @Test
    public void knownDefect03DollarGeneralIdentityAndPhotos() throws Exception {
        signInAsOwnerIfNeeded();
        assertTrue("Hunt nav missing", clickText("Hunt"));
        assertTrue("DG quality gate did not render", waitForDom("DG QUALITY:", 25_000));
        final int[] counts = new int[]{0, 0};
        boolean reached = waitUntil(120_000, () -> {
            int[] now = parseDgQuality(bodyText());
            counts[0] = now[0]; counts[1] = now[1];
            return now[0] > 0 && now[1] * 100 >= now[0] * 90;
        });
        assertTrue("Dollar General has no specifically named products", counts[0] > 0);
        assertTrue("DG verified image coverage did not reach 90%; named=" + counts[0] + " images=" + counts[1], reached);
        assertFalse("Generic Dollar General Inventory Checker title is visible", domContains("Dollar General Inventory Checker"));
        assertFalse("Malformed anchor markup leaked into product titles", domContains("target=\"_blank\"") || domContains("rel=\"noopener\"") || domContains("#0000ff"));
        assertFalse("Known DG UPC/title mismatch returned", domContains("840797136519") && domContains("Beech-Nut Veggies Stage 2 Baby Food"));
    }

    @Test
    public void knownDefect04NavigationRoundTrip() throws Exception {
        signInAsOwnerIfNeeded();
        assertTrue("Scan nav missing", clickText("Scan"));
        assertTrue("Scan page failed", waitForDom("Scan / Research", SHORT));
        assertTrue("Track nav missing", clickText("Track"));
        assertTrue("Track page failed", waitForDom("Tracked", SHORT));
        assertTrue("Discover nav missing", clickText("Discover"));
        assertTrue("Discover failed after round trip", waitForDom("Find anything worth reselling", SHORT));
    }

    @Test
    public void knownDefect05GarageSaleDiscovery() throws Exception {
        signInAsOwnerIfNeeded();
        ensureDiscover();
        assertTrue("Garage & estate sales module missing", waitForDom("Garage & estate sales", 15_000));
        assertTrue("Find garage sales action missing", clickText("Find garage sales"));
        boolean completed = waitUntil(100_000, () -> {
            String body = bodyText().toUpperCase();
            return body.contains("GARAGE SALE") || body.contains("YARD SALE") || body.contains("RUMMAGE SALE")
                    || body.contains("MOVING SALE") || body.contains("ESTATE SALE") || body.contains("NO SALE LEADS LOADED YET");
        });
        assertTrue("Garage-sale acquisition produced no sale-level provider result", completed);
        assertFalse("Known cattle classified leaked into garage-sale discovery", domContains("Red angus bull"));
    }

    private void signInAsOwnerIfNeeded() throws Exception {
        if (!domContains("Sign in")) {
            assertTrue("Owner session did not reach Discover", waitForDom("Find anything worth reselling", 20_000));
            return;
        }
        String email = requiredArg("SCOUT_EMAIL");
        String password = requiredArg("SCOUT_PASSWORD");
        String js = "(function(){var e=document.getElementById('h38OwnerEmail')||document.querySelector('input[type=email]');"
                + "var p=document.getElementById('h38OwnerPassword')||document.querySelector('input[type=password]');"
                + "var b=document.getElementById('h38OwnerSignIn')||Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()==='Sign in');"
                + "if(!e||!p||!b)return false;"
                + "e.value=" + JSONObject.quote(email) + ";p.value=" + JSONObject.quote(password) + ";"
                + "['input','change'].forEach(t=>{e.dispatchEvent(new Event(t,{bubbles:true}));p.dispatchEvent(new Event(t,{bubbles:true}));});"
                + "b.click();return true;})()";
        assertTrue("Could not submit owner login through WebView DOM", boolEval(js));
        assertTrue("Owner login must reach Discover", waitForDom("Find anything worth reselling", 30_000));
    }

    private void ensureDiscover() throws Exception {
        if (domContains("Find anything worth reselling")) return;
        assertTrue("Discover nav missing", clickText("Discover"));
        assertTrue("Discover page did not render", waitForDom("Find anything worth reselling", 15_000));
    }

    private boolean setDiscoverSearch(String value) throws Exception {
        String q = JSONObject.quote(value);
        return boolEval("(function(){var a=Array.from(document.querySelectorAll('input')).filter(x=>x.type!=='email'&&x.type!=='password');"
                + "var e=a.find(x=>/search|find|item|deal/i.test((x.placeholder||'')+' '+(x.getAttribute('aria-label')||'')))||a[0];"
                + "if(!e)return false;e.focus();e.value=" + q + ";['input','change'].forEach(t=>e.dispatchEvent(new Event(t,{bubbles:true})));return true;})()");
    }

    private boolean domInputValueContains(String value) throws Exception {
        return boolEval("Array.from(document.querySelectorAll('input')).some(x=>(x.value||'').toLowerCase().includes(" + JSONObject.quote(value.toLowerCase()) + "))");
    }

    private boolean clickText(String text) throws Exception {
        String q = JSONObject.quote(text);
        return boolEval("(function(){var n=Array.from(document.querySelectorAll('button,a,[role=button]')).find(x=>(x.innerText||x.textContent||'').trim()===" + q + ");if(!n)return false;n.click();return true;})()");
    }

    private boolean waitForDom(String needle, long timeout) throws Exception {
        return waitUntil(timeout, () -> domContains(needle));
    }

    private boolean domContains(String needle) throws Exception {
        return boolEval("(document.body&&document.body.innerText||'').includes(" + JSONObject.quote(needle) + ")");
    }

    private String bodyText() throws Exception {
        return stringEval("document.body?document.body.innerText:''");
    }

    private int[] parseDgQuality(String body) {
        Matcher m = Pattern.compile("DG QUALITY:\\s*(\\d+) named\\s*[·|]\\s*(\\d+) (?:verified )?images", Pattern.CASE_INSENSITIVE).matcher(body == null ? "" : body);
        if (!m.find()) return new int[]{0, 0};
        return new int[]{Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2))};
    }

    private String requiredArg(String key) {
        String value = args.getString(key, "").trim();
        assertFalse(key + " instrumentation argument is required", value.isEmpty());
        return value;
    }

    private WebView webView() throws Exception {
        AtomicReference<WebView> out = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);
        instrumentation.runOnMainSync(() -> {
            Collection<Activity> activities = ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED);
            if (!activities.isEmpty()) {
                Activity activity = activities.iterator().next();
                out.set(findWebView(activity.getWindow().getDecorView()));
            }
            latch.countDown();
        });
        latch.await(2, TimeUnit.SECONDS);
        return out.get();
    }

    private WebView findWebView(View view) {
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

    private String eval(String javascript) throws Exception {
        WebView web = null;
        long end = System.currentTimeMillis() + 10_000;
        while (web == null && System.currentTimeMillis() < end) {
            web = webView();
            if (web == null) Thread.sleep(250);
        }
        assertNotNull("Active Scout WebView not found", web);
        AtomicReference<String> result = new AtomicReference<>("null");
        CountDownLatch latch = new CountDownLatch(1);
        WebView finalWeb = web;
        assertTrue("Scout WebView rejected JS dispatch", finalWeb.post(() -> finalWeb.evaluateJavascript(javascript, value -> { result.set(value); latch.countDown(); })));
        assertTrue("WebView JavaScript result timed out", latch.await(10, TimeUnit.SECONDS));
        return result.get();
    }

    private boolean boolEval(String javascript) throws Exception {
        return "true".equals(eval(javascript));
    }

    private String stringEval(String javascript) throws Exception {
        String raw = eval(javascript);
        if (raw == null || "null".equals(raw)) return "";
        try { return new JSONArray("[" + raw + "]").getString(0); }
        catch (Exception ignored) { return raw; }
    }

    private interface CheckedCondition { boolean get() throws Exception; }

    private boolean waitUntil(long timeout, CheckedCondition condition) throws Exception {
        long end = System.currentTimeMillis() + timeout;
        do {
            try { if (condition.get()) return true; } catch (AssertionError e) { throw e; } catch (Exception ignored) { }
            Thread.sleep(500);
        } while (System.currentTimeMillis() < end);
        return false;
    }
}
