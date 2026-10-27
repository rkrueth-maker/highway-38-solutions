package com.highway38.office;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

import org.json.JSONObject;

/**
 * The web/native bridge, exposed to the Office web app as
 * window.AndroidH38Office. Follows the Deals wrapper's bridge pattern
 * (@JavascriptInterface methods; UI work bounced to the UI thread).
 *
 * The web app (commercial-app/mileage.js) uses it to:
 *   - push the session + recording policy (it is the policy source of truth);
 *   - read detection status for the Mileage screen / Today card;
 *   - deep-link the person to the right Android settings screens.
 */
public final class OfficeBridge {

    private final MainActivity activity;

    public OfficeBridge(MainActivity activity) {
        this.activity = activity;
    }

    /** Live tracking status as a JSON string (see StatusReporter). */
    @JavascriptInterface public String getStatus() {
        return StatusReporter.statusJson(activity).toString();
    }

    /**
     * Capability flag for the web sign-in page (1.0.4): this build can run
     * Google sign-in to completion in-app — the OAuth round-trip opens in
     * a Chrome Custom Tab and returns through the h38office:// deep link
     * into this WebView. The web layer asks before starting OAuth because
     * older builds have no return path and must keep the plain notice.
     */
    @JavascriptInterface public boolean supportsGoogleSignIn() {
        return true;
    }

    /** App identity, Deals build() parity. */
    @JavascriptInterface public String appInfo() {
        JSONObject j = new JSONObject();
        try {
            j.put("app", "H38 Office");
            j.put("version", BuildConfig.VERSION_NAME);
            j.put("build", "H38_OFFICE_ANDROID_V100:native-mileage-tracking+webview-bridge");
        } catch (Exception ignored) {}
        return j.toString();
    }

    /**
     * The web app pushes its session + the recording policy here whenever it
     * runs (sign-in, clock in/out, switch flips). Native persists both and
     * re-evaluates the tracking gate immediately.
     */
    @JavascriptInterface public void setSessionAndPolicy(String json) {
        try {
            JSONObject j = new JSONObject(json == null ? "{}" : json);
            PolicyStore.applyBridgePush(activity, j);
        } catch (Exception ignored) {}
        activity.runOnUiThread(() -> {
            TrackingController.reevaluate(activity);
            activity.refreshWizardIfVisible();
        });
        new Thread(() -> SyncEngine.syncPendingTrips(activity)).start();
    }

    /** Web sign-out: forget the session and the policy; tracking stops. */
    @JavascriptInterface public void clearSession() {
        PolicyStore.clearSession(activity);
        activity.runOnUiThread(() -> TrackingController.reevaluate(activity));
    }

    /** Re-open the first-run setup wizard. */
    @JavascriptInterface public void openSetup() {
        activity.runOnUiThread(() -> activity.showWizard(0));
    }

    /** This app's system settings page (permissions live there). */
    @JavascriptInterface public void openAppSettings() {
        open(Uri.parse("package:" + activity.getPackageName()),
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
    }

    /** Location permission fix-up lands on the same app settings page. */
    @JavascriptInterface public void openLocationSettings() {
        openAppSettings();
    }

    /** Battery-optimization list, where the exemption can be toggled. */
    @JavascriptInterface public void openBatterySettings() {
        open(null, Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
    }

    @JavascriptInterface public void reload() {
        activity.runOnUiThread(activity::reloadWebView);
    }

    private void open(Uri data, String action) {
        activity.runOnUiThread(() -> {
            try {
                Intent i = new Intent(action);
                if (data != null) i.setData(data);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(i);
            } catch (Exception ignored) {}
        });
    }
}
