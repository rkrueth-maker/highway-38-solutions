package com.highway38.resellerscout;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

public final class MainActivity extends Activity {
    private static final String APP_BASE_URL =
            "https://highway38solutions.com/commercial-app/reseller-owner-test/";
    private static final int REQUEST_LOCATION = 3901;
    private static final String LAST_RADIUS_KEY = "h38_reseller_last_radius_v1";
    private static final String STOCK_UI_MARKER = "LOCAL_STOCK_DISPLAY_V1";
    private static final String STORE_FETCH_GUARD =
            "<script>(function(){'use strict';" +
            "var rawFetch=window.fetch.bind(window),inflight=new Map(),lastGood=new Map(),lastGoodAt=new Map(),servedPersisted=new Set();" +
            "var STORE='/functions/v1/reseller-nearby-stores',LEADS='/functions/v1/reseller-auto-leads';" +
            "var STORE_KEY='h38_reseller_last_store_response_v1',LEADS_KEY='h38_reseller_last_leads_response_v1',RADIUS_KEY='" + LAST_RADIUS_KEY + "';" +
            "function urlOf(input){return typeof input==='string'?input:(input&&input.url)||'';}" +
            "function kindOf(url){if(url.indexOf(STORE)>=0)return 'store';if(url.indexOf(LEADS)>=0)return 'leads';return '';}" +
            "function cacheKey(kind){return kind==='store'?STORE_KEY:LEADS_KEY;}" +
            "function responseOf(s){return new Response(s.body,{status:s.status,statusText:s.statusText,headers:s.headers});}" +
            "async function snap(r){return {body:await r.text(),status:r.status,statusText:r.statusText,headers:Array.from(r.headers.entries())};}" +
            "function count(kind,s){try{var p=JSON.parse(s.body);var a=kind==='store'?p.stores:p.leads;return Array.isArray(a)?a.length:0;}catch(e){return 0;}}" +
            "function markPersisted(kind,s){try{var p=JSON.parse(s.body);p.cached=true;p.persisted=true;if(kind==='store'){p.stale=true;p.warning='Showing the last saved hunt. Tap Refresh hunt for current results.';}s.body=JSON.stringify(p);}catch(e){}return s;}" +
            "function savePersistent(kind,s,init){try{if(count(kind,s)<=0)return;var copy={body:s.body,status:s.status,statusText:s.statusText,headers:s.headers,at:Date.now(),requestBody:String((init&&init.body)||'')};localStorage.setItem(cacheKey(kind),JSON.stringify(copy));if(kind==='store'){try{var q=JSON.parse(copy.requestBody||'{}');var r=String(Number(q.radiusMiles||50));if(['25','50','100','150'].indexOf(r)>=0)localStorage.setItem(RADIUS_KEY,r);}catch(e){}}}catch(e){}}" +
            "function loadPersistent(kind){try{var raw=localStorage.getItem(cacheKey(kind));if(!raw)return null;var s=JSON.parse(raw);if(!s||!s.body)return null;return markPersisted(kind,s);}catch(e){return null;}}" +
            "function setBusy(v){['refreshStores','refreshTop'].forEach(function(id){var b=document.getElementById(id);if(b)b.disabled=v;});}" +
            "window.fetch=async function(input,init){" +
            "var url=urlOf(input),kind=kindOf(url);if(!kind)return rawFetch(input,init);" +
            "var persisted=loadPersistent(kind);" +
            "if(!servedPersisted.has(kind)&&persisted){servedPersisted.add(kind);rawFetch(input,init).then(async function(r){var s=await snap(r);if(r.ok&&count(kind,s)>0)savePersistent(kind,s,init);}).catch(function(){});return responseOf(persisted);}" +
            "var key=kind+'|'+String((init&&init.body)||url),good=lastGood.get(key),age=Date.now()-(lastGoodAt.get(key)||0);" +
            "if(good&&age<10000)return responseOf(good);" +
            "if(inflight.has(key))return responseOf(await inflight.get(key));" +
            "setBusy(true);" +
            "var work=(async function(){try{" +
            "var r=await rawFetch(input,init),s=await snap(r),c=count(kind,s),prior=lastGood.get(key)||loadPersistent(kind);" +
            "if(r.ok&&c>0){lastGood.set(key,s);lastGoodAt.set(key,Date.now());savePersistent(kind,s,init);return s;}" +
            "if(prior)return prior;return s;" +
            "}catch(e){var prior=lastGood.get(key)||loadPersistent(kind);if(prior)return prior;throw e;}})();" +
            "inflight.set(key,work);try{return responseOf(await work);}finally{inflight.delete(key);if(inflight.size===0)setBusy(false);}" +
            "};" +
            "})();</script>";
    private static final String RADIUS_BOOTSTRAP =
            "<script>(function(){try{var r=localStorage.getItem('" + LAST_RADIUS_KEY + "')||'50';var e=document.getElementById('radius');if(e&&['25','50','100','150'].indexOf(r)>=0)e.value=r;}catch(x){var e=document.getElementById('radius');if(e)e.value='50';}})();</script>";
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(238, 243, 247));
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return windowInsets;
        });
        setContentView(webView);
        ViewCompat.requestApplyInsets(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString() + " H38ResellerScoutAndroid/0.1.7");

        webView.addJavascriptInterface(new ResellerBridge(), "AndroidH38Reseller");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                Uri uri = request.getUrl();
                String url = uri == null ? "" : uri.toString();
                if (url.startsWith(APP_BASE_URL)) return false;
                if (uri != null && ("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme()))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); return true; }
                    catch (Exception ignored) { return false; }
                }
                return true;
            }
        });
        loadEmbeddedApp();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_LOCATION) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) deliverLocation();
            else sendLocationError("Location permission is required for the local store search.");
        }
    }

    private void loadEmbeddedApp() {
        try (InputStream input = getAssets().open("reseller/index.html"); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            String html = output.toString(StandardCharsets.UTF_8.name());
            html = html.replace(
                    "<option value=\"50\">50 miles</option><option value=\"100\">100 miles</option><option value=\"150\" selected>150 miles</option>",
                    "<option value=\"50\" selected>50 miles</option><option value=\"100\">100 miles</option><option value=\"150\">150 miles</option>"
            );
            html = html.replace(
                    ".lead-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:8px 0}",
                    ".lead-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px;margin:8px 0}"
            );
            html = html.replace(
                    "function renderLead(s,l){",
                    "function stockDisplay(l){var status=norm(l.stock_status||l.local_stock_status||'');var raw=l.stock_count!=null?l.stock_count:l.local_stock_count;if(status==='in_stock'||status==='available'||status==='low_stock'){var q=Number(raw);if(raw!==null&&raw!==undefined&&raw!==''&&Number.isFinite(q))return String(q)+' shown';return status==='low_stock'?'Low stock':'In stock';}if(status==='out_of_stock'||status==='unavailable')return'Out of stock';return'Stock not shown';}\nfunction renderLead(s,l){"
            );
            html = html.replace(
                    "<div class=\"stat\"><strong>${esc(l.source_name||l.retailer)}</strong><span>Source</span></div></div><div class=\"actions\">",
                    "<div class=\"stat\"><strong>${esc(l.source_name||l.retailer)}</strong><span>Source</span></div><div class=\"stat\"><strong>${stockDisplay(l)}</strong><span>Local stock</span></div></div><div class=\"actions\">"
            );
            html = html.replace("</head>", STORE_FETCH_GUARD + "\n</head>");
            html = html.replace("<script>\n(()=>{'use strict';", RADIUS_BOOTSTRAP + "\n<script>\n(()=>{'use strict';");
            webView.loadDataWithBaseURL(APP_BASE_URL, html, "text/html", "UTF-8", APP_BASE_URL);
        } catch (Exception error) {
            Toast.makeText(this, "Reseller Scout failed to open: " + error.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void requestLocationPermissionOrDeliver() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
                checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQUEST_LOCATION);
            return;
        }
        deliverLocation();
    }

    private void deliverLocation() {
        try {
            LocationManager manager = (LocationManager) getSystemService(LOCATION_SERVICE);
            Location best = null;
            List<String> providers = manager.getProviders(true);
            for (String provider : providers) {
                try {
                    Location candidate = manager.getLastKnownLocation(provider);
                    if (candidate != null && (best == null || candidate.getAccuracy() < best.getAccuracy())) best = candidate;
                } catch (SecurityException ignored) {}
            }
            if (best != null) { sendLocation(best); return; }
            String provider = manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) ? LocationManager.NETWORK_PROVIDER :
                    (manager.isProviderEnabled(LocationManager.GPS_PROVIDER) ? LocationManager.GPS_PROVIDER : null);
            if (provider == null) { sendLocationError("Turn on phone location services."); return; }
            manager.requestSingleUpdate(provider, new LocationListener() {
                @Override public void onLocationChanged(Location location) { sendLocation(location); }
                @Override public void onProviderEnabled(String provider) {}
                @Override public void onProviderDisabled(String provider) {}
                @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
            }, Looper.getMainLooper());
        } catch (Exception error) { sendLocationError(error.getMessage()); }
    }

    private void sendLocation(Location location) {
        if (webView == null || location == null) return;
        double lat = location.getLatitude(), lon = location.getLongitude();
        webView.post(() -> webView.evaluateJavascript("window.H38NativeLocationResult && window.H38NativeLocationResult(" + lat + "," + lon + ");", null));
    }

    private void sendLocationError(String text) {
        if (webView == null) return;
        String encoded = JSONObject.quote(text == null ? "Location unavailable." : text);
        webView.post(() -> webView.evaluateJavascript("window.H38NativeLocationError && window.H38NativeLocationError(" + encoded + ");", null));
    }

    private void sendBarcode(String value) {
        if (webView == null) return;
        String encoded = JSONObject.quote(value == null ? "" : value);
        webView.post(() -> webView.evaluateJavascript("window.H38NativeBarcodeResult && window.H38NativeBarcodeResult(" + encoded + ");", null));
    }

    private void sendBarcodeError(String value) {
        if (webView == null) return;
        String encoded = JSONObject.quote(value == null ? "Barcode scanner unavailable." : value);
        webView.post(() -> webView.evaluateJavascript("window.H38NativeBarcodeError && window.H38NativeBarcodeError(" + encoded + ");", null));
    }

    private final class ResellerBridge {
        @JavascriptInterface public void requestLocation() { runOnUiThread(MainActivity.this::requestLocationPermissionOrDeliver); }

        @JavascriptInterface public void scanBarcode() {
            runOnUiThread(() -> {
                GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder()
                        .setBarcodeFormats(Barcode.FORMAT_UPC_A, Barcode.FORMAT_UPC_E, Barcode.FORMAT_EAN_13,
                                Barcode.FORMAT_EAN_8, Barcode.FORMAT_CODE_128, Barcode.FORMAT_QR_CODE)
                        .enableAutoZoom().build();
                GmsBarcodeScanner scanner = GmsBarcodeScanning.getClient(MainActivity.this, options);
                scanner.startScan().addOnSuccessListener(barcode -> {
                    String raw = barcode.getRawValue();
                    if (raw == null || raw.trim().isEmpty()) sendBarcodeError("No barcode value was returned."); else sendBarcode(raw.trim());
                }).addOnCanceledListener(() -> sendBarcodeError("Scan canceled."))
                        .addOnFailureListener(error -> sendBarcodeError(error.getMessage()));
            });
        }

        @JavascriptInterface public String build() { return "20260818-stock-display-v017"; }
    }
}
