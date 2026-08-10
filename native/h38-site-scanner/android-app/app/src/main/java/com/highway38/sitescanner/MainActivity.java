package com.highway38.sitescanner;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.ViewGroup;
import android.view.autofill.AutofillManager;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {
    private static final String OFFICE_URL = "https://highway38solutions.com/commercial-app/";
    private static final String CAPTURE_RECOVERY_URL = "https://highway38solutions.com/commercial-app/__native_walkthrough_recovery";
    private static final int FILE_CHOOSER_REQUEST = 7001;
    private static final int WALKTHROUGH_CAPTURE_REQUEST = 7002;
    private static final int REQUEST_WALKTHROUGH_CAMERA_PERMISSION = 7003;
    private static final int OFFICE_BACKGROUND = Color.rgb(246, 249, 251);
    private static final String CAPTURE_PREFS = "h38_walkthrough_capture";
    private static final String CAPTURE_URI_KEY = "capture_uri";
    private static final String CAPTURE_READY_KEY = "capture_ready";

    private WebView webView;
    private View launchCover;
    private ValueCallback<Uri[]> pendingFileCallback;
    private boolean pendingFileCapture = false;
    private boolean pendingWalkthroughPermissionResume = false;
    private Uri recoveredCaptureUri;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        restoreCaptureTracking();

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(OFFICE_BACKGROUND);
        root.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        webView = new WebView(this);
        webView.setId(View.generateViewId());
        webView.setBackgroundColor(OFFICE_BACKGROUND);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            webView.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_YES);
        }
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        root.addView(webView);
        launchCover = buildLaunchCover();
        root.addView(launchCover);
        setContentView(root);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setTextZoom(100);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setUserAgentString(
                settings.getUserAgentString() + " H38SiteScannerAndroid/0.5.20"
        );
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_AUTHENTICATION)) {
            WebSettingsCompat.setWebAuthenticationSupport(
                    settings,
                    WebSettingsCompat.WEB_AUTHENTICATION_SUPPORT_FOR_APP
            );
        }

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        NativeScannerBridge nativeScannerBridge = new NativeScannerBridge(this, webView);
        webView.addJavascriptInterface(nativeScannerBridge, "AndroidH38Native");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception error) {
                    Toast.makeText(MainActivity.this, "Cannot open this link.", Toast.LENGTH_LONG).show();
                }
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri != null && CAPTURE_RECOVERY_URL.equals(uri.toString())) {
                    return openRecoveredWalkthroughResponse();
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                injectNativeScanner();
                hideLaunchCover();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                injectNativeScanner();
                hideLaunchCover();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> handleWebPermissionRequest(request));
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (pendingFileCallback != null) pendingFileCallback.onReceiveValue(null);
                pendingFileCallback = filePathCallback;

                if (recoveredCaptureUri != null) {
                    pendingFileCallback.onReceiveValue(null);
                    pendingFileCallback = null;
                    Toast.makeText(MainActivity.this, "Finishing the last recorded walkthrough first.", Toast.LENGTH_SHORT).show();
                    injectNativeScanner();
                    return true;
                }

                if (fileChooserParams.isCaptureEnabled() && acceptsVideo(fileChooserParams.getAcceptTypes())) {
                    pendingFileCapture = true;
                    if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED ||
                            ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                        pendingWalkthroughPermissionResume = true;
                        ActivityCompat.requestPermissions(MainActivity.this, new String[]{Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO}, REQUEST_WALKTHROUGH_CAMERA_PERMISSION);
                    } else {
                        launchWalkthroughVideoCapture();
                    }
                    return true;
                }

                try {
                    Intent intent = fileChooserParams.createIntent();
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                } catch (ActivityNotFoundException error) {
                    pendingFileCallback.onReceiveValue(null);
                    pendingFileCallback = null;
                    Toast.makeText(MainActivity.this, "No compatible file picker is available.", Toast.LENGTH_LONG).show();
                }
                return true;
            }
        });

        injectNativeScanner();
        webView.loadUrl(OFFICE_URL);
    }

    private boolean acceptsVideo(String[] types) {
        if (types == null || types.length == 0) return false;
        for (String type : types) {
            if (type != null && (type.startsWith("video/") || type.equals("*/*"))) return true;
        }
        return false;
    }

    private void launchWalkthroughVideoCapture() {
        Intent intent = new Intent(this, WalkthroughCaptureActivity.class);
        try {
            startActivityForResult(intent, WALKTHROUGH_CAPTURE_REQUEST);
        } catch (Exception error) {
            pendingFileCapture = false;
            if (pendingFileCallback != null) pendingFileCallback.onReceiveValue(null);
            pendingFileCallback = null;
            Toast.makeText(this, "The H38 walkthrough camera could not open.", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == WALKTHROUGH_CAPTURE_REQUEST) {
            pendingFileCapture = false;
            if (resultCode == Activity.RESULT_OK && data != null && data.getData() != null) {
                Uri captured = data.getData();
                persistCaptureTracking(captured, true);
                recoveredCaptureUri = captured;
                if (pendingFileCallback != null) {
                    pendingFileCallback.onReceiveValue(new Uri[]{captured});
                    pendingFileCallback = null;
                }
                injectNativeScanner();
            } else {
                clearCaptureTracking(false);
                if (pendingFileCallback != null) pendingFileCallback.onReceiveValue(null);
                pendingFileCallback = null;
            }
            return;
        }
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (pendingFileCallback == null) return;
            Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            pendingFileCallback.onReceiveValue(results);
            pendingFileCallback = null;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQUEST_WALKTHROUGH_CAMERA_PERMISSION) return;
        boolean granted = grantResults.length >= 2;
        for (int result : grantResults) granted = granted && result == PackageManager.PERMISSION_GRANTED;
        if (granted && pendingWalkthroughPermissionResume) {
            pendingWalkthroughPermissionResume = false;
            launchWalkthroughVideoCapture();
        } else {
            pendingWalkthroughPermissionResume = false;
            pendingFileCapture = false;
            if (pendingFileCallback != null) pendingFileCallback.onReceiveValue(null);
            pendingFileCallback = null;
            Toast.makeText(this, "Camera and microphone permission are required for the walkthrough.", Toast.LENGTH_LONG).show();
        }
    }

    private void handleWebPermissionRequest(PermissionRequest request) {
        List<String> granted = new ArrayList<>();
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource) || PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) granted.add(resource);
        }
        if (granted.isEmpty()) request.deny(); else request.grant(granted.toArray(new String[0]));
    }

    private void persistCaptureTracking(Uri uri, boolean ready) {
        SharedPreferences prefs = getSharedPreferences(CAPTURE_PREFS, Context.MODE_PRIVATE);
        prefs.edit().putString(CAPTURE_URI_KEY, uri == null ? "" : uri.toString()).putBoolean(CAPTURE_READY_KEY, ready).apply();
    }

    private void restoreCaptureTracking() {
        SharedPreferences prefs = getSharedPreferences(CAPTURE_PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(CAPTURE_URI_KEY, "");
        boolean ready = prefs.getBoolean(CAPTURE_READY_KEY, false);
        if (ready && raw != null && !raw.isEmpty()) {
            try { recoveredCaptureUri = Uri.parse(raw); } catch (Exception ignored) { recoveredCaptureUri = null; }
        }
    }

    private void clearCaptureTracking(boolean deleteFile) {
        Uri previous = recoveredCaptureUri;
        recoveredCaptureUri = null;
        getSharedPreferences(CAPTURE_PREFS, Context.MODE_PRIVATE).edit().remove(CAPTURE_URI_KEY).remove(CAPTURE_READY_KEY).apply();
        if (deleteFile && previous != null) {
            try {
                String path = previous.getPath();
                if (path != null) new File(path).delete();
            } catch (Exception ignored) {}
        }
    }

    private WebResourceResponse openRecoveredWalkthroughResponse() {
        Uri uri = recoveredCaptureUri;
        if (uri == null) return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", java.util.Collections.emptyMap(), InputStream.nullInputStream());
        try {
            InputStream stream = getContentResolver().openInputStream(uri);
            if (stream == null) throw new FileNotFoundException();
            return new WebResourceResponse("video/mp4", null, 200, "OK", java.util.Collections.singletonMap("Cache-Control", "no-store"), stream);
        } catch (Exception error) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", java.util.Collections.emptyMap(), InputStream.nullInputStream());
        }
    }

    void confirmRecoveredWalkthroughConsumed() {
        clearCaptureTracking(true);
        injectNativeScanner();
    }

    Uri getRecoveredCaptureUri() {
        return recoveredCaptureUri;
    }

    private void injectNativeScanner() {
        if (webView == null) return;
        webView.post(() -> {
            if (webView == null) return;
            webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('h38:native-scanner-ready'));", null);
        });
    }

    private View buildLaunchCover() {
        LinearLayout cover = new LinearLayout(this);
        cover.setOrientation(LinearLayout.VERTICAL);
        cover.setGravity(android.view.Gravity.CENTER);
        cover.setBackgroundColor(OFFICE_BACKGROUND);
        ProgressBar progress = new ProgressBar(this);
        TextView label = new TextView(this);
        label.setText("Opening Highway 38…");
        label.setTextColor(Color.rgb(11, 36, 56));
        label.setTextSize(16f);
        label.setPadding(0, 18, 0, 0);
        cover.addView(progress);
        cover.addView(label);
        cover.setLayoutParams(new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        return cover;
    }

    private void hideLaunchCover() {
        if (launchCover == null) return;
        launchCover.animate().alpha(0f).setDuration(140).withEndAction(() -> {
            if (launchCover != null) launchCover.setVisibility(View.GONE);
        }).start();
    }

    void requestWebAutofill() {
        if (webView == null) return;
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            AutofillManager autofill = getSystemService(AutofillManager.class);
            if (autofill != null) autofill.requestAutofill(webView);
        }
    }

    @Override
    protected void onDestroy() {
        if (pendingFileCallback != null) {
            pendingFileCallback.onReceiveValue(null);
            pendingFileCallback = null;
        }
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidH38Native");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
