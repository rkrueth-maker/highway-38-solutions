package com.highway38.sitescanner;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.AssetFileDescriptor;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;
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

import java.io.InputStream;
import java.lang.reflect.Method;
import java.util.Collections;

public final class NativeScannerBridge {
    private static final String CAPTURE_PREFS = "h38-walkthrough-capture";
    private static final String CAPTURE_URI_KEY = "pending_uri";
    private static final String CAPTURE_READY_KEY = "ready";
    private static final int MAX_WALKTHROUGH_CHUNK_BYTES = 256 * 1024;

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
            result.put("nativePrint", Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP);
            result.put("walkthroughPhotos", true);
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
                result.put("nativePrint", false);
                result.put("walkthroughPhotos", true);
                result.put("error", error.getMessage());
            } catch (Exception ignored) {
                return "{\"platform\":\"android\",\"arcore\":false,\"depth\":false,\"autofill\":false,\"nativePrint\":false,\"walkthroughPhotos\":true}";
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
    public void printCurrentPage() {
        activity.runOnUiThread(() -> {
            try {
                android.print.PrintManager manager = (android.print.PrintManager) activity.getSystemService(android.content.Context.PRINT_SERVICE);
                if (manager == null) throw new IllegalStateException("Android print service is unavailable.");
                String jobName = "Highway 38 Quote";
                android.print.PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(jobName);
                manager.print(jobName, adapter, new android.print.PrintAttributes.Builder().build());
                webView.post(() -> webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('h38:native-print-launched'));", null));
            } catch (Throwable error) {
                String message = error.getMessage();
                final String safe = message == null || message.trim().isEmpty() ? "Android print could not open." : message;
                android.widget.Toast.makeText(activity, safe, android.widget.Toast.LENGTH_LONG).show();
                webView.post(() -> webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('h38:native-print-failed',{detail:" + JSONObject.quote(safe) + "}));", null));
            }
        });
    }

    @JavascriptInterface
    public void launchWalkthroughCapture() {
        activity.runOnUiThread(() -> {
            try {
                int waitingPhotos = WalkthroughPhotoStore.count(activity);
                if (waitingPhotos > 0) {
                    throw new IllegalStateException(waitingPhotos + " walkthrough photo" + (waitingPhotos == 1 ? " is" : "s are") + " still being saved to the Site Visit. Keep H38 open for a moment before recording another walkthrough.");
                }
                Method method = MainActivity.class.getDeclaredMethod("launchWalkthroughVideoCapture");
                method.setAccessible(true);
                Object result = method.invoke(activity);
                if (result instanceof Boolean && !((Boolean) result)) {
                    throw new IllegalStateException("Walkthrough camera did not launch.");
                }
            } catch (Throwable error) {
                String message = error.getCause() != null ? error.getCause().getMessage() : error.getMessage();
                final String safe = message == null || message.trim().isEmpty() ? "Walkthrough camera could not open." : message;
                webView.post(() -> webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('h38:native-walkthrough-launch-failed',{detail:" + JSONObject.quote(safe) + "}));", null));
            }
        });
    }

    @JavascriptInterface
    public String getRecoveredWalkthroughUrl() { return activity.getRecoveredWalkthroughUrl(); }

    @JavascriptInterface
    public String getRecoveredWalkthroughInfo() {
        JSONObject result = new JSONObject();
        try {
            SharedPreferences prefs = activity.getSharedPreferences(CAPTURE_PREFS, Activity.MODE_PRIVATE);
            boolean ready = prefs.getBoolean(CAPTURE_READY_KEY, false);
            String value = prefs.getString(CAPTURE_URI_KEY, "");
            if (!ready || value == null || value.trim().isEmpty()) {
                result.put("ready", false);
                result.put("photoCount", WalkthroughPhotoStore.count(activity));
                return result.toString();
            }
            Uri uri = Uri.parse(value);
            long size = -1L;
            try (AssetFileDescriptor descriptor = activity.getContentResolver().openAssetFileDescriptor(uri, "r")) {
                if (descriptor != null) size = descriptor.getLength();
            }
            if (size < 0L) {
                try (InputStream stream = activity.getContentResolver().openInputStream(uri)) {
                    if (stream != null) {
                        long counted = 0L;
                        byte[] buffer = new byte[64 * 1024];
                        int read;
                        while ((read = stream.read(buffer)) > 0) counted += read;
                        size = counted;
                    }
                }
            }
            String mime = activity.getContentResolver().getType(uri);
            if (mime == null || mime.trim().isEmpty()) mime = "video/mp4";
            result.put("ready", size > 0L);
            result.put("size", Math.max(0L, size));
            result.put("mime", mime);
            result.put("photoCount", WalkthroughPhotoStore.count(activity));
            return result.toString();
        } catch (Throwable error) {
            try {
                result.put("ready", false);
                result.put("photoCount", WalkthroughPhotoStore.count(activity));
                result.put("error", error.getMessage());
            } catch (Throwable ignored) {
            }
            return result.toString();
        }
    }

    @JavascriptInterface
    public String readRecoveredWalkthroughChunk(long offset, int requestedBytes) {
        if (offset < 0L) return "";
        int wanted = Math.max(1, Math.min(requestedBytes, MAX_WALKTHROUGH_CHUNK_BYTES));
        try {
            SharedPreferences prefs = activity.getSharedPreferences(CAPTURE_PREFS, Activity.MODE_PRIVATE);
            if (!prefs.getBoolean(CAPTURE_READY_KEY, false)) return "";
            String value = prefs.getString(CAPTURE_URI_KEY, "");
            if (value == null || value.trim().isEmpty()) return "";
            Uri uri = Uri.parse(value);
            try (InputStream stream = activity.getContentResolver().openInputStream(uri)) {
                if (stream == null) return "";
                long remainingSkip = offset;
                while (remainingSkip > 0L) {
                    long skipped = stream.skip(remainingSkip);
                    if (skipped > 0L) {
                        remainingSkip -= skipped;
                        continue;
                    }
                    if (stream.read() < 0) return "";
                    remainingSkip--;
                }
                byte[] buffer = new byte[wanted];
                int total = 0;
                while (total < wanted) {
                    int read = stream.read(buffer, total, wanted - total);
                    if (read < 0) break;
                    total += read;
                }
                if (total < 1) return "";
                return Base64.encodeToString(buffer, 0, total, Base64.NO_WRAP);
            }
        } catch (Throwable ignored) {
            return "";
        }
    }

    @JavascriptInterface
    public String getRecoveredWalkthroughPhotosInfo() {
        return WalkthroughPhotoStore.info(activity);
    }

    @JavascriptInterface
    public String readRecoveredWalkthroughPhotoChunk(int index, long offset, int requestedBytes) {
        return WalkthroughPhotoStore.readChunk(activity, index, offset, requestedBytes);
    }

    @JavascriptInterface
    public void confirmRecoveredWalkthroughPhotosConsumed() {
        activity.runOnUiThread(() -> WalkthroughPhotoStore.clear(activity, true));
    }

    @JavascriptInterface
    public String getRecoveredWalkthroughAudioInfo() {
        return WalkthroughAudioExtractor.info(activity);
    }

    @JavascriptInterface
    public String readRecoveredWalkthroughAudioChunk(long offset, int requestedBytes) {
        return WalkthroughAudioExtractor.readChunk(activity, offset, requestedBytes);
    }

    @JavascriptInterface
    public void confirmRecoveredWalkthroughAudioConsumed() {
        activity.runOnUiThread(() -> WalkthroughAudioExtractor.clear(activity, true));
    }

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
