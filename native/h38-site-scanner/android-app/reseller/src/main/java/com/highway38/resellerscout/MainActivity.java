package com.highway38.resellerscout;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Looper;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.core.content.FileProvider;
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
import java.util.List;

public final class MainActivity extends Activity {
    public static final String PRODUCT_FLOW_MARKER = "H38_SCOUT_PRODUCT_FLOW_V037";
    public static final String NATIVE_SAFE_AREA_V037 = "NATIVE_ROOT_SYSTEM_BAR_INSETS_V037";
    public static final String EXPORTED_CAMERA_HANDLER_V037 = "EXPORTED_CAMERA_HANDLER_V037";
    private static final String APP_BASE_URL = "https://highway38solutions.com/commercial-app/reseller-owner-test/";
    private static final int REQUEST_LOCATION = 3901;
    private static final int REQUEST_PHOTO = 3902;
    private FrameLayout contentRoot;
    private WebView webView;
    private String pendingPhotoRole = "item";
    private File pendingPhotoFile;
    private Uri pendingPhotoUri;
    private String pendingPhotoPackage;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(11, 36, 56));
        getWindow().setNavigationBarColor(Color.WHITE);

        contentRoot = new FrameLayout(this);
        contentRoot.setBackgroundColor(Color.rgb(238, 243, 247));
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(238, 243, 247));
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
        settings.setUserAgentString(settings.getUserAgentString() + " H38ResellerScoutAndroid/0.1.37-physical-safe-area");

        NativeBridge bridge = new NativeBridge();
        webView.addJavascriptInterface(bridge, "AndroidH38Reseller");
        webView.addJavascriptInterface(bridge, "AndroidH38Scout");
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url == null) return false;
                if (url.startsWith(APP_BASE_URL)) return false;
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    openExternal(url);
                    return true;
                }
                return false;
            }
            @Override public void onPageFinished(WebView view, String url) {
                deliverSharedText(getIntent());
            }
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
        for (String name : new String[]{"v035-ui.css", "v037-safearea.css"}) {
            html = html.replace("<link rel=\"stylesheet\" href=\"" + name + "\">", "<style>" + readAsset("reseller/" + name) + "</style>");
        }
        for (String name : new String[]{"v035-core.js", "v035-sourcing-a.js", "v035-sourcing-b.js", "v035-research.js", "v035-app.js", "v037-physical.js"}) {
            html = html.replace("<script src=\"" + name + "\"></script>", "<script>" + readAsset("reseller/" + name) + "</script>");
        }
        return html;
    }

    private String readAsset(String path) {
        try (InputStream in = getAssets().open(path); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = in.read(buffer)) > 0) out.write(buffer, 0, count);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "<!doctype html><body><h2>Scout asset failed to load</h2><pre>" + e.getMessage() + "</pre></body>";
        }
    }

    private void openExternal(String url) {
        try {
            if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) return;
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception e) {
            Toast.makeText(this, "Could not open link.", Toast.LENGTH_SHORT).show();
        }
    }

    private static String first(String... values) {
        for (String value : values) if (value != null && !value.trim().isEmpty()) return value.trim();
        return "";
    }

    private void deliverSharedText(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String type = intent.getType();
        if (type != null && !type.startsWith("text/")) return;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.trim().isEmpty()) text = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if (text == null || text.trim().isEmpty()) return;
        String js = "window.H38SharedOpportunity&&window.H38SharedOpportunity(" + JSONObject.quote(text.trim()) + ");";
        webView.evaluateJavascript(js, null);
        intent.setAction(null);
    }

    private void requestPhoneLocation() {
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
            for (String provider : new String[]{LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER}) {
                try {
                    Location candidate = manager.getLastKnownLocation(provider);
                    if (candidate != null && (best == null || candidate.getAccuracy() < best.getAccuracy())) best = candidate;
                } catch (SecurityException ignored) {}
            }
            if (best != null && System.currentTimeMillis() - best.getTime() < 15 * 60 * 1000L) {
                sendLocation(best.getLatitude(), best.getLongitude());
                return;
            }
            String provider = manager.isProviderEnabled(LocationManager.GPS_PROVIDER) ? LocationManager.GPS_PROVIDER : LocationManager.NETWORK_PROVIDER;
            manager.requestSingleUpdate(provider, new LocationListener() {
                @Override public void onLocationChanged(Location location) { sendLocation(location.getLatitude(), location.getLongitude()); }
                @Override public void onProviderEnabled(String p) {}
                @Override public void onProviderDisabled(String p) {}
                @Override public void onStatusChanged(String p, int status, Bundle extras) {}
            }, Looper.getMainLooper());
        } catch (Exception e) {
            sendLocationError(e.getMessage() == null ? "Location unavailable" : e.getMessage());
        }
    }

    private void sendLocation(double lat, double lon) {
        webView.post(() -> webView.evaluateJavascript("window.H38NativeLocationResult&&window.H38NativeLocationResult(" + lat + "," + lon + ");", null));
    }

    private void sendLocationError(String text) {
        webView.post(() -> webView.evaluateJavascript("window.H38NativeLocationError&&window.H38NativeLocationError(" + JSONObject.quote(text) + ");", null));
    }

    private void sendBarcode(String value) {
        String finalValue = value == null ? "" : value.trim();
        webView.post(() -> webView.evaluateJavascript("window.H38NativeBarcodeResult&&window.H38NativeBarcodeResult(" + JSONObject.quote(finalValue) + ");", null));
    }

    private void sendBarcodeError(String text) {
        String finalText = text == null || text.isBlank() ? "Barcode scan failed." : text;
        webView.post(() -> webView.evaluateJavascript("window.H38NativeBarcodeError&&window.H38NativeBarcodeError(" + JSONObject.quote(finalText) + ");", null));
    }

    private void scanBarcode() {
        GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_ALL_FORMATS)
                .enableAutoZoom()
                .build();
        GmsBarcodeScanner scanner = GmsBarcodeScanning.getClient(this, options);
        scanner.startScan()
                .addOnSuccessListener(barcode -> {
                    String value = barcode.getRawValue();
                    if (value == null) value = barcode.getDisplayValue();
                    sendBarcode(value);
                })
                .addOnCanceledListener(() -> sendBarcodeError("Scan canceled"))
                .addOnFailureListener(e -> runOnUiThread(this::startFallbackBarcodeScanner));
    }

    private void startFallbackBarcodeScanner() {
        try {
            IntentIntegrator integrator = new IntentIntegrator(this);
            integrator.setDesiredBarcodeFormats(IntentIntegrator.ALL_CODE_TYPES);
            integrator.setPrompt("Point the camera at the barcode");
            integrator.setBeepEnabled(false);
            integrator.setOrientationLocked(true);
            integrator.initiateScan();
        } catch (Exception e) {
            sendBarcodeError("Barcode scanner unavailable. Type the UPC/model instead.");
        }
    }

    private ResolveInfo exportedCameraHandler(Intent intent) {
        List<ResolveInfo> handlers = getPackageManager().queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY);
        for (ResolveInfo handler : handlers) {
            if (handler != null && handler.activityInfo != null && handler.activityInfo.exported) return handler;
        }
        return null;
    }

    private void takePhoto(String role) {
        pendingPhotoRole = role == null || role.trim().isEmpty() ? "item" : role.trim();
        try {
            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            ResolveInfo handler = exportedCameraHandler(intent);
            if (handler == null) throw new IllegalStateException("No compatible camera app is available.");
            pendingPhotoFile = new File(getCacheDir(), "scout-photo-" + System.currentTimeMillis() + ".jpg");
            pendingPhotoUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", pendingPhotoFile);
            pendingPhotoPackage = handler.activityInfo.packageName;
            intent.setComponent(new ComponentName(handler.activityInfo.packageName, handler.activityInfo.name));
            intent.putExtra(MediaStore.EXTRA_OUTPUT, pendingPhotoUri);
            intent.setClipData(ClipData.newRawUri("scout-photo", pendingPhotoUri));
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            grantUriPermission(pendingPhotoPackage, pendingPhotoUri, Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(intent, REQUEST_PHOTO);
        } catch (Exception e) {
            cleanupPhoto();
            webView.evaluateJavascript("window.H38NativePhotoError&&window.H38NativePhotoError('Camera could not open on this phone.');", null);
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        IntentResult scanResult = IntentIntegrator.parseActivityResult(requestCode, resultCode, data);
        if (scanResult != null) {
            if (scanResult.getContents() == null || scanResult.getContents().isBlank()) sendBarcodeError("Scan canceled");
            else sendBarcode(scanResult.getContents());
            return;
        }

        if (requestCode != REQUEST_PHOTO) return;
        if (resultCode != RESULT_OK) {
            cleanupPhoto();
            webView.evaluateJavascript("window.H38NativePhotoError&&window.H38NativePhotoError('Photo canceled');", null);
            return;
        }
        Bitmap bitmap = null;
        try {
            if (pendingPhotoFile != null && pendingPhotoFile.isFile() && pendingPhotoFile.length() > 0) {
                bitmap = BitmapFactory.decodeFile(pendingPhotoFile.getAbsolutePath());
            }
            if (bitmap == null && data != null && data.getExtras() != null) {
                Object raw = data.getExtras().get("data");
                if (raw instanceof Bitmap) bitmap = (Bitmap) raw;
            }
            if (bitmap == null) throw new IllegalStateException("Camera did not return an image");
            bitmap = scaleForResearch(bitmap, 1600);
            try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                bitmap.compress(Bitmap.CompressFormat.JPEG, 84, out);
                String b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
                String dataUrl = "data:image/jpeg;base64," + b64;
                String js = "window.H38NativePhotoResult&&window.H38NativePhotoResult(" + JSONObject.quote(pendingPhotoRole) + "," + JSONObject.quote(dataUrl) + ");";
                webView.evaluateJavascript(js, null);
            }
        } catch (Exception e) {
            webView.evaluateJavascript("window.H38NativePhotoError&&window.H38NativePhotoError('Camera returned an unreadable image.');", null);
        } finally {
            cleanupPhoto();
        }
    }

    private static Bitmap scaleForResearch(Bitmap source, int maxDimension) {
        int w = source.getWidth(), h = source.getHeight();
        if (w <= maxDimension && h <= maxDimension) return source;
        double scale = Math.min((double) maxDimension / Math.max(1, w), (double) maxDimension / Math.max(1, h));
        int nw = Math.max(1, (int) Math.round(w * scale)), nh = Math.max(1, (int) Math.round(h * scale));
        Bitmap scaled = Bitmap.createScaledBitmap(source, nw, nh, true);
        if (scaled != source) source.recycle();
        return scaled;
    }

    private void cleanupPhoto() {
        try {
            if (pendingPhotoUri != null) revokeUriPermission(pendingPhotoUri, Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (Exception ignored) {}
        try { if (pendingPhotoFile != null && pendingPhotoFile.exists()) pendingPhotoFile.delete(); } catch (Exception ignored) {}
        pendingPhotoFile = null;
        pendingPhotoUri = null;
        pendingPhotoPackage = null;
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQUEST_LOCATION) return;
        boolean granted = false;
        for (int result : grantResults) if (result == PackageManager.PERMISSION_GRANTED) granted = true;
        if (granted) deliverLocation(); else sendLocationError("Location permission denied");
    }

    @Override public void onBackPressed() {
        if (webView == null) { super.onBackPressed(); return; }
        webView.evaluateJavascript("(window.H38HandleBack?window.H38HandleBack():false)", value -> {
            if (!"true".equals(String.valueOf(value))) MainActivity.super.onBackPressed();
        });
    }

    private final class NativeBridge {
        @JavascriptInterface public void requestLocation() { runOnUiThread(MainActivity.this::requestPhoneLocation); }
        @JavascriptInterface public void scanBarcode() { runOnUiThread(MainActivity.this::scanBarcode); }
        @JavascriptInterface public void takePhoto(String role) { runOnUiThread(() -> MainActivity.this.takePhoto(role)); }
        @JavascriptInterface public String build() { return "20260820-safe-area-camera-retailer-v037"; }
        @JavascriptInterface public void reloadScout() { runOnUiThread(MainActivity.this::recreate); }
        @JavascriptInterface public boolean notificationAccessEnabled() {
            try {
                String enabled = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
                return enabled != null && enabled.contains(getPackageName());
            } catch (Exception ignored) { return false; }
        }
        @JavascriptInterface public void openNotificationAccessSettings() {
            runOnUiThread(() -> { try { startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)); } catch (Exception ignored) {} });
        }
        @JavascriptInterface public String facebookNotificationCandidates() { return FacebookMarketplaceNotificationListener.rowsJson(MainActivity.this); }
        @JavascriptInterface public String facebookBrowserCandidates() { return FacebookMarketplaceActivity.rowsJson(MainActivity.this); }
        @JavascriptInterface public void openFacebookMarketplace(String termsJson, double lat, double lon, int radius, String postal, String url) {
            runOnUiThread(() -> {
                Intent i = new Intent(MainActivity.this, FacebookMarketplaceActivity.class);
                i.putExtra(FacebookMarketplaceActivity.EXTRA_TERMS, termsJson == null ? "[]" : termsJson);
                if (Double.isFinite(lat) && Double.isFinite(lon) && !(lat == 0d && lon == 0d)) {
                    i.putExtra(FacebookMarketplaceActivity.EXTRA_LAT, lat);
                    i.putExtra(FacebookMarketplaceActivity.EXTRA_LON, lon);
                }
                i.putExtra(FacebookMarketplaceActivity.EXTRA_RADIUS, radius);
                i.putExtra(FacebookMarketplaceActivity.EXTRA_POSTAL, postal == null ? "" : postal);
                if (url != null && url.startsWith("https://www.facebook.com/marketplace/")) i.putExtra(FacebookMarketplaceActivity.EXTRA_URL, url);
                startActivity(i);
            });
        }
        @JavascriptInterface public void openExternalUrl(String url) { runOnUiThread(() -> openExternal(url)); }
        @JavascriptInterface public void startDeviceStockCheck(String requestId, String bodyJson) { RetailerDeviceCheckManager.check(MainActivity.this, webView, requestId, bodyJson); }
        @JavascriptInterface public void openRetailerSession(String bodyJson) {
            runOnUiThread(() -> {
                try {
                    JSONObject b = new JSONObject(bodyJson == null ? "{}" : bodyJson);
                    String retailer = b.optString("retailer", "");
                    String query = first(b.optString("upc", ""), b.optString("sku", ""), b.optString("title", ""), "tools");
                    Intent i = new Intent(MainActivity.this, RetailerVerificationActivity.class);
                    i.putExtra(RetailerVerificationActivity.EXTRA_RETAILER, retailer);
                    i.putExtra(RetailerVerificationActivity.EXTRA_QUERY, query);
                    i.putExtra(RetailerVerificationActivity.EXTRA_SOURCE_URL, b.optString("source_url", ""));
                    i.putExtra(RetailerVerificationActivity.EXTRA_STORE, b.optString("store_address", b.optString("store_name", "")));
                    startActivity(i);
                } catch (Exception ignored) {}
            });
        }
    }
}
