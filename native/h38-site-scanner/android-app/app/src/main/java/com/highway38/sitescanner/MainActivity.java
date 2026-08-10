package com.highway38.sitescanner;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.autofill.AutofillManager;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

import java.util.ArrayList;
import java.util.List;

public final class MainActivity extends Activity {
    static final String BUSINESS_OFFICE_URL =
            "https://highway38solutions.com/commercial-app/";
    static final int REQUEST_NATIVE_SCAN = 3801;
    private static final int REQUEST_WEB_PERMISSIONS = 3802;
    private static final int REQUEST_FILE_CHOOSER = 3803;
    private static final int REQUEST_WALKTHROUGH_CAMERA_PERMISSION = 3804;
    private static final int OFFICE_BACKGROUND = Color.rgb(238, 243, 247);

    private WebView webView;
    private NativeScannerBridge nativeScannerBridge;
    private PermissionRequest pendingWebPermissionRequest;
    private ValueCallback<Uri[]> pendingFileCallback;
    private boolean pendingFileCapture;
    private boolean pendingWalkthroughPermissionResume;
    private View launchCover;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureSystemBars();

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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
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
                settings.getUserAgentString() + " H38SiteScannerAndroid/0.5.14"
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

        nativeScannerBridge = new NativeScannerBridge(this, webView);
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
                    Toast.makeText(
                            MainActivity.this,
                            "Cannot open this link.",
                            Toast.LENGTH_LONG
                    ).show();
                }
                return true;
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
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (pendingFileCallback != null) {
                    pendingFileCallback.onReceiveValue(null);
                }
                pendingFileCallback = filePathCallback;
                pendingFileCapture = false;
                pendingWalkthroughPermissionResume = false;

                try {
                    if (fileChooserParams.isCaptureEnabled()
                            && acceptsVideo(fileChooserParams.getAcceptTypes())) {
                        pendingFileCapture = true;
                        if (checkSelfPermission(Manifest.permission.CAMERA)
                                != PackageManager.PERMISSION_GRANTED) {
                            pendingWalkthroughPermissionResume = true;
                            requestPermissions(
                                    new String[]{Manifest.permission.CAMERA},
                                    REQUEST_WALKTHROUGH_CAMERA_PERMISSION
                            );
                            return true;
                        }
                        return launchSystemVideoCapture();
                    }

                    startActivityForResult(
                            fileChooserParams.createIntent(),
                            REQUEST_FILE_CHOOSER
                    );
                    return true;
                } catch (Exception error) {
                    failPendingFileCapture("Video capture is unavailable.");
                    return false;
                }
            }
        });

        boolean restored = false;
        if (savedInstanceState != null) {
            try {
                restored = webView.restoreState(savedInstanceState) != null;
            } catch (Exception ignored) {
                restored = false;
            }
        }
        String restoredUrl = webView.getUrl();
        if (!restored || restoredUrl == null || shouldResetRestoredUrl(restoredUrl)) {
            webView.loadUrl(BUSINESS_OFFICE_URL);
        } else if (webView.getProgress() >= 100) {
            webView.postDelayed(this::hideLaunchCover, 180);
        }
    }

    private boolean launchSystemVideoCapture() {
        try {
            Intent captureIntent = new Intent(MediaStore.ACTION_VIDEO_CAPTURE);
            captureIntent.putExtra(MediaStore.EXTRA_DURATION_LIMIT, 90);
            captureIntent.putExtra(MediaStore.EXTRA_VIDEO_QUALITY, 1);
            pendingFileCapture = true;
            pendingWalkthroughPermissionResume = false;
            startActivityForResult(captureIntent, REQUEST_FILE_CHOOSER);
            return true;
        } catch (Exception error) {
            failPendingFileCapture("Video capture is unavailable.");
            return false;
        }
    }

    private void failPendingFileCapture(String message) {
        if (pendingFileCallback != null) {
            pendingFileCallback.onReceiveValue(null);
            pendingFileCallback = null;
        }
        pendingFileCapture = false;
        pendingWalkthroughPermissionResume = false;
        Toast.makeText(MainActivity.this, message, Toast.LENGTH_LONG).show();
    }

    String getRecoveredWalkthroughUrl() {
        return "";
    }

    void confirmRecoveredWalkthroughConsumed() {
    }

    private boolean acceptsVideo(String[] acceptTypes) {
        if (acceptTypes == null) return false;
        for (String type : acceptTypes) {
            String value = type == null ? "" : type.trim().toLowerCase();
            if (value.equals("video/*") || value.startsWith("video/")) return true;
        }
        return false;
    }

    private View buildLaunchCover() {
        FrameLayout cover = new FrameLayout(this);
        cover.setBackgroundColor(OFFICE_BACKGROUND);
        cover.setClickable(true);
        cover.setFocusable(true);
        cover.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER);
        content.setPadding(dp(28), dp(28), dp(28), dp(28));
        FrameLayout.LayoutParams contentParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER
        );

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.highway38_logo);
        logo.setContentDescription("Highway 38 Solutions");
        LinearLayout.LayoutParams logoParams = new LinearLayout.LayoutParams(dp(92), dp(92));
        logoParams.bottomMargin = dp(18);
        content.addView(logo, logoParams);

        TextView title = new TextView(this);
        title.setText("Highway 38 Solutions");
        title.setTextColor(Color.rgb(11, 36, 56));
        title.setTextSize(20);
        title.setGravity(Gravity.CENTER);
        content.addView(title);

        TextView status = new TextView(this);
        status.setText("Opening Business Office…");
        status.setTextColor(Color.rgb(82, 97, 109));
        status.setTextSize(14);
        status.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        statusParams.topMargin = dp(8);
        content.addView(status, statusParams);

        cover.addView(content, contentParams);
        return cover;
    }

    private void hideLaunchCover() {
        View cover = launchCover;
        if (cover == null || cover.getParent() == null) return;
        launchCover = null;
        cover.animate().alpha(0f).setDuration(140).withEndAction(() -> {
            ViewGroup parent = (ViewGroup) cover.getParent();
            if (parent != null) parent.removeView(cover);
        }).start();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private boolean shouldResetRestoredUrl(String url) {
        String value = url == null ? "" : url.toLowerCase();
        return value.contains("fieldmode=1")
                || value.contains("/site-visit")
                || value.contains("sitevisit=1");
    }

    void requestWebAutofill() {
        runOnUiThread(() -> {
            if (webView == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                AutofillManager manager = getSystemService(AutofillManager.class);
                if (manager != null && manager.isEnabled()) {
                    manager.requestAutofill(webView);
                }
            }
        });
    }

    private void configureSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        getWindow().setStatusBarColor(Color.rgb(11, 36, 56));
        getWindow().setNavigationBarColor(Color.rgb(11, 36, 56));
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
                getWindow(),
                getWindow().getDecorView()
        );
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);
    }

    private void injectNativeScanner() {
        String script = "(function(){"
                + "window.__h38NativePending=window.__h38NativePending||{};"
                + "window.__h38NativeComplete=function(requestId,ok,payload){"
                + "var pending=window.__h38NativePending[requestId];"
                + "if(!pending)return;"
                + "delete window.__h38NativePending[requestId];"
                + "if(ok){try{pending.resolve(typeof payload==='string'?JSON.parse(payload):payload);}catch(e){pending.reject(e);}}"
                + "else{pending.reject(new Error(payload||'Native scan failed.'));}"
                + "};"
                + "window.H38NativeScanner={"
                + "getCapabilities:function(){try{return JSON.parse(AndroidH38Native.getCapabilities());}catch(e){return {platform:'android',arcore:false,depth:false,autofill:false};}},"
                + "getRecoveredWalkthroughUrl:function(){return '';},"
                + "confirmRecoveredWalkthroughConsumed:function(){},"
                + "start:function(options){return new Promise(function(resolve,reject){"
                + "var requestId='NATIVE-'+Date.now()+'-'+Math.random().toString(16).slice(2);"
                + "window.__h38NativePending[requestId]={resolve:resolve,reject:reject};"
                + "try{AndroidH38Native.start(JSON.stringify(options||{}),requestId);}catch(e){delete window.__h38NativePending[requestId];reject(e);}"
                + "});}"
                + "};"
                + "window.dispatchEvent(new CustomEvent('h38:native-scanner-ready'));"
                + "})();";
        webView.evaluateJavascript(script, null);
    }

    private void handleWebPermissionRequest(PermissionRequest request) {
        List<String> needed = new ArrayList<>();
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)
                    && checkSelfPermission(Manifest.permission.CAMERA)
                    != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.CAMERA);
            }
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)
                    && checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                    != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.RECORD_AUDIO);
            }
        }

        if (needed.isEmpty()) {
            request.grant(request.getResources());
            return;
        }

        pendingWebPermissionRequest = request;
        requestPermissions(
                needed.toArray(new String[0]),
                REQUEST_WEB_PERMISSIONS
        );
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            String[] permissions,
            int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == REQUEST_WALKTHROUGH_CAMERA_PERMISSION) {
            boolean granted = grantResults.length > 0;
            for (int result : grantResults) {
                granted &= result == PackageManager.PERMISSION_GRANTED;
            }
            if (granted && pendingWalkthroughPermissionResume && pendingFileCallback != null) {
                launchSystemVideoCapture();
            } else {
                failPendingFileCapture("Camera permission is required to record the walkthrough.");
            }
            return;
        }

        if (requestCode == REQUEST_WEB_PERMISSIONS
                && pendingWebPermissionRequest != null) {
            boolean granted = true;
            for (int result : grantResults) {
                granted &= result == PackageManager.PERMISSION_GRANTED;
            }
            if (granted) {
                pendingWebPermissionRequest.grant(
                        pendingWebPermissionRequest.getResources()
                );
            } else {
                pendingWebPermissionRequest.deny();
            }
            pendingWebPermissionRequest = null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == REQUEST_NATIVE_SCAN) {
            nativeScannerBridge.completeFromActivity(resultCode, data);
            return;
        }

        if (requestCode == REQUEST_FILE_CHOOSER
                && pendingFileCallback != null) {
            Uri[] results = null;
            if (resultCode == RESULT_OK) {
                if (pendingFileCapture) {
                    Uri captured = data == null ? null : data.getData();
                    if (captured != null) {
                        results = new Uri[]{captured};
                    }
                } else {
                    results = WebChromeClient.FileChooserParams.parseResult(
                            resultCode,
                            data
                    );
                }
            }

            ValueCallback<Uri[]> callback = pendingFileCallback;
            pendingFileCallback = null;
            pendingFileCapture = false;
            pendingWalkthroughPermissionResume = false;
            callback.onReceiveValue(results);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        webView.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        injectNativeScanner();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onDestroy() {
        if (pendingFileCallback != null) {
            pendingFileCallback.onReceiveValue(null);
            pendingFileCallback = null;
        }
        pendingFileCapture = false;
        pendingWalkthroughPermissionResume = false;
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidH38Native");
            webView.destroy();
        }
        super.onDestroy();
    }
}
