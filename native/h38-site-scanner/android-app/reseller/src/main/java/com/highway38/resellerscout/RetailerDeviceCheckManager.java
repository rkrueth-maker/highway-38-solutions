package com.highway38.resellerscout;

import android.app.Activity;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Locale;
import java.util.Queue;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Device-side Home Depot / Dollar General verifier.
 *
 * v2.5 makes this the no-paid-provider fallback. Retailer cookies/store state stay
 * only in Android WebView storage. Price/quantity is accepted only when the
 * requested product and physical store can both be proven from retailer content.
 */
public final class RetailerDeviceCheckManager {
    public static final String DEVICE_STORE_BOUND_CHECK_V250 = "DEVICE_STORE_BOUND_CHECK_V250";
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final Queue<Job> QUEUE = new ArrayDeque<>();
    private static boolean running = false;
    private static volatile String extractorAsset;

    private RetailerDeviceCheckManager() {}

    public static void check(Activity activity, WebView scoutWebView, String requestId, String bodyJson) {
        if (activity == null || scoutWebView == null || requestId == null || requestId.isBlank()) return;
        JSONObject body;
        try { body = new JSONObject(bodyJson == null ? "{}" : bodyJson); }
        catch (Exception e) { body = new JSONObject(); }
        synchronized (QUEUE) {
            QUEUE.add(new Job(activity, scoutWebView, requestId, body));
            if (!running) { running = true; MAIN.post(RetailerDeviceCheckManager::runNext); }
        }
    }

    private static void runNext() {
        Job job;
        synchronized (QUEUE) {
            job = QUEUE.poll();
            if (job == null) { running = false; return; }
        }
        if (job.activity.isFinishing() || job.activity.isDestroyed()) {
            finish(job, errorPayload(job, "device_unavailable", "Scout screen closed before the device check could run."));
            return;
        }
        start(job);
    }

    private static void start(Job job) {
        job.activity.runOnUiThread(() -> {
            try {
                String retailer = job.retailer();
                if (!retailer.equals("Home Depot") && !retailer.equals("Dollar General")) {
                    finish(job, errorPayload(job, "unsupported", "Device-side checking is currently enabled for Home Depot and Dollar General."));
                    return;
                }
                WebView checker = new WebView(job.activity);
                job.checker = checker;
                WebSettings settings = checker.getSettings();
                settings.setJavaScriptEnabled(true);
                settings.setDomStorageEnabled(true);
                settings.setDatabaseEnabled(true);
                settings.setMediaPlaybackRequiresUserGesture(true);
                settings.setUserAgentString(settings.getUserAgentString() + " H38ResellerScoutStoreCheck/2.5.0");
                CookieManager cookies = CookieManager.getInstance();
                cookies.setAcceptCookie(true);
                cookies.setAcceptThirdPartyCookies(checker, true);

                checker.addJavascriptInterface(new Extractor(job), "AndroidH38RetailerExtractor");
                checker.setWebViewClient(new WebViewClient() {
                    @Override public void onPageFinished(WebView view, String url) {
                        if (job.done.get()) return;
                        job.lastUrl = url == null ? "" : url;
                        flushCookies();
                        if (job.setupPhase) {
                            MAIN.postDelayed(() -> attemptStoreSetup(job), 1500);
                            return;
                        }
                        if (!job.followedProduct && !looksProduct(retailer, job.lastUrl)) {
                            MAIN.postDelayed(() -> followBestProduct(job), 1600);
                        }
                        MAIN.postDelayed(() -> extract(job), 4100);
                    }
                });

                MAIN.postDelayed(() -> {
                    if (!job.done.get()) finish(job, errorPayload(job, "device_unavailable", retailer + " device page did not finish in time."));
                }, 30000);

                if (needsStoreSetup(job)) {
                    job.setupPhase = true;
                    checker.loadUrl(storeSetupUrl(job));
                } else checker.loadUrl(startUrl(job));
            } catch (Exception e) {
                finish(job, errorPayload(job, "device_unavailable", "Device check failed to start: " + e.getMessage()));
            }
        });
    }

