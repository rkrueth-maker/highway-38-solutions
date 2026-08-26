package com.highway38.resellerscout;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Looper;
import android.provider.Settings;
import android.util.Base64;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;
import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    public static final String V200_RUNTIME = "H38_SCOUT_V200_CLEAN_RUNTIME";
    public static final String V250_PACKAGED_PROVIDER_LAYER = "V250_PACKAGED_PROVIDER_LAYER";
    private static final String APP_BASE_URL = "https://highway38solutions.com/commercial-app/reseller-owner-test/";
    private static final int REQUEST_LOCATION = 3901;
    private static final int REQUEST_PHOTO = 3902;
    private FrameLayout contentRoot;
    private WebView webView;
    private String pendingPhotoRole = "item";

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(13, 42, 62));
        getWindow().setNavigationBarColor(Color.WHITE);
        contentRoot = new FrameLayout(this);
        contentRoot.setBackgroundColor(Color.rgb(243, 246, 248));
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(243, 246, 248));
        contentRoot.addView(webView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(contentRoot);
        applyInsets();

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString() + " H38ResellerScoutAndroid/2.5.0");

        NativeBridge bridge = new NativeBridge();
        webView.addJavascriptInterface(bridge, "AndroidH38Reseller");
        webView.addJavascriptInterface(bridge, "AndroidH38Scout");
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url == null) return false;
                if (url.startsWith(APP_BASE_URL)) return false;
                if (url.startsWith("http://") || url.startsWith("https://")) { openExternal(url); return true; }
                return false;
            }
            @Override public void onPageFinished(WebView view, String url) { deliverSharedText(getIntent()); }
        });
        webView.loadDataWithBaseURL(APP_BASE_URL, bundledPage(), "text/html", "UTF-8", null);
    }

    private void applyInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(contentRoot, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            webView.setPadding(0, 0, 0, 0);
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(contentRoot);
    }

    private String bundledPage() {
        String html = readAsset("reseller/index.html");
        html = html.replace("<link rel=\"stylesheet\" href=\"v200-ui.css\">", "<style>" + readAsset("reseller/v200-ui.css") + "</style>");
        for (String name : new String[]{"v200-core.js", "v200-hunt.js", "v200-auctions.js", "v200-discover.js", "v200-scan.js", "v200-more.js", "v210-polish.js", "v211-wide.js", "v212-physical.js", "v220-profit.js", "v220-track.js", "v220-product.js", "v200-app.js"}) {
            html = html.replace("<script src=\"" + name + "\"></script>", "<script data-h38-bundled-module=\"" + name + "\">" + readAsset("reseller/" + name) + "</script>");
        }
        String appMarker = "<script data-h38-bundled-module=\"v200-app.js\">";
        String providerLayer = "<script data-h38-bundled-module=\"v240-data.js\">" + readAsset("reseller/v240-data.js") + "</script>";
        html = html.replace(appMarker, providerLayer + appMarker);
        return html;
    }

    private String readAsset(String path) {
        try (InputStream in = getAssets().open(path); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int count;
            while ((count = in.read(buffer)) > 0) out.write(buffer, 0, count);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "<!doctype html><body><h2>Scout asset failed to load</h2><pre>" + e.getMessage() + "</pre></body>";
        }
    }

    private void openExternal(String url) {
        try {
            if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) return;
            CustomTabsIntent tabs = new CustomTabsIntent.Builder().setShowTitle(true).build(); tabs.launchUrl(this, Uri.parse(url));
        } catch (Exception first) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
            catch (Exception second) { Toast.makeText(this, "Could not open link.", Toast.LENGTH_SHORT).show(); }
        }
    }

    private static String first(String... values) { for (String value : values) if (value != null && !value.trim().isEmpty()) return value.trim(); return ""; }
    private void deliverSharedText(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String type = intent.getType(); if (type != null && !type.startsWith("text/")) return;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT); if (text == null || text.trim().isEmpty()) text = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if (text == null || text.trim().isEmpty()) return;
        webView.evaluateJavascript("window.H38SharedOpportunity&&window.H38SharedOpportunity(" + JSONObject.quote(text.trim()) + ");", null); intent.setAction(null);
    }
    private void requestPhoneLocation() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED && checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) { requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQUEST_LOCATION); return; }
        deliverLocation();
    }
    private void deliverLocation() {
        try {
            LocationManager manager = (LocationManager) getSystemService(LOCATION_SERVICE); Location best = null;
            for (String provider : new String[]{LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER}) { try { Location candidate = manager.getLastKnownLocation(provider); if (candidate != null && (best == null || candidate.getAccuracy() < best.getAccuracy())) best = candidate; } catch (SecurityException ignored) {} }
            if (best != null && System.currentTimeMillis() - best.getTime() < 15 * 60 * 1000L) { sendLocation(best.getLatitude(), best.getLongitude()); return; }
            String provider = manager.isProviderEnabled(LocationManager.GPS_PROVIDER) ? LocationManager.GPS_PROVIDER : LocationManager.NETWORK_PROVIDER;
            manager.requestSingleUpdate(provider, new LocationListener() {
                @Override public void onLocationChanged(Location location) { sendLocation(location.getLatitude(), location.getLongitude()); }
                @Override public void onProviderEnabled(String p) {} @Override public void onProviderDisabled(String p) {} @Override public void onStatusChanged(String p, int status, Bundle extras) {}
            }, Looper.getMainLooper());
        } catch (Exception e) { sendLocationError(e.getMessage() == null ? "Location unavailable" : e.getMessage()); }
    }
    private void sendLocation(double lat, double lon) { webView.post(() -> webView.evaluateJavascript("window.H38NativeLocationResult&&window.H38NativeLocationResult(" + lat + "," + lon + ");", null)); }
    private void sendLocationError(String text) { webView.post(() -> webView.evaluateJavascript("window.H38NativeLocationError&&window.H38NativeLocationError(" + JSONObject.quote(text) + ");", null)); }
    private void sendBarcode(String value) { String finalValue = value == null ? "" : value.trim(); webView.post(() -> webView.evaluateJavascript("window.H38NativeBarcodeResult&&window.H38NativeBarcodeResult(" + JSONObject.quote(finalValue) + ");", null)); }
    private void sendBarcodeError(String text) { String finalText = text == null || text.isBlank() ? "Barcode scan failed." : text; webView.post(() -> webView.evaluateJavascript("window.H38NativeBarcodeError&&window.H38NativeBarcodeError(" + JSONObject.quote(finalText) + ");", null)); }
    private void scanBarcode() {
        GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_ALL_FORMATS).enableAutoZoom().build();
        GmsBarcodeScanner scanner = GmsBarcodeScanning.getClient(this, options);
        scanner.startScan().addOnSuccessListener(barcode -> { String value = barcode.getRawValue(); if (value == null) value = barcode.getDisplayValue(); sendBarcode(value); }).addOnCanceledListener(() -> sendBarcodeError("Scan canceled")).addOnFailureListener(e -> runOnUiThread(this::startFallbackBarcodeScanner));
    }
    private void startFallbackBarcodeScanner() {
        try { IntentIntegrator integrator = new IntentIntegrator(this); integrator.setDesiredBarcodeFormats(IntentIntegrator.ALL_CODE_TYPES); integrator.setPrompt("Point the camera at the barcode"); integrator.setBeepEnabled(false); integrator.setOrientationLocked(true); integrator.initiateScan(); }
        catch (Exception e) { sendBarcodeError("Barcode scanner unavailable. Type the UPC instead."); }
    }
    private void takePhoto(String role) {
        pendingPhotoRole = role == null || role.trim().isEmpty() ? "item" : role.trim();
        try { Intent intent = new Intent(this, NativePhotoCaptureActivity.class); intent.putExtra(NativePhotoCaptureActivity.EXTRA_ROLE, pendingPhotoRole); startActivityForResult(intent, REQUEST_PHOTO); }
        catch (Exception e) { webView.evaluateJavascript("window.H38NativePhotoError&&window.H38NativePhotoError('Scout camera could not open.');", null); }
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        IntentResult scanResult = IntentIntegrator.parseActivityResult(requestCode, resultCode, data);
        if (scanResult != null) { if (scanResult.getContents() == null || scanResult.getContents().isBlank()) sendBarcodeError("Scan canceled"); else sendBarcode(scanResult.getContents()); return; }
        if (requestCode != REQUEST_PHOTO) return;
        if (resultCode != RESULT_OK) { String error = data == null ? "Photo canceled" : data.getStringExtra(NativePhotoCaptureActivity.EXTRA_ERROR); if (error == null || error.isBlank()) error = "Photo canceled"; String finalError = error; webView.evaluateJavascript("window.H38NativePhotoError&&window.H38NativePhotoError(" + JSONObject.quote(finalError) + ");", null); return; }
        String path = data == null ? "" : data.getStringExtra(NativePhotoCaptureActivity.EXTRA_PATH); String role = data == null ? pendingPhotoRole : data.getStringExtra(NativePhotoCaptureActivity.EXTRA_ROLE); File file = path == null || path.isBlank() ? null : new File(path); Bitmap bitmap = null;
        try {
            if (file == null || !file.isFile() || file.length() <= 0) throw new IllegalStateException("Camera did not return an image"); bitmap = BitmapFactory.decodeFile(file.getAbsolutePath()); if (bitmap == null) throw new IllegalStateException("Camera returned an unreadable image"); bitmap = scaleForResearch(bitmap, 1600);
            try (ByteArrayOutputStream out = new ByteArrayOutputStream()) { bitmap.compress(Bitmap.CompressFormat.JPEG, 84, out); String b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP); String dataUrl = "data:image/jpeg;base64," + b64; String js = "window.H38NativePhotoResult&&window.H38NativePhotoResult(" + JSONObject.quote(role == null ? pendingPhotoRole : role) + "," + JSONObject.quote(dataUrl) + ");"; webView.evaluateJavascript(js, null); }
        } catch (Exception e) { webView.evaluateJavascript("window.H38NativePhotoError&&window.H38NativePhotoError('Camera returned an unreadable image.');", null); }
        finally { try { if (file != null && file.exists()) file.delete(); } catch (Exception ignored) {} if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle(); }
    }
    private static Bitmap scaleForResearch(Bitmap source, int maxDimension) { int w = source.getWidth(), h = source.getHeight(); if (w <= maxDimension && h <= maxDimension) return source; double scale = Math.min((double) maxDimension / Math.max(1, w), (double) maxDimension / Math.max(1, h)); int nw = Math.max(1, (int) Math.round(w * scale)), nh = Math.max(1, (int) Math.round(h * scale)); Bitmap scaled = Bitmap.createScaledBitmap(source, nw, nh, true); if (scaled != source) source.recycle(); return scaled; }
    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) { super.onRequestPermissionsResult(requestCode, permissions, grantResults); if (requestCode != REQUEST_LOCATION) return; boolean granted = false; for (int result : grantResults) if (result == PackageManager.PERMISSION_GRANTED) granted = true; if (granted) deliverLocation(); else sendLocationError("Location permission denied"); }
    @Override public void onBackPressed() { if (webView == null) { super.onBackPressed(); return; } webView.evaluateJavascript("(window.H38HandleBack?window.H38HandleBack():false)", value -> { if (!"true".equals(String.valueOf(value))) MainActivity.super.onBackPressed(); }); }
    private String buildIdentity() { String sha = BuildConfig.H38_BUILD_SHA == null ? "local" : BuildConfig.H38_BUILD_SHA; if (sha.length() > 12) sha = sha.substring(0, 12); return "v" + BuildConfig.VERSION_NAME + " · code " + BuildConfig.VERSION_CODE + " · " + sha + " · run " + BuildConfig.H38_BUILD_RUN; }

    private final class NativeBridge {
        @JavascriptInterface public void requestLocation() { runOnUiThread(MainActivity.this::requestPhoneLocation); }
        @JavascriptInterface public void scanBarcode() { runOnUiThread(MainActivity.this::scanBarcode); }
        @JavascriptInterface public void takePhoto(String role) { runOnUiThread(() -> MainActivity.this.takePhoto(role)); }
        @JavascriptInterface public String build() { return buildIdentity(); }
        @JavascriptInterface public void reloadScout() { runOnUiThread(MainActivity.this::recreate); }
        @JavascriptInterface public boolean notificationAccessEnabled() { try { String enabled = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners"); return enabled != null && enabled.contains(getPackageName()); } catch (Exception ignored) { return false; } }
        @JavascriptInterface public void openNotificationAccessSettings() { runOnUiThread(() -> { try { startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)); } catch (Exception ignored) {} }); }
        @JavascriptInterface public String facebookNotificationCandidates() { return FacebookMarketplaceNotificationListener.rowsJson(MainActivity.this); }
        @JavascriptInterface public String facebookBrowserCandidates() { return FacebookMarketplaceActivity.rowsJson(MainActivity.this); }
        @JavascriptInterface public void openFacebookMarketplace(String termsJson, double lat, double lon, int radius, String postal, String url) { runOnUiThread(() -> { Intent i = new Intent(MainActivity.this, FacebookMarketplaceActivity.class); i.putExtra(FacebookMarketplaceActivity.EXTRA_TERMS, termsJson == null ? "[]" : termsJson); if (Double.isFinite(lat) && Double.isFinite(lon) && !(lat == 0d && lon == 0d)) { i.putExtra(FacebookMarketplaceActivity.EXTRA_LAT, lat); i.putExtra(FacebookMarketplaceActivity.EXTRA_LON, lon); } i.putExtra(FacebookMarketplaceActivity.EXTRA_RADIUS, radius); i.putExtra(FacebookMarketplaceActivity.EXTRA_POSTAL, postal == null ? "" : postal); if (url != null && url.startsWith("https://www.facebook.com/marketplace/")) i.putExtra(FacebookMarketplaceActivity.EXTRA_URL, url); startActivity(i); }); }
        @JavascriptInterface public void openExternalUrl(String url) { runOnUiThread(() -> openExternal(url)); }
        @JavascriptInterface public void startDeviceStockCheck(String requestId, String bodyJson) { RetailerDeviceCheckManager.check(MainActivity.this, webView, requestId, bodyJson); }
        @JavascriptInterface public void openRetailerSession(String bodyJson) { runOnUiThread(() -> { try { JSONObject b = new JSONObject(bodyJson == null ? "{}" : bodyJson); String retailer = b.optString("retailer", ""); String query = first(b.optString("upc", ""), b.optString("sku", ""), b.optString("title", ""), "tools"); Intent i = new Intent(MainActivity.this, RetailerVerificationActivity.class); i.putExtra(RetailerVerificationActivity.EXTRA_RETAILER, retailer); i.putExtra(RetailerVerificationActivity.EXTRA_QUERY, query); i.putExtra(RetailerVerificationActivity.EXTRA_SOURCE_URL, b.optString("source_url", "")); i.putExtra(RetailerVerificationActivity.EXTRA_STORE, b.optString("store_address", b.optString("store_name", ""))); startActivity(i); } catch (Exception ignored) {} }); }
    }
}
