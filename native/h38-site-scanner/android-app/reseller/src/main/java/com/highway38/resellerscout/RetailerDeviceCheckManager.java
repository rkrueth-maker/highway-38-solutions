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
 * The retailer session stays in Android WebView storage on the phone. Scout
 * never exports retailer cookies to Supabase. Price/quantity is accepted only
 * when the requested product and physical store can both be proven from the
 * retailer page; otherwise the result remains unverified.
 */
public final class RetailerDeviceCheckManager {
    public static final String DEVICE_STORE_BOUND_CHECK_V1 = "DEVICE_STORE_BOUND_CHECK_V1";
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
            if (!running) {
                running = true;
                MAIN.post(RetailerDeviceCheckManager::runNext);
            }
        }
    }

    private static void runNext() {
        Job job;
        synchronized (QUEUE) {
            job = QUEUE.poll();
            if (job == null) {
                running = false;
                return;
            }
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
                settings.setUserAgentString(settings.getUserAgentString() + " H38ResellerScoutStoreCheck/0.1.27");

                CookieManager cookies = CookieManager.getInstance();
                cookies.setAcceptCookie(true);
                cookies.setAcceptThirdPartyCookies(checker, true);

                checker.addJavascriptInterface(new Extractor(job), "AndroidH38RetailerExtractor");
                checker.setWebViewClient(new WebViewClient() {
                    @Override public void onPageFinished(WebView view, String url) {
                        if (job.done.get()) return;
                        job.lastUrl = url == null ? "" : url;
                        if (!job.followedProduct && !looksProduct(retailer, job.lastUrl)) {
                            MAIN.postDelayed(() -> followFirstProduct(job), 1700);
                        }
                        MAIN.postDelayed(() -> extract(job), 4200);
                    }
                });

                MAIN.postDelayed(() -> {
                    if (!job.done.get()) {
                        finish(job, errorPayload(job, "device_unavailable", retailer + " device page did not finish in time."));
                    }
                }, 19000);

                checker.loadUrl(startUrl(job));
            } catch (Exception e) {
                finish(job, errorPayload(job, "device_unavailable", "Device check failed to start: " + e.getMessage()));
            }
        });
    }

    private static boolean looksProduct(String retailer, String url) {
        String value = url == null ? "" : url.toLowerCase(Locale.US);
        if (retailer.equals("Home Depot")) return value.contains("/p/") && value.matches(".*\\d{6,}.*");
        return value.contains("/p/") || value.contains("/product/");
    }

    private static void followFirstProduct(Job job) {
        if (job.done.get() || job.checker == null || job.followedProduct) return;
        String retailer = job.retailer();
        String script = retailer.equals("Home Depot")
                ? "(function(){var a=document.querySelector('a[href*=\"/p/\"]');return a&&a.href||''})()"
                : "(function(){var a=document.querySelector('a[href*=\"/p/\"],a[href*=\"/product/\"]');return a&&a.href||''})()";
        job.checker.evaluateJavascript(script, value -> {
            if (job.done.get()) return;
            try {
                String href = jsonString(value);
                if (!href.startsWith("http") || !hostMatches(retailer, href)) return;
                job.followedProduct = true;
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
            try (InputStream in = activity.getAssets().open("reseller/v027-retailer-extract.js");
                 ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int count;
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
        if (!source.isBlank() && hostMatches(retailer, source)) return source;
        String encoded = Uri.encode(query);
        if (retailer.equals("Dollar General")) return "https://www.dollargeneral.com/product-search.html?query=" + encoded;
        return "https://www.homedepot.com/s/" + encoded;
    }

    private static boolean hostMatches(String retailer, String url) {
        try {
            String host = String.valueOf(Uri.parse(url).getHost()).toLowerCase(Locale.US);
            return retailer.equals("Home Depot") ? host.endsWith("homedepot.com") : host.endsWith("dollargeneral.com");
        } catch (Exception e) {
            return false;
        }
    }

    private static String jsonString(String value) {
        if (value == null || value.equals("null")) return "";
        try { return new org.json.JSONArray("[" + value + "]").getString(0); }
        catch (Exception e) { return ""; }
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) if (value != null && !value.trim().isEmpty()) return value.trim();
        return "";
    }

    private static String digits(String value) {
        return value == null ? "" : value.replaceAll("\\D", "");
    }

    private static String zip(String value) {
        Matcher match = Pattern.compile("\\b(\\d{5})(?:-\\d{4})?\\b").matcher(value == null ? "" : value);
        return match.find() ? match.group(1) : "";
    }

    private static String street(String value) {
        Matcher match = Pattern.compile("^\\s*(\\d+[A-Za-z-]*)\\b").matcher(value == null ? "" : value);
        return match.find() ? match.group(1) : "";
    }

    private static String city(String value) {
        if (value == null) return "";
        String[] pieces = value.split(",");
        if (pieces.length >= 3) return pieces[pieces.length - 2].trim();
        if (pieces.length >= 2) return pieces[0].replaceFirst("^\\s*\\d+\\S*\\s+", "").trim();
        return "";
    }

    private static JSONObject errorPayload(Job job, String status, String label) {
        JSONObject payload = new JSONObject();
        try {
            payload.put("status", status);
            payload.put("retailer", job.retailer());
            payload.put("stock_checked", true);
            payload.put("stock_status", "unknown");
            payload.put("stock_count", JSONObject.NULL);
            payload.put("current_price", JSONObject.NULL);
            payload.put("store_bound", false);
            payload.put("source_mode", "device_browser");
            payload.put("availability_label", label);
        } catch (Exception ignored) {}
        return payload;
    }

    private static void finish(Job job, JSONObject payload) {
        if (!job.done.compareAndSet(false, true)) return;
        MAIN.post(() -> {
            try {
                if (job.checker != null) {
                    job.checker.stopLoading();
                    job.checker.removeJavascriptInterface("AndroidH38RetailerExtractor");
                    job.checker.removeAllViews();
                    job.checker.destroy();
                    job.checker = null;
                }
                String result = payload == null ? "{}" : payload.toString();
                String script = "window.H38DeviceStockResult&&window.H38DeviceStockResult(" + JSONObject.quote(job.id) + "," + JSONObject.quote(result) + ");";
                job.scout.post(() -> job.scout.evaluateJavascript(script, null));
            } catch (Exception ignored) {}
            MAIN.post(RetailerDeviceCheckManager::runNext);
        });
    }

    private static final class Job {
        final Activity activity;
        final WebView scout;
        final String id;
        final JSONObject body;
        final AtomicBoolean done = new AtomicBoolean(false);
        WebView checker;
        boolean followedProduct = false;
        String lastUrl = "";

        Job(Activity activity, WebView scout, String id, JSONObject body) {
            this.activity = activity;
            this.scout = scout;
            this.id = id;
            this.body = body;
        }

        String retailer() { return body.optString("retailer", "").trim(); }
    }

    private static final class Extractor {
        final Job job;
        Extractor(Job job) { this.job = job; }

        @JavascriptInterface public void result(String json) {
            try { finish(job, new JSONObject(json == null ? "{}" : json)); }
            catch (Exception e) { finish(job, errorPayload(job, "device_unavailable", "Could not read retailer device result.")); }
        }
    }
}
