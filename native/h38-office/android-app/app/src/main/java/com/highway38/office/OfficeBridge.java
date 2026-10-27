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

    /**
     * The native-held session pair, for web-side session re-unification
     * (1.0.4, web build 20261027-session-bridge-1). There is ONE Supabase
     * refresh-token chain with two holders: this store and the WebView's
     * localStorage. The SyncEngine refreshes hourly in the background and
     * rotates the chain; while the web layer is alive it re-pushes the
     * fresh pair back here (mileage.js, on TOKEN_REFRESHED/SIGNED_IN),
     * but after a web-dead gap the WebView can wake holding a stale copy
     * whose refresh attempt reads as token reuse and gets the whole
     * chain revoked — the owner is signed out through no action of his
     * own. On open, before its first refresh, the web layer asks here
     * and adopts this pair via setSession() when it is the fresher one,
     * so both holders resume from the same link of the chain. Returns
     * "{}" when no pair is stored.
     */
    @JavascriptInterface public String getSession() {
        PolicyStore.Session s = PolicyStore.loadSession(activity);
        JSONObject j = new JSONObject();
        try {
            if (!s.accessToken.isEmpty() && !s.refreshToken.isEmpty()) {
                j.put("accessToken", s.accessToken);
                j.put("refreshToken", s.refreshToken);
                j.put("expiresAtMs", s.expiresAtMs);
                j.put("authUserId", s.authUserId);
            }
        } catch (Exception ignored) {}
        return j.toString();
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
