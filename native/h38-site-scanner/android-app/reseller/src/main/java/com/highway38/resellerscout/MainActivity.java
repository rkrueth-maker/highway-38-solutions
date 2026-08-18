package com.highway38.resellerscout;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    private static final String APP_BASE_URL =
            "https://highway38solutions.com/commercial-app/reseller-owner-test/";
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(238, 243, 247));
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(
                settings.getUserAgentString() + " H38ResellerScoutAndroid/0.1.0"
        );

        webView.addJavascriptInterface(new ResellerBridge(), "AndroidH38Reseller");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                Uri uri = request.getUrl();
                String url = uri == null ? "" : uri.toString();
                if (url.startsWith(APP_BASE_URL)) return false;
                if ("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme())) {
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
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private void loadEmbeddedApp() {
        try (InputStream input = getAssets().open("reseller/index.html");
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            String html = output.toString(StandardCharsets.UTF_8.name());
            webView.loadDataWithBaseURL(APP_BASE_URL, html, "text/html", "UTF-8", APP_BASE_URL);
        } catch (Exception error) {
            Toast.makeText(this, "Reseller Scout failed to open: " + error.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void sendBarcode(String value) {
        if (webView == null) return;
        String encoded = JSONObject.quote(value == null ? "" : value);
        webView.post(() -> webView.evaluateJavascript(
                "window.H38NativeBarcodeResult && window.H38NativeBarcodeResult(" + encoded + ");",
                null
        ));
    }

    private void sendBarcodeError(String value) {
        if (webView == null) return;
        String encoded = JSONObject.quote(value == null ? "Barcode scanner unavailable." : value);
        webView.post(() -> webView.evaluateJavascript(
                "window.H38NativeBarcodeError && window.H38NativeBarcodeError(" + encoded + ");",
                null
        ));
    }

    private final class ResellerBridge {
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
                                Barcode.FORMAT_QR_CODE
                        )
                        .enableAutoZoom()
                        .build();
                GmsBarcodeScanner scanner = GmsBarcodeScanning.getClient(MainActivity.this, options);
                scanner.startScan()
                        .addOnSuccessListener(barcode -> {
                            String raw = barcode.getRawValue();
                            if (raw == null || raw.trim().isEmpty()) {
                                sendBarcodeError("No barcode value was returned.");
                            } else {
                                sendBarcode(raw.trim());
                            }
                        })
                        .addOnCanceledListener(() -> sendBarcodeError("Scan canceled."))
                        .addOnFailureListener(error -> sendBarcodeError(error.getMessage()));
            });
        }

        @JavascriptInterface
        public String build() {
            return "20260818-owner-test-1";
        }
    }
}
