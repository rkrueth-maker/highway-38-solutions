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
import android.provider.MediaStore;
import android.speech.RecognizerIntent;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;
import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.util.ArrayList;
import java.util.Locale;

/**
 * H38 Deals native shell.
 *
 * Product logic lives on the hosted Penny, Resale and Couponing web apps. This
 * activity owns reusable phone capabilities plus a strict top-level HTML
 * transport boundary so hosted product pages cannot be displayed as source.
 */
public final class MainActivity extends Activity {
    public static final String H38_DEALS_THIN_SHELL = "H38_DEALS_THIN_SHELL_V311";
    private static final String SHELL_URL = "https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/h38-deals-shell";
    private static final String INTERNAL_PREFIX = "https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/h38-";
    private static final int REQUEST_LOCATION = 4101;
    private static final int REQUEST_PHOTO = 4102;
    private static final int REQUEST_WEB_FILE = 4103;
    private static final int REQUEST_SPEECH = 4104;
    private static final int REQUEST_WEB_CAMERA_PERMISSION = 4105;

    private WebView webView;
    private String pendingPhotoRole = "item";
    private ValueCallback<Uri[]> fileChooser;
    private Uri pendingCameraUri;
    private File pendingCameraFile;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(11, 36, 56));
        getWindow().setNavigationBarColor(Color.WHITE);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(243, 246, 248));
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(243, 246, 248));
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString() + " H38DealsAndroid/3.1.1");

        NativeBridge bridge = new NativeBridge();
        webView.addJavascriptInterface(bridge, "AndroidH38Deals");
        webView.setWebViewClient(new HostedHtmlWebViewClient(this, this::routeUrl));
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileChooser != null) fileChooser.onReceiveValue(null);
                fileChooser = callback;
                if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, REQUEST_WEB_CAMERA_PERMISSION);
                } else {
                    launchWebFileChooser(true);
                }
                return true;
            }
        });
        webView.loadUrl(SHELL_URL);
    }

    private boolean routeUrl(String url) {
        if (url == null || url.isBlank()) return false;
        if (HostedHtmlWebViewClient.isHostedHtmlPage(url)) return false;
        if (url.startsWith(INTERNAL_PREFIX)) return false;
        if (url.startsWith("https://") || url.startsWith("http://")) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
            catch (Exception e) { Toast.makeText(this, "Could not open link.", Toast.LENGTH_SHORT).show(); }
            return true;
        }
        return false;
    }

    private void launchWebFileChooser(boolean includeCamera) {
        if (fileChooser == null) return;
        try {
            Intent pick = new Intent(Intent.ACTION_GET_CONTENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("image/*");
            Intent chooser = Intent.createChooser(pick, "Choose image");
            if (includeCamera) {
                Intent camera = createCameraIntent();
                if (camera != null) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
            }
            startActivityForResult(chooser, REQUEST_WEB_FILE);
        } catch (Exception e) {
            fileChooser.onReceiveValue(null);
            fileChooser = null;
            pendingCameraUri = null;
            pendingCameraFile = null;
        }
    }

    private Intent createCameraIntent() {
        try {
            pendingCameraFile = File.createTempFile("h38-web-photo-", ".jpg", getCacheDir());
            pendingCameraUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", pendingCameraFile);
            Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            camera.putExtra(MediaStore.EXTRA_OUTPUT, pendingCameraUri);
            camera.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            return camera;
        } catch (Exception e) {
            pendingCameraUri = null;
            pendingCameraFile = null;
            return null;
        }
    }

    private void requestPhoneLocation() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
                && checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
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
            sendLocationError("Location unavailable");
        }
    }

    private void sendLocation(double lat, double lon) {
        webView.post(() -> webView.evaluateJavascript(
                "window.H38NativeLocationResult&&window.H38NativeLocationResult(" + lat + "," + lon + ");", null));
    }

    private void sendLocationError(String message) {
        webView.post(() -> webView.evaluateJavascript(
                "window.H38NativeLocationError&&window.H38NativeLocationError(" + JSONObject.quote(message) + ");", null));
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
                .addOnCanceledListener(() -> sendBarcode(""))
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
            sendBarcode("");
        }
    }

    private void sendBarcode(String value) {
        String clean = value == null ? "" : value.trim();
        webView.post(() -> webView.evaluateJavascript(
                "window.H38NativeBarcodeResult&&window.H38NativeBarcodeResult(" + JSONObject.quote(clean) + ");", null));
    }

    private void speakList() {
        try {
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault());
            intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Say your shopping list");
            startActivityForResult(intent, REQUEST_SPEECH);
        } catch (Exception e) {
            sendSpeechError("Voice input unavailable");
        }
    }

    private void sendSpeech(String text) {
        String clean = text == null ? "" : text.trim();
        webView.post(() -> webView.evaluateJavascript(
                "window.H38NativeSpeechResult&&window.H38NativeSpeechResult(" + JSONObject.quote(clean) + ");", null));
    }

    private void sendSpeechError(String text) {
        webView.post(() -> webView.evaluateJavascript(
                "window.H38NativeSpeechError&&window.H38NativeSpeechError(" + JSONObject.quote(text) + ");", null));
    }

    private void takePhoto(String role) {
        pendingPhotoRole = role == null || role.isBlank() ? "item" : role.trim();
        try {
            Intent intent = new Intent(this, NativePhotoCaptureActivity.class);
            intent.putExtra(NativePhotoCaptureActivity.EXTRA_ROLE, pendingPhotoRole);
            startActivityForResult(intent, REQUEST_PHOTO);
        } catch (Exception e) {
            sendPhotoError("Camera unavailable");
        }
    }

    private void sendPhotoError(String message) {
        webView.post(() -> webView.evaluateJavascript(
                "window.H38NativePhotoError&&window.H38NativePhotoError(" + JSONObject.quote(message) + ");", null));
    }

    private static Bitmap scaleForWeb(Bitmap source, int maxDimension) {
        int w = source.getWidth(), h = source.getHeight();
        if (w <= maxDimension && h <= maxDimension) return source;
        double scale = Math.min((double) maxDimension / Math.max(1, w), (double) maxDimension / Math.max(1, h));
        Bitmap out = Bitmap.createScaledBitmap(source,
                Math.max(1, (int) Math.round(w * scale)),
                Math.max(1, (int) Math.round(h * scale)), true);
        if (out != source) source.recycle();
        return out;
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        IntentResult scanResult = IntentIntegrator.parseActivityResult(requestCode, resultCode, data);
        if (scanResult != null) {
            sendBarcode(scanResult.getContents());
            return;
        }

        if (requestCode == REQUEST_SPEECH) {
            if (resultCode != RESULT_OK || data == null) { sendSpeechError("Voice input canceled"); return; }
            ArrayList<String> rows = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            sendSpeech(rows == null || rows.isEmpty() ? "" : rows.get(0));
            return;
        }

        if (requestCode == REQUEST_WEB_FILE) {
            if (fileChooser == null) return;
            Uri[] result = null;
            if (resultCode == RESULT_OK) {
                Uri uri = data != null ? data.getData() : null;
                if (uri == null) uri = pendingCameraUri;
                if (uri != null) result = new Uri[]{uri};
            }
            fileChooser.onReceiveValue(result);
            fileChooser = null;
            pendingCameraUri = null;
            pendingCameraFile = null;
            return;
        }

        if (requestCode != REQUEST_PHOTO) return;
        if (resultCode != RESULT_OK) { sendPhotoError("Photo canceled"); return; }

        String path = data == null ? null : data.getStringExtra(NativePhotoCaptureActivity.EXTRA_PATH);
        String role = data == null ? pendingPhotoRole : data.getStringExtra(NativePhotoCaptureActivity.EXTRA_ROLE);
        File file = path == null ? null : new File(path);
        Bitmap bitmap = null;
        try {
            if (file == null || !file.isFile() || file.length() <= 0) throw new IllegalStateException("No photo file");
            bitmap = BitmapFactory.decodeFile(file.getAbsolutePath());
            if (bitmap == null) throw new IllegalStateException("Unreadable photo");
            bitmap = scaleForWeb(bitmap, 1600);
            try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                bitmap.compress(Bitmap.CompressFormat.JPEG, 84, out);
                String dataUrl = "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
                String finalRole = role == null ? pendingPhotoRole : role;
                webView.evaluateJavascript(
                        "window.H38NativePhotoResult&&window.H38NativePhotoResult(" + JSONObject.quote(finalRole) + "," + JSONObject.quote(dataUrl) + ");", null);
            }
        } catch (Exception e) {
            sendPhotoError("Photo could not be read");
        } finally {
            try { if (file != null && file.exists()) file.delete(); } catch (Exception ignored) {}
            if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
        }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_LOCATION) {
            for (int result : grantResults) if (result == PackageManager.PERMISSION_GRANTED) { deliverLocation(); return; }
            sendLocationError("Location permission denied");
            return;
        }
        if (requestCode == REQUEST_WEB_CAMERA_PERMISSION) {
            boolean granted = false;
            for (int result : grantResults) if (result == PackageManager.PERMISSION_GRANTED) granted = true;
            launchWebFileChooser(granted);
        }
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    private String buildIdentity() {
        String sha = BuildConfig.H38_BUILD_SHA == null ? "local" : BuildConfig.H38_BUILD_SHA;
        if (sha.length() > 12) sha = sha.substring(0, 12);
        return "v" + BuildConfig.VERSION_NAME + " · code " + BuildConfig.VERSION_CODE + " · " + sha;
    }

    private final class NativeBridge {
        @JavascriptInterface public void requestLocation() { runOnUiThread(MainActivity.this::requestPhoneLocation); }
        @JavascriptInterface public void scanBarcode() { runOnUiThread(MainActivity.this::scanBarcode); }
        @JavascriptInterface public void speakList() { runOnUiThread(MainActivity.this::speakList); }
        @JavascriptInterface public void takePhoto(String role) { runOnUiThread(() -> MainActivity.this.takePhoto(role)); }
        @JavascriptInterface public void reload() { runOnUiThread(() -> webView.loadUrl(SHELL_URL)); }
        @JavascriptInterface public String build() { return buildIdentity(); }
    }
}
