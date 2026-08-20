package com.highway38.resellerscout;

import android.app.Activity;
import android.app.Application;
import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public final class ResellerScoutPatchProvider extends ContentProvider implements Application.ActivityLifecycleCallbacks {
    public static final String ENGINE_MARKER = "H38_RESALE_OPPORTUNITY_ENGINE_V2";
    public static final String FACEBOOK_MARKER = "H38_FACEBOOK_AUTHENTICATED_BROWSER_V1";
    public static final String DEVICE_STOCK_MARKER = "H38_DEVICE_RETAILER_STOCK_V1";
    public static final String LOCATION_MARKER = "H38_PHONE_OR_ZIP_LOCATION_V3";
    public static final String SAAS_MARKER = "H38_RESELLER_SAAS_WORKSPACE_V1";
    public static final String CONTRACT_TEXT = "Search Facebook in Scout | Only verified, profit-supported resale opportunities | Set / verify | Search ZIP | Use phone location | Ad / flyer source | Store Scan | Local auctions | Item Tracker | Stores / Clearance | Diagnostics";
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile String patchJs;

    private static final class Bridge {
        private final Activity activity;
        private final WebView scout;
        Bridge(Activity activity, WebView scout) { this.activity = activity; this.scout = scout; }

        @JavascriptInterface public void reloadScout() { activity.runOnUiThread(activity::recreate); }

        @JavascriptInterface public boolean notificationAccessEnabled() {
            try {
                String enabled = Settings.Secure.getString(activity.getContentResolver(), "enabled_notification_listeners");
                return enabled != null && enabled.contains(activity.getPackageName());
            } catch (Exception ignored) { return false; }
        }

        @JavascriptInterface public void openNotificationAccessSettings() {
            activity.runOnUiThread(() -> {
                try { activity.startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)); }
                catch (Exception ignored) {}
            });
        }

        @JavascriptInterface public String facebookNotificationCandidates() { return FacebookMarketplaceNotificationListener.rowsJson(activity); }
        @JavascriptInterface public String facebookBrowserCandidates() { return FacebookMarketplaceActivity.rowsJson(activity); }

        @JavascriptInterface public void openFacebookMarketplace(String termsJson, double lat, double lon, int radius, String postal, String url) {
            activity.runOnUiThread(() -> {
                Intent i = new Intent(activity, FacebookMarketplaceActivity.class);
                i.putExtra(FacebookMarketplaceActivity.EXTRA_TERMS, termsJson == null ? "[]" : termsJson);
                if (Double.isFinite(lat) && Double.isFinite(lon) && !(lat == 0d && lon == 0d)) {
                    i.putExtra(FacebookMarketplaceActivity.EXTRA_LAT, lat);
                    i.putExtra(FacebookMarketplaceActivity.EXTRA_LON, lon);
                }
                i.putExtra(FacebookMarketplaceActivity.EXTRA_RADIUS, radius);
                i.putExtra(FacebookMarketplaceActivity.EXTRA_POSTAL, postal == null ? "" : postal);
                if (url != null && url.startsWith("https://www.facebook.com/marketplace/")) i.putExtra(FacebookMarketplaceActivity.EXTRA_URL, url);
                activity.startActivity(i);
            });
        }

        @JavascriptInterface public void startDeviceStockCheck(String requestId, String bodyJson) {
            RetailerDeviceCheckManager.check(activity, scout, requestId, bodyJson);
        }

        @JavascriptInterface public void openRetailerSession(String bodyJson) {
            activity.runOnUiThread(() -> {
                try {
                    JSONObject b = new JSONObject(bodyJson == null ? "{}" : bodyJson);
                    String retailer = b.optString("retailer", "");
                    String query = first(b.optString("upc", ""), b.optString("sku", ""), b.optString("title", ""), "tools");
                    Intent i = new Intent(activity, RetailerVerificationActivity.class);
                    i.putExtra(RetailerVerificationActivity.EXTRA_RETAILER, retailer);
                    i.putExtra(RetailerVerificationActivity.EXTRA_QUERY, query);
                    i.putExtra(RetailerVerificationActivity.EXTRA_SOURCE_URL, b.optString("source_url", ""));
                    i.putExtra(RetailerVerificationActivity.EXTRA_STORE, b.optString("store_address", b.optString("store_name", "")));
                    activity.startActivity(i);
                } catch (Exception ignored) {}
            });
        }

        private static String first(String... values) {
            for (String value : values) if (value != null && !value.trim().isEmpty()) return value.trim();
            return "";
        }
    }

    @Override public boolean onCreate() {
        Application app = (Application) getContext().getApplicationContext();
        app.registerActivityLifecycleCallbacks(this);
        return true;
    }

    private String readAsset(String name) throws Exception {
        try (InputStream in = getContext().getAssets().open(name); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192]; int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private String patch() {
        String cached = patchJs;
        if (cached != null) return cached;
        try {
            patchJs = readAsset("reseller/v027-patch.js") + "\n" + readAsset("reseller/v028-saas.js");
        } catch (Exception e) {
            patchJs = "console.error('H38 Scout runtime patch asset unavailable: " + JSONObject.quote(String.valueOf(e.getMessage())) + "');";
        }
        return patchJs;
    }

    private static WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                WebView found = findWebView(group.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }

    private static String sharedText(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return null;
        String type = intent.getType();
        if (type != null && !type.startsWith("text/")) return null;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.trim().isEmpty()) text = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        return text == null || text.trim().isEmpty() ? null : text.trim();
    }

    private void inject(Activity activity) {
        if (!(activity instanceof MainActivity)) return;
        WebView webView = findWebView(activity.getWindow().getDecorView());
        if (webView == null) return;
        webView.addJavascriptInterface(new Bridge(activity, webView), "AndroidH38Scout");
        String shared = sharedText(activity.getIntent());
        String js = patch() + (shared == null ? "" : "\nwindow.H38SharedOpportunity&&window.H38SharedOpportunity(" + JSONObject.quote(shared) + ");");
        webView.evaluateJavascript(js, null);
        if (shared != null) activity.getIntent().setAction(null);
    }

    @Override public void onActivityResumed(Activity activity) {
        inject(activity);
        main.postDelayed(() -> inject(activity), 450);
        main.postDelayed(() -> inject(activity), 1400);
        main.postDelayed(() -> inject(activity), 3000);
    }
    @Override public void onActivityCreated(Activity activity, Bundle state) {}
    @Override public void onActivityStarted(Activity activity) {}
    @Override public void onActivityPaused(Activity activity) {}
    @Override public void onActivityStopped(Activity activity) {}
    @Override public void onActivitySaveInstanceState(Activity activity, Bundle state) {}
    @Override public void onActivityDestroyed(Activity activity) {}

    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) { return null; }
    @Override public String getType(Uri uri) { return null; }
    @Override public Uri insert(Uri uri, ContentValues values) { return null; }
    @Override public int delete(Uri uri, String selection, String[] selectionArgs) { return 0; }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { return 0; }
}