    private static void flushCookies() {
        try { CookieManager.getInstance().flush(); } catch (Throwable ignored) {}
    }

    private static boolean needsStoreSetup(Job job) {
        if (!job.body.optBoolean("auto_store_setup", true)) return false;
        if (job.retailer().equals("Home Depot") && !homeDepotStoreId(job).isBlank()) return false;
        return job.retailer().equals("Dollar General") && !job.body.optString("store_address", "").isBlank();
    }

    private static String storeSetupUrl(Job job) {
        String q = Uri.encode(firstNonBlank(zip(job.body.optString("store_address", "")), job.body.optString("postal", ""), "55744"));
        if (job.retailer().equals("Dollar General")) return "https://www.dollargeneral.com/store-locator?query=" + q;
        return "https://www.homedepot.com/l/store-locator?search=" + q;
    }

    private static void attemptStoreSetup(Job job) {
        if (job.done.get() || job.checker == null || !job.setupPhase) return;
        String address = job.body.optString("store_address", "");
        String wantedStreet = street(address), wantedZip = zip(address), wantedCity = city(address);
        String script = """
(function(){
 function T(e){return String((e&&e.innerText)||'').replace(/\\s+/g,' ').trim()}
 function vis(e){if(!e)return false;var r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>1&&r.height>1&&s.display!=='none'&&s.visibility!=='hidden'}
 var street=%s,zip=%s,city=%s;
 var nodes=[].slice.call(document.querySelectorAll('article,li,section,div')).filter(function(e){if(!vis(e))return false;var x=T(e).toLowerCase();return (!street||x.indexOf(street.toLowerCase())>=0)&&(!zip||x.indexOf(zip)>=0)&&(!city||x.indexOf(city.toLowerCase())>=0)});
 nodes.sort(function(a,b){return T(a).length-T(b).length});
 var card=nodes[0]||null;if(!card)return 'NO_MATCH';
 var buttons=[].slice.call(card.querySelectorAll('button,a,[role="button"]')).filter(vis);
 var action=buttons.find(function(e){var x=T(e).toLowerCase();return x.indexOf('shop this store')>=0||x.indexOf('make this my store')>=0||x.indexOf('set as my store')>=0||x.indexOf('select store')>=0||x==='select'||x==='shop'})||null;
 if(action){action.click();return 'CLICKED_ACTION'}
 var link=card.querySelector('a[href]');if(link){link.click();return 'CLICKED_CARD'}
 return 'MATCH_NO_ACTION';
})()
""".formatted(JSONObject.quote(wantedStreet), JSONObject.quote(wantedZip), JSONObject.quote(wantedCity));
        job.checker.evaluateJavascript(script, value -> {
            job.setupPhase = false;
            job.storeSetupResult = jsonString(value);
            flushCookies();
            MAIN.postDelayed(() -> { if (!job.done.get() && job.checker != null) job.checker.loadUrl(startUrl(job)); }, 1300);
        });
    }

    private static boolean looksProduct(String retailer, String url) {
        String value = url == null ? "" : url.toLowerCase(Locale.US);
        if (retailer.equals("Home Depot")) return value.contains("/p/") && value.matches(".*\\d{6,}.*");
        return value.contains("/p/") || value.contains("/product/");
    }

    private static void followBestProduct(Job job) {
        if (job.done.get() || job.checker == null || job.followedProduct) return;
        String query = firstNonBlank(job.body.optString("upc", ""), job.body.optString("sku", ""), job.body.optString("title", ""));
        String selector = job.retailer().equals("Home Depot") ? "a[href*=\"/p/\"]" : "a[href*=\"/p/\"],a[href*=\"/product/\"]";
        String script = """
(function(){var q=%s.toLowerCase(),digits=q.replace(/\\D/g,''),toks=q.replace(/[^a-z0-9]+/g,' ').split(' ').filter(function(x){return x.length>=4}).slice(0,5),a=[].slice.call(document.querySelectorAll(%s));if(!a.length)return'';function score(e){var x=String((e.innerText||'')+' '+(e.href||'')).toLowerCase(),s=0;if(digits.length>=5&&x.replace(/\\D/g,'').indexOf(digits)>=0)s+=20;toks.forEach(function(t){if(x.indexOf(t)>=0)s+=3});return s}a.sort(function(x,y){return score(y)-score(x)});return a[0]&&a[0].href||''})()
""".formatted(JSONObject.quote(query), JSONObject.quote(selector));
        job.checker.evaluateJavascript(script, value -> {
            if (job.done.get()) return;
            try {
                String href = jsonString(value);
                if (!href.startsWith("http") || !hostMatches(job.retailer(), href)) return;
                job.followedProduct = true;
                if (job.retailer().equals("Home Depot")) href = addHomeDepotStoreSelection(href, homeDepotStoreId(job));
                job.checker.loadUrl(href);
            } catch (Exception ignored) {}
        });
    }

