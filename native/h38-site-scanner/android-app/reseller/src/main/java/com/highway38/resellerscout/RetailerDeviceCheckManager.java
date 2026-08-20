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

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.Locale;
import java.util.Queue;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Device-side Home Depot / Dollar General verifier.
 * Uses Android WebView + the retailer's own phone-side session. No retailer
 * credentials/cookies are exported to Supabase. If the requested physical
 * store cannot be proven from the loaded retailer page, Scout returns setup
 * required instead of pretending that price or inventory is local.
 */
public final class RetailerDeviceCheckManager {
    public static final String DEVICE_STORE_BOUND_CHECK_V1 = "DEVICE_STORE_BOUND_CHECK_V1";
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final Queue<Job> QUEUE = new ArrayDeque<>();
    private static boolean running = false;

    private RetailerDeviceCheckManager() {}

    public static void check(Activity activity, WebView scoutWebView, String requestId, String bodyJson) {
        if (activity == null || scoutWebView == null || requestId == null) return;
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
        if (job.activity.isFinishing() || job.activity.isDestroyed()) { finish(job, errorPayload(job, "device_unavailable", "Scout screen closed before the device check could run.")); return; }
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
                WebView w = new WebView(job.activity);
                job.checker = w;
                WebSettings s = w.getSettings();
                s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setDatabaseEnabled(true);
                s.setMediaPlaybackRequiresUserGesture(true);
                s.setUserAgentString(s.getUserAgentString() + " H38ResellerScoutStoreCheck/0.1.27");
                CookieManager cm = CookieManager.getInstance(); cm.setAcceptCookie(true); cm.setAcceptThirdPartyCookies(w, true);
                w.addJavascriptInterface(new Extractor(job), "AndroidH38RetailerExtractor");
                w.setWebViewClient(new WebViewClient() {
                    @Override public void onPageFinished(WebView view, String url) {
                        if (job.done.get()) return;
                        job.lastUrl = url == null ? "" : url;
                        if (!job.followedProduct && !looksProduct(retailer, job.lastUrl)) {
                            MAIN.postDelayed(() -> followFirstProduct(job), 1800);
                        }
                        MAIN.postDelayed(() -> extract(job), 4300);
                    }
                });
                MAIN.postDelayed(() -> {
                    if (!job.done.get()) finish(job, errorPayload(job, "device_unavailable", retailer + " device page did not finish in time."));
                }, 18000);
                w.loadUrl(startUrl(job));
            } catch (Exception e) {
                finish(job, errorPayload(job, "device_unavailable", "Device check failed to start: " + e.getMessage()));
            }
        });
    }

    private static boolean looksProduct(String retailer, String url) {
        String u = url == null ? "" : url.toLowerCase(Locale.US);
        if (retailer.equals("Home Depot")) return u.contains("/p/") && u.matches(".*\\d{6,}.*");
        return u.contains("/p/") || u.contains("/product/");
    }

    private static void followFirstProduct(Job job) {
        if (job.done.get() || job.checker == null || job.followedProduct) return;
        String retailer = job.retailer();
        String js = retailer.equals("Home Depot")
                ? "(function(){var a=document.querySelector('a[href*=\\"/p/\\"]');return a&&a.href||''})()"
                : "(function(){var a=document.querySelector('a[href*=\\"/p/\\"],a[href*=\\"/product/\\"]');return a&&a.href||''})()";
        job.checker.evaluateJavascript(js, value -> {
            try {
                String href = value == null ? "" : value;
                if (href.startsWith("\"") && href.endsWith("\"")) href = new org.json.JSONArray("[" + href + "]").getString(0);
                if (!href.startsWith("http") || !hostMatches(retailer, href)) return;
                job.followedProduct = true;
                job.checker.loadUrl(href);
            } catch (Exception ignored) {}
        });
    }

    private static void extract(Job job) {
        if (job.done.get() || job.checker == null) return;
        job.checker.evaluateJavascript(extractScript(job), null);
    }

    private static String extractScript(Job j) {
        String retailer = j.retailer(), address = j.body.optString("store_address", ""), storeName = j.body.optString("store_name", ""), title = j.body.optString("title", ""), upc = digits(j.body.optString("upc", "")), sku = digits(j.body.optString("sku", ""));
        String zip = zip(address), street = street(address), city = city(address);
        return "(function(){try{" +
                "var retailer=" + JSONObject.quote(retailer) + ",address=" + JSONObject.quote(address) + ",storeName=" + JSONObject.quote(storeName) + ",zip=" + JSONObject.quote(zip) + ",street=" + JSONObject.quote(street) + ",city=" + JSONObject.quote(city) + ",wantTitle=" + JSONObject.quote(title) + ",wantUpc=" + JSONObject.quote(upc) + ",wantSku=" + JSONObject.quote(sku) + ";" +
                "var text=String((document.body&&document.body.innerText)||'').replace(/\\s+/g,' ').trim(),html=String(document.documentElement&&document.documentElement.innerHTML||'');" +
                "function norm(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}function nums(v){return String(v||'').replace(/\\D/g,'')}" +
                "var low=norm(text),htmlDigits=nums(html),storeBound=false,evidence='';" +
                "if(zip&&low.indexOf(zip)>=0){storeBound=true;evidence='ZIP '+zip}else if(street&&city&&low.indexOf(street.toLowerCase())>=0&&low.indexOf(norm(city))>=0){storeBound=true;evidence=street+' / '+city}else if(city){var ci=norm(city).replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&');try{if(new RegExp('(my store|your store|you.re shopping|shopping at|selected store).{0,120}'+ci,'i').test(text)){storeBound=true;evidence='selected '+city}}catch(x){}}" +
                "var productBound=false;if(wantUpc.length>=8&&htmlDigits.indexOf(wantUpc)>=0)productBound=true;else if(wantSku.length>=5&&htmlDigits.indexOf(wantSku)>=0)productBound=true;else{var toks=norm(wantTitle).split(' ').filter(function(x){return x.length>=4&&!/^(with|from|tool|pack|piece)$/.test(x)}),hits=0;toks.slice(0,8).forEach(function(x){if(low.indexOf(x)>=0)hits++});productBound=hits>=Math.min(3,Math.max(2,Math.ceil(toks.length*.4)))}" +
                "function num(v){var m=String(v||'').replace(/,/g,'').match(/(?:\\$\\s*)?([0-9]{1,6}(?:\\.[0-9]{1,2})?)/);var n=m?Number(m[1]):0;return n>=.01&&n<100000?n:0}" +
                "var price=0,els=document.querySelectorAll('meta[itemprop=\\"price\\"],meta[property=\\"product:price:amount\\"],[itemprop=\\"price\\"],[data-testid*=\\"price\\" i],[class*=\\"price\\" i]');for(var i=0;i<els.length&&i<80&&!price;i++){price=num(els[i].getAttribute&&els[i].getAttribute('content')||els[i].textContent)}if(!price){var pm=html.match(/\\\"(?:currentPrice|salePrice|price)\\\"\\s*:\\s*(?:\\{[^}]{0,180}?\\\"(?:value|price)\\\"\\s*:\\s*)?\\\"?([0-9]+(?:\\.[0-9]{1,2})?)/i);if(pm)price=num(pm[1])}" +
                "var qty=null,qm=text.match(/(?:Quantity Available|Only)\\s*:?\\s*(\\d{1,4})\\s*(?:left|remaining)?/i)||text.match(/(\\d{1,4})\\s+(?:in[- ]stock|in stock)/i);if(qm){var qn=Number(qm[1]);if(Number.isInteger(qn)&&qn>=0&&qn<=9999)qty=qn}" +
                "var stock='unknown';if(/out of stock|not available|unavailable|sold out/i.test(text))stock='out_of_stock';else if(/in stock|pickup today|available for pickup|ready for pickup|quantity available/i.test(text))stock='in_stock';if(qty!==null)stock=qty>0?'in_stock':'out_of_stock';" +
                "var status='device_store_setup_required',label=retailer+' store is not proven on the retailer page. Open Verify on phone and select '+address+' once.';var localPrice=null,localQty=null;if(productBound&&storeBound){localPrice=price||null;localQty=qty;status=qty!==null?'exact':(stock!=='unknown'||price>0?'availability_only':'store_resolved_no_quantity');label=retailer+' device check · '+(price>0?'$'+price.toFixed(2)+' local page price · ':'price not exposed · ')+(qty!==null?qty+' shown for this store':stock==='in_stock'?'in stock · exact quantity not exposed':stock==='out_of_stock'?'out of stock':'exact quantity not exposed')}else if(!productBound){status='device_product_not_resolved';label=retailer+' device page loaded, but Scout could not prove it was the requested product.'}" +
                "AndroidH38RetailerExtractor.result(JSON.stringify({status:status,retailer:retailer,stock_checked:true,stock_status:(productBound&&storeBound)?stock:'unknown',stock_count:localQty,current_price:localPrice,price_checked:localPrice!==null,store_bound:productBound&&storeBound,store_evidence:evidence||null,source_mode:'device_browser',checked_url:location.href,penny_price_detected:retailer==='Home Depot'&&productBound&&storeBound&&localPrice!==null&&Math.abs(localPrice-.01)<.0001,availability_label:label}));" +
                "}catch(e){AndroidH38RetailerExtractor.result(JSON.stringify({status:'device_unavailable',retailer:" + JSONObject.quote(retailer) + ",stock_checked:true,stock_status:'unknown',stock_count:null,current_price:null,store_bound:false,source_mode:'device_browser',availability_label:'Device page parse failed: '+String(e)}))}})();";
    }

    private static String startUrl(Job j) {
        String retailer = j.retailer(), source = j.body.optString("source_url", "").trim(), query = firstNonBlank(j.body.optString("upc", ""), j.body.optString("sku", ""), j.body.optString("title", ""), "tools");
        if (!source.isBlank() && hostMatches(retailer, source)) return source;
        String q = URLEncoder.encode(query, StandardCharsets.UTF_8);
        if (retailer.equals("Dollar General")) return "https://www.dollargeneral.com/product-search.html?query=" + q;
        return "https://www.homedepot.com/s/" + q;
    }

    private static boolean hostMatches(String retailer, String url) {
        try { String h = String.valueOf(Uri.parse(url).getHost()).toLowerCase(Locale.US); return retailer.equals("Home Depot") ? h.endsWith("homedepot.com") : h.endsWith("dollargeneral.com"); }
        catch (Exception e) { return false; }
    }

    private static String firstNonBlank(String... xs) { return Arrays.stream(xs).filter(x -> x != null && !x.trim().isEmpty()).findFirst().orElse("").trim(); }
    private static String digits(String s) { return s == null ? "" : s.replaceAll("\\D", ""); }
    private static String zip(String s) { Matcher m = Pattern.compile("\\b(\\d{5})(?:-\\d{4})?\\b").matcher(s == null ? "" : s); return m.find() ? m.group(1) : ""; }
    private static String street(String s) { Matcher m = Pattern.compile("^\\s*(\\d+[A-Za-z-]*)\\b").matcher(s == null ? "" : s); return m.find() ? m.group(1) : ""; }
    private static String city(String s) { if (s == null) return ""; String[] p = s.split(","); return p.length >= 3 ? p[p.length - 2].trim() : p.length >= 2 ? p[0].replaceFirst("^\\s*\\d+\\S*\\s+", "").trim() : ""; }

    private static JSONObject errorPayload(Job j, String status, String label) {
        JSONObject p = new JSONObject();
        try { p.put("status", status); p.put("retailer", j.retailer()); p.put("stock_checked", true); p.put("stock_status", "unknown"); p.put("stock_count", JSONObject.NULL); p.put("current_price", JSONObject.NULL); p.put("store_bound", false); p.put("source_mode", "device_browser"); p.put("availability_label", label); }
        catch (Exception ignored) {}
        return p;
    }

    private static void finish(Job job, JSONObject payload) {
        if (!job.done.compareAndSet(false, true)) return;
        MAIN.post(() -> {
            try {
                if (job.checker != null) { job.checker.stopLoading(); job.checker.removeAllViews(); job.checker.destroy(); job.checker = null; }
                String js = "window.H38DeviceStockResult&&window.H38DeviceStockResult(" + JSONObject.quote(job.id) + "," + JSONObject.quote(payload == null ? "{}" : payload.toString()) + ");";
                job.scout.post(() -> job.scout.evaluateJavascript(js, null));
            } catch (Exception ignored) {}
            synchronized (QUEUE) { MAIN.post(RetailerDeviceCheckManager::runNext); }
        });
    }

    private static final class Job {
        final Activity activity; final WebView scout; final String id; final JSONObject body; final AtomicBoolean done = new AtomicBoolean(false);
        WebView checker; boolean followedProduct = false; String lastUrl = "";
        Job(Activity activity, WebView scout, String id, JSONObject body) { this.activity = activity; this.scout = scout; this.id = id; this.body = body; }
        String retailer() { return body.optString("retailer", "").trim(); }
    }
    private static final class Extractor {
        final Job job; Extractor(Job j) { job = j; }
        @JavascriptInterface public void result(String json) {
            try { finish(job, new JSONObject(json == null ? "{}" : json)); }
            catch (Exception e) { finish(job, errorPayload(job, "device_unavailable", "Could not read retailer device result.")); }
        }
    }
}
