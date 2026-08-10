package com.highway38.sitescanner;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.GetPasswordOption;
import androidx.credentials.PasswordCredential;
import androidx.credentials.exceptions.GetCredentialException;

import com.google.ar.core.ArCoreApk;
import com.google.ar.core.Config;
import com.google.ar.core.Session;

import org.json.JSONObject;

import java.util.Collections;

public final class NativeScannerBridge {
    private final MainActivity activity;
    private final WebView webView;
    private final SecureLoginStore secureLoginStore;
    private String pendingRequestId = "";
    private boolean credentialRequestBusy;

    NativeScannerBridge(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.secureLoginStore = new SecureLoginStore(activity);
    }

    @JavascriptInterface
    public String getCapabilities() {
        JSONObject result = new JSONObject();
        try {
            ArCoreApk.Availability availability = ArCoreApk.getInstance().checkAvailability(activity);
            boolean supported = availability.isSupported();
            boolean depth = false;
            if (supported) {
                Session session = null;
                try {
                    session = new Session(activity);
                    depth = session.isDepthModeSupported(Config.DepthMode.AUTOMATIC);
                } catch (Throwable ignored) {
                } finally {
                    if (session != null) session.close();
                }
            }
            result.put("platform", "android");
            result.put("arcore", supported);
            result.put("depth", depth);
            result.put("lidar", false);
            result.put("roomPlan", false);
            result.put("autofill", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O);
            result.put("localSavedLogin", secureLoginStore.load() != null);
            result.put("manufacturer", Build.MANUFACTURER);
            result.put("model", Build.MODEL);
            result.put("androidApi", Build.VERSION.SDK_INT);
        } catch (Throwable error) {
            try {
                result.put("platform", "android");
                result.put("arcore", false);
                result.put("depth", false);
                result.put("autofill", false);
                result.put("error", error.getMessage());
            } catch (Exception ignored) {
                return "{\"platform\":\"android\",\"arcore\":false,\"depth\":false,\"autofill\":false}";
            }
        }
        return result.toString();
    }

    @JavascriptInterface
    public void disableWebAutofill() {
        activity.runOnUiThread(this::disableWebAutofillNow);
    }

    private void disableWebAutofillNow() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                webView.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
            }
        } catch (Throwable ignored) {
        }
    }

    @JavascriptInterface
    public void rememberLogin(String username, String password) {
        activity.runOnUiThread(() -> {
            try {
                secureLoginStore.save(username, password);
            } catch (Throwable ignored) {
            }
        });
    }

    @JavascriptInterface
    public void requestAutofill() {
        activity.runOnUiThread(this::requestSavedPassword);
    }

    private void requestSavedPassword() {
        JSONObject local = secureLoginStore.load();
        if (local != null) {
            fillWebLogin(local.optString("username"), local.optString("password"));
            return;
        }
        if (credentialRequestBusy) return;
        credentialRequestBusy = true;
        try {
            CredentialManager manager = CredentialManager.create(activity);
            GetPasswordOption passwordOption = new GetPasswordOption(Collections.emptySet(), false, Collections.emptySet());
            GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(passwordOption).build();
            manager.getCredentialAsync(activity, request, null, activity.getMainExecutor(),
                    new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                        @Override
                        public void onResult(GetCredentialResponse result) {
                            credentialRequestBusy = false;
                            Credential credential = result.getCredential();
                            if (credential instanceof PasswordCredential) {
                                PasswordCredential saved = (PasswordCredential) credential;
                                try { secureLoginStore.save(saved.getId(), saved.getPassword()); } catch (Throwable ignored) {}
                                fillWebLogin(saved.getId(), saved.getPassword());
                                return;
                            }
                            requestWebPasswordManagerFallback();
                        }
                        @Override
                        public void onError(GetCredentialException error) {
                            credentialRequestBusy = false;
                            requestWebPasswordManagerFallback();
                        }
                    });
        } catch (Throwable error) {
            credentialRequestBusy = false;
            requestWebPasswordManagerFallback();
        }
    }

    private void requestWebPasswordManagerFallback() {
        activity.runOnUiThread(() -> {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    webView.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_YES);
                    String focusScript = "(function(){var e=document.getElementById('h38AuthEmail');if(e){e.focus({preventScroll:true});return true;}return false;})();";
                    webView.evaluateJavascript(focusScript, value -> webView.postDelayed(() -> {
                        activity.requestWebAutofill();
                        webView.postDelayed(this::disableWebAutofillNow, 12000L);
                    }, 180L));
                    String script = "window.dispatchEvent(new CustomEvent('h38:saved-login-web-autofill-requested'));";
                    webView.evaluateJavascript(script, null);
                    return;
                }
            } catch (Throwable ignored) {
            }
            notifySavedLoginUnavailable();
        });
    }

    private void notifySavedLoginUnavailable() {
        String script = "window.dispatchEvent(new CustomEvent('h38:saved-login-unavailable'));";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private void fillWebLogin(String username, String password) {
        String script = "(function(){"
                + "var email=document.getElementById('h38AuthEmail');"
                + "var pass=document.getElementById('h38AuthPassword');"
                + "if(!email||!pass)return false;"
                + "email.value=" + JSONObject.quote(username == null ? "" : username) + ";"
                + "pass.value=" + JSONObject.quote(password == null ? "" : password) + ";"
                + "['input','change'].forEach(function(type){email.dispatchEvent(new Event(type,{bubbles:true}));pass.dispatchEvent(new Event(type,{bubbles:true}));});"
                + "pass.focus();window.dispatchEvent(new CustomEvent('h38:saved-login-filled'));return true;})();";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    @JavascriptInterface
    public String getRecoveredWalkthroughUrl() { return activity.getRecoveredWalkthroughUrl(); }

    @JavascriptInterface
    public void confirmRecoveredWalkthroughConsumed() { activity.runOnUiThread(activity::confirmRecoveredWalkthroughConsumed); }

    @JavascriptInterface
    public void start(String optionsJson, String requestId) {
        activity.runOnUiThread(() -> {
            try {
                JSONObject options = new JSONObject(optionsJson);
                requireValue(options, "businessId");
                requireValue(options, "quoteId");
                requireValue(options, "captureSessionId");
                pendingRequestId = requestId;
                Intent intent = new Intent(activity, ArMeasureActivity.class);
                intent.putExtra("options", options.toString());
                activity.startActivityForResult(intent, MainActivity.REQUEST_NATIVE_SCAN);
            } catch (Throwable error) {
                finishRequest(false, error.getMessage());
            }
        });
    }

    void completeFromActivity(int resultCode, Intent data) {
        if (pendingRequestId.isEmpty()) return;
        if (resultCode == Activity.RESULT_OK && data != null) finishRequest(true, data.getStringExtra("result"));
        else {
            String message = data == null ? "Native capture was cancelled." : data.getStringExtra("error");
            finishRequest(false, message == null ? "Native capture was cancelled." : message);
        }
    }

    private void finishRequest(boolean ok, String payload) {
        String requestId = pendingRequestId;
        pendingRequestId = "";
        if (requestId == null || requestId.isEmpty()) return;
        String script = "window.__h38NativeComplete(" + JSONObject.quote(requestId) + "," + (ok ? "true" : "false") + "," + JSONObject.quote(payload == null ? "" : payload) + ");";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private static void requireValue(JSONObject options, String key) {
        if (options.optString(key).trim().isEmpty()) throw new IllegalArgumentException("Native scan is missing " + key + ".");
    }
}