    private static void extract(Job job) {
        if (job.done.get() || job.checker == null) return;
        try {
            JSONObject context = new JSONObject();
            String address = job.body.optString("store_address", "");
            context.put("retailer", job.retailer());
            context.put("store_address", address);
            context.put("store_name", job.body.optString("store_name", ""));
            context.put("store_id", firstNonBlank(job.body.optString("store_id", ""), job.body.optString("retailer_store_id", ""), homeDepotStoreId(job)));
            context.put("store_setup_result", job.storeSetupResult);
            context.put("title", job.body.optString("title", ""));
            context.put("upc", digits(job.body.optString("upc", "")));
            context.put("sku", digits(job.body.optString("sku", "")));
            context.put("zip", zip(address));
            context.put("street", street(address));
            context.put("city", city(address));
            String script = "window.__H38RetailerContext=" + context + ";\n" + extractor(job.activity);
            job.checker.evaluateJavascript(script, null);
        } catch (Exception e) {
            finish(job, errorPayload(job, "device_unavailable", "Could not prepare retailer device extraction."));
        }
    }

    private static String extractor(Activity activity) throws Exception {
        String cached = extractorAsset;
        if (cached != null) return cached;
        synchronized (RetailerDeviceCheckManager.class) {
            if (extractorAsset != null) return extractorAsset;
            try (InputStream in = activity.getAssets().open("reseller/v027-retailer-extract.js"); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192]; int count;
                while ((count = in.read(buffer)) > 0) out.write(buffer, 0, count);
                extractorAsset = new String(out.toByteArray(), StandardCharsets.UTF_8);
                return extractorAsset;
            }
        }
    }

    private static String startUrl(Job job) {
        String retailer = job.retailer();
        String source = job.body.optString("source_url", "").trim();
        String query = firstNonBlank(job.body.optString("upc", ""), job.body.optString("sku", ""), job.body.optString("title", ""), "tools");
        if (!source.isBlank() && hostMatches(retailer, source)) return retailer.equals("Home Depot") ? addHomeDepotStoreSelection(source, homeDepotStoreId(job)) : source;
        String encoded = Uri.encode(query);
        if (retailer.equals("Dollar General")) return "https://www.dollargeneral.com/product-search.html?query=" + encoded;
        return addHomeDepotStoreSelection("https://www.homedepot.com/s/" + encoded, homeDepotStoreId(job));
    }

    private static String homeDepotStoreId(Job job) {
        if (!job.retailer().equals("Home Depot")) return "";
        String explicit = firstNonBlank(job.body.optString("store_id", ""), job.body.optString("retailer_store_id", ""));
        if (!explicit.isBlank()) return digits(explicit);
        String a = job.body.optString("store_address", "");
        String z = zip(a);
        if (z.equals("55744")) return "2834";
        if (z.equals("56601")) return "2830";
        if (z.equals("56425")) return "2818";
        if (z.equals("55811")) return "2817";
        return "";
    }

    private static String addHomeDepotStoreSelection(String url, String storeId) {
        if (storeId == null || storeId.isBlank()) return url;
        try {
            Uri u = Uri.parse(url); if (!String.valueOf(u.getHost()).toLowerCase(Locale.US).endsWith("homedepot.com")) return url;
            Uri.Builder b = u.buildUpon().clearQuery();
            for (String key : u.getQueryParameterNames()) if (!key.equals("storeSelection")) for (String v : u.getQueryParameters(key)) b.appendQueryParameter(key, v);
            b.appendQueryParameter("storeSelection", storeId); return b.build().toString();
        } catch (Exception e) { return url + (url.contains("?") ? "&" : "?") + "storeSelection=" + Uri.encode(storeId); }
    }

    private static boolean hostMatches(String retailer, String url) {
        try {
            String host = String.valueOf(Uri.parse(url).getHost()).toLowerCase(Locale.US);
            return retailer.equals("Home Depot") ? host.endsWith("homedepot.com") : host.endsWith("dollargeneral.com");
        } catch (Exception e) { return false; }
    }

    private static String jsonString(String value) {
        if (value == null || value.equals("null")) return "";
        try { return new org.json.JSONArray("[" + value + "]").getString(0); }
        catch (Exception e) { return ""; }
    }
    private static String firstNonBlank(String... values) { for (String value : values) if (value != null && !value.trim().isEmpty()) return value.trim(); return ""; }
    private static String digits(String value) { return value == null ? "" : value.replaceAll("\\D", ""); }
    private static String zip(String value) { Matcher m = Pattern.compile("\\b(\\d{5})(?:-\\d{4})?\\b").matcher(value == null ? "" : value); return m.find() ? m.group(1) : ""; }
    private static String street(String value) { Matcher m = Pattern.compile("^\\s*(\\d+[A-Za-z-]*)\\b").matcher(value == null ? "" : value); return m.find() ? m.group(1) : ""; }
    private static String city(String value) { if (value == null) return ""; String[] p = value.split(","); if (p.length >= 3) return p[p.length - 2].trim(); if (p.length >= 2) return p[0].replaceFirst("^\\s*\\d+\\S*\\s+", "").trim(); return ""; }

    private static JSONObject errorPayload(Job job, String status, String label) {
        JSONObject payload = new JSONObject();
        try {
            payload.put("status", status); payload.put("retailer", job.retailer()); payload.put("stock_checked", true);
            payload.put("stock_status", "unknown"); payload.put("stock_count", JSONObject.NULL); payload.put("current_price", JSONObject.NULL);
            payload.put("regular_price", JSONObject.NULL); payload.put("store_bound", false); payload.put("source_mode", "device_browser_v250");
            payload.put("session_persisted", true); payload.put("availability_label", label);
        } catch (Exception ignored) {}
        return payload;
    }

    private static void finish(Job job, JSONObject payload) {
        if (!job.done.compareAndSet(false, true)) return;
        MAIN.post(() -> {
            try {
                flushCookies();
                if (job.checker != null) {
                    job.checker.stopLoading(); job.checker.removeJavascriptInterface("AndroidH38RetailerExtractor");
                    job.checker.removeAllViews(); job.checker.destroy(); job.checker = null;
                }
                String result = payload == null ? "{}" : payload.toString();
                String script = "window.H38DeviceStockResult&&window.H38DeviceStockResult(" + JSONObject.quote(job.id) + "," + JSONObject.quote(result) + ");";
                job.scout.post(() -> job.scout.evaluateJavascript(script, null));
            } catch (Exception ignored) {}
            MAIN.post(RetailerDeviceCheckManager::runNext);
        });
    }

    private static final class Job {
        final Activity activity; final WebView scout; final String id; final JSONObject body; final AtomicBoolean done = new AtomicBoolean(false);
        WebView checker; boolean followedProduct = false, setupPhase = false; String lastUrl = "", storeSetupResult = "";
        Job(Activity activity, WebView scout, String id, JSONObject body) { this.activity = activity; this.scout = scout; this.id = id; this.body = body; }
        String retailer() { return body.optString("retailer", "").trim(); }
    }

    private static final class Extractor {
        final Job job; Extractor(Job job) { this.job = job; }
        @JavascriptInterface public void result(String json) {
            try { finish(job, new JSONObject(json == null ? "{}" : json)); }
            catch (Exception e) { finish(job, errorPayload(job, "device_unavailable", "Could not read retailer device result.")); }
        }
    }
}
