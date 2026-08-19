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
    private static final String APP_BASE_URL = "https://highway38solutions.com/commercial-app/reseller-owner-test/";
    private static final int REQUEST_LOCATION = 3901;
    private static final String BUILD_MARKER = "HOME_DEPOT_PENNY_AUTO_PRICE_QTY_ON_STORE_OPEN_V1";
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(237, 242, 245));
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
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
        settings.setUserAgentString(settings.getUserAgentString() + " H38ResellerScoutAndroid/0.1.13-hd-penny");

        webView.addJavascriptInterface(new ResellerBridge(), "AndroidH38Reseller");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                Uri uri = request.getUrl();
                String url = uri == null ? "" : uri.toString();
                if (url.startsWith(APP_BASE_URL)) return false;
                if (uri != null && ("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme()))) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                        return true;
                    } catch (Exception ignored) {
                        return false;
                    }
                }
                return true;
            }
        });
        loadEmbeddedApp();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_LOCATION) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) deliverLocation();
            else sendLocationError("Location permission is required for the local Home Depot search.");
        }
    }

    private void loadEmbeddedApp() {
        try (InputStream input = getAssets().open("reseller/index.html"); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            String html = output.toString(StandardCharsets.UTF_8.name());
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
            if (best != null) {
                sendLocation(best);
                return;
            }
            String provider = manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) ? LocationManager.NETWORK_PROVIDER :
                    (manager.isProviderEnabled(LocationManager.GPS_PROVIDER) ? LocationManager.GPS_PROVIDER : null);
            if (provider == null) {
                sendLocationError("Turn on phone location services.");
                return;
            }
            manager.requestSingleUpdate(provider, new LocationListener() {
                @Override public void onLocationChanged(Location location) { sendLocation(location); }
                @Override public void onProviderEnabled(String provider) {}
                @Override public void onProviderDisabled(String provider) {}
                @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
            }, Looper.getMainLooper());
        } catch (Exception error) {
            sendLocationError(error.getMessage());
        }
    }

    private void sendLocation(Location location) {
        if (webView == null || location == null) return;
        double lat = location.getLatitude(), lon = location.getLongitude();
        webView.post(() -> webView.evaluateJavascript(
                "window.H38NativeLocationResult && window.H38NativeLocationResult(" + lat + "," + lon + ");", null));
    }

    private void sendLocationError(String text) {
        if (webView == null) return;
        String encoded = JSONObject.quote(text == null ? "Location unavailable." : text);
        webView.post(() -> webView.evaluateJavascript(
                "window.H38NativeLocationError && window.H38NativeLocationError(" + encoded + ");", null));
    }

    private void sendBarcode(String value) {
        if (webView == null) return;
        String encoded = JSONObject.quote(value == null ? "" : value);
        webView.post(() -> webView.evaluateJavascript(
                "window.H38NativeBarcodeResult && window.H38NativeBarcodeResult(" + encoded + ");", null));
    }

    private void sendBarcodeError(String value) {
        if (webView == null) return;
        String encoded = JSONObject.quote(value == null ? "Barcode scanner unavailable." : value);
        webView.post(() -> webView.evaluateJavascript(
                "window.H38NativeBarcodeError && window.H38NativeBarcodeError(" + encoded + ");", null));
    }

    private final class ResellerBridge {
        @JavascriptInterface
        public void requestLocation() {
            runOnUiThread(MainActivity.this::requestLocationPermissionOrDeliver);
        }

        @JavascriptInterface
        public void scanBarcode() {
            runOnUiThread(() -> {
                GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder()
                        .setBarcodeFormats(
                                Barcode.FORMAT_UPC_A,
                                Barcode.FORMAT_UPC_E,
                                Barcode.FORMAT_EAN_13,
                                Barcode.FORMAT_EAN_8,
                                Barcode.FORMAT_CODE_128,
                                Barcode.FORMAT_QR_CODE)
                        .enableAutoZoom()
                        .build();
                GmsBarcodeScanner scanner = GmsBarcodeScanning.getClient(MainActivity.this, options);
                scanner.startScan()
                        .addOnSuccessListener(barcode -> {
                            String raw = barcode.getRawValue();
                            if (raw == null || raw.trim().isEmpty()) sendBarcodeError("No barcode value was returned.");
                            else sendBarcode(raw.trim());
                        })
                        .addOnCanceledListener(() -> sendBarcodeError("Scan canceled."))
                        .addOnFailureListener(error -> sendBarcodeError(error.getMessage()));
            });
        }

        @JavascriptInterface
        public String build() {
            return "20260819-home-depot-penny-auto-price-qty-v1-" + BUILD_MARKER;
        }
    }
}
