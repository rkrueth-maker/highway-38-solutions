package com.highway38.sitescanner;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.google.ar.core.ArCoreApk;
import com.google.ar.core.Config;
import com.google.ar.core.Session;

import org.json.JSONObject;

public final class NativeScannerBridge {
    private final MainActivity activity;
    private final WebView webView;
    private String pendingRequestId = "";

    NativeScannerBridge(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    @JavascriptInterface
    public String getCapabilities() {
        JSONObject result = new JSONObject();
        try {
            ArCoreApk.Availability availability =
                    ArCoreApk.getInstance().checkAvailability(activity);
            boolean supported = availability.isSupported();
            boolean depth = false;

            if (supported) {
                Session session = null;
                try {
                    session = new Session(activity);
                    depth = session.isDepthModeSupported(
                            Config.DepthMode.AUTOMATIC
                    );
                } catch (Throwable ignored) {
                    // Capture start completes runtime installation/profile checks.
                } finally {
                    if (session != null) session.close();
                }
            }

            result.put("platform", "android");
            result.put("arcore", supported);
            result.put("depth", depth);
            result.put("lidar", false);
            result.put("roomPlan", false);
            result.put("manufacturer", Build.MANUFACTURER);
            result.put("model", Build.MODEL);
            result.put("androidApi", Build.VERSION.SDK_INT);
        } catch (Throwable error) {
            try {
                result.put("platform", "android");
                result.put("arcore", false);
                result.put("depth", false);
                result.put("error", error.getMessage());
            } catch (Exception ignored) {
                return "{\"platform\":\"android\",\"arcore\":false,\"depth\":false}";
            }
        }
        return result.toString();
    }

    @JavascriptInterface
    public void start(String optionsJson, String requestId) {
        activity.runOnUiThread(() -> {
            try {
                JSONObject options = new JSONObject(optionsJson);
                requireValue(options, "businessId");
                requireValue(options, "quoteId");
                requireValue(options, "captureSessionId");

                pendingRequestId = requestId;
                Intent intent = new Intent(
                        activity,
                        ArMeasureActivity.class
                );
                intent.putExtra("options", options.toString());
                activity.startActivityForResult(
                        intent,
                        MainActivity.REQUEST_NATIVE_SCAN
                );
            } catch (Throwable error) {
                finishRequest(false, error.getMessage());
            }
        });
    }

    void completeFromActivity(int resultCode, Intent data) {
        if (pendingRequestId.isEmpty()) return;
        if (resultCode == Activity.RESULT_OK && data != null) {
            finishRequest(true, data.getStringExtra("result"));
        } else {
            String message = data == null
                    ? "Native capture was cancelled."
                    : data.getStringExtra("error");
            finishRequest(
                    false,
                    message == null
                            ? "Native capture was cancelled."
                            : message
            );
        }
    }

    private void finishRequest(boolean ok, String payload) {
        String requestId = pendingRequestId;
        pendingRequestId = "";
        if (requestId == null || requestId.isEmpty()) return;

        String script = "window.__h38NativeComplete("
                + JSONObject.quote(requestId) + ","
                + (ok ? "true" : "false") + ","
                + JSONObject.quote(payload == null ? "" : payload)
                + ");";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private static void requireValue(JSONObject options, String key) {
        if (options.optString(key).trim().isEmpty()) {
            throw new IllegalArgumentException(
                    "Native scan is missing " + key + "."
            );
        }
    }
}
