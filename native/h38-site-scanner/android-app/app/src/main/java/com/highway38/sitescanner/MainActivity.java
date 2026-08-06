package com.highway38.sitescanner;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

public final class MainActivity extends Activity {
    static final String BUSINESS_OFFICE_URL = "https://highway38solutions.com/commercial-app/";
    static final int REQUEST_NATIVE_SCAN = 3801;
    private static final int REQUEST_WEB_PERMISSIONS = 3802;
    private static final int REQUEST_FILE_CHOOSER = 3803;

    private WebView webView;
    private NativeScannerBridge nativeScannerBridge;
    private PermissionRequest pendingWebPermissionRequest;
    private ValueCallback<Uri[]> pendingFileCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setUserAgentString(
                settings.getUserAgentString() + " H38SiteScannerAndroid/0.1.0"
        );

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
            public void onPageFinished(WebView view, String url) {
                injectNativeScanner();
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
                try {
                    startActivityForResult(
                            fileChooserParams.createIntent(),
                            REQUEST_FILE_CHOOSER
                    );
                    return true;
                } catch (Exception error) {
                    pendingFileCallback = null;
                    Toast.makeText(
                            MainActivity.this,
                            "File picker is unavailable.",
                            Toast.LENGTH_LONG
                    ).show();
                    return false;
                }
            }
        });

        if (savedInstanceState == null) {
            webView.loadUrl(BUSINESS_OFFICE_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
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
                + "getCapabilities:function(){try{return JSON.parse(AndroidH38Native.getCapabilities());}catch(e){return {platform:'android',arcore:false,depth:false};}},"
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
            Uri[] results = WebChromeClient.FileChooserParams.parseResult(
                    resultCode,
                    data
            );
            pendingFileCallback.onReceiveValue(results);
            pendingFileCallback = null;
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
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidH38Native");
            webView.destroy();
        }
        super.onDestroy();
    }
}
