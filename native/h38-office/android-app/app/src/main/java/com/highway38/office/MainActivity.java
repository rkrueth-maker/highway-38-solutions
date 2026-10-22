package com.highway38.office;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import java.util.ArrayList;
import java.util.List;

/**
 * H38 Office native shell.
 *
 * Hosts the Office web app (same URL, same session — sign in once, in the
 * app) and owns the phone-only pieces the web cannot do: the first-run
 * setup wizard and the always-on mileage tracking service.
 *
 * Structure follows the proven H38 Deals wrapper: a plain Activity, a
 * programmatic WebView, a @JavascriptInterface bridge ("AndroidH38Office"),
 * and external links routed out of the WebView.
 */
public final class MainActivity extends Activity {

    static final String OFFICE_URL = "https://highway38solutions.com/commercial-app/";
    private static final String OFFICE_HOST = "highway38solutions.com";
    private static final int REQ_LOCATION_FG = 4201;
    private static final int REQ_NOTIFICATIONS = 4202;
    private static final int REQ_WEB_FILE = 4203;
    private static final int REQ_WEB_CAMERA = 4204;

    private WebView webView;
    private FrameLayout root;
    private ScrollView wizardScroll;
    private LinearLayout wizardBox;
    private LinearLayout signInBar;
    private int wizardStep = -1; // -1 = wizard hidden
    private ValueCallback<Uri[]> fileChooser;

    // -------------------------------------------------------------- lifecycle

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(11, 36, 56));
        getWindow().setNavigationBarColor(Color.WHITE);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(243, 246, 248));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(243, 246, 248));
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));

        buildWizardViews();
        buildSignInBar();
        setContentView(root);

        configureWebView();
        webView.loadUrl(OFFICE_URL);

        if (!PolicyStore.setupComplete(this)) {
            showWizard(0);
        } else {
            TrackingController.reevaluate(this);
        }
    }

    @Override protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
        refreshWizardIfVisible();
        if (PolicyStore.setupComplete(this)) TrackingController.reevaluate(this);
    }

    @Override protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override public void onBackPressed() {
        if (wizardStep >= 0) return; // finish or skip the wizard deliberately
        if (webView != null && webView.canGoBack()) { webView.goBack(); return; }
        super.onBackPressed();
    }

    void reloadWebView() {
        if (webView != null) webView.loadUrl(OFFICE_URL);
    }

    // ---------------------------------------------------------------- webview

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString() + " H38OfficeAndroid/" + BuildConfig.VERSION_NAME);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new OfficeBridge(this), "AndroidH38Office");

        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return routeUrl(url);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onGeolocationPermissionsShowPrompt(
                    String origin, GeolocationPermissions.Callback callback) {
                // The Office's own in-app detection may use location while the
                // app is open — grant for our origin when the phone permission
                // is held; never for anyone else.
                boolean ours = origin != null && origin.contains(OFFICE_HOST);
                callback.invoke(origin, ours && StatusReporter.foregroundLocationGranted(MainActivity.this), false);
            }

            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                                         FileChooserParams params) {
                if (fileChooser != null) fileChooser.onReceiveValue(null);
                fileChooser = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT)
                        .addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("*/*");
                try {
                    startActivityForResult(Intent.createChooser(pick, "Choose file"), REQ_WEB_FILE);
                } catch (Exception e) {
                    fileChooser.onReceiveValue(null);
                    fileChooser = null;
                }
                return true;
            }
        });

        webView.setDownloadListener((url, ua, disposition, mime, len) -> {
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
            catch (Exception e) { Toast.makeText(this, "Could not open download.", Toast.LENGTH_SHORT).show(); }
        });
    }

    private boolean routeUrl(String url) {
        if (url == null || url.isBlank()) return false;
        Uri uri = Uri.parse(url);
        String host = uri.getHost() == null ? "" : uri.getHost();
        String scheme = uri.getScheme() == null ? "" : uri.getScheme();
        if (host.equals(OFFICE_HOST) || host.endsWith(".supabase.co")) return false; // stay in the app
        if (scheme.equals("https") || scheme.equals("http")) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
            catch (Exception e) { Toast.makeText(this, "Could not open link.", Toast.LENGTH_SHORT).show(); }
            return true;
        }
        if (scheme.equals("tel") || scheme.equals("mailto") || scheme.equals("sms")
                || scheme.equals("smsto") || scheme.equals("geo")) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
            return true;
        }
        return false;
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_WEB_FILE && fileChooser != null) {
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                results = new Uri[]{data.getData()};
            }
            fileChooser.onReceiveValue(results);
            fileChooser = null;
        }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] perms, int[] results) {
        super.onRequestPermissionsResult(requestCode, perms, results);
        refreshWizardIfVisible();
        if (PolicyStore.setupComplete(this)) TrackingController.reevaluate(this);
    }

    // ----------------------------------------------------------------- wizard

    private TextView wizTitle;
    private TextView wizBody;
    private TextView wizState;
    private LinearLayout wizButtons;

    private void buildWizardViews() {
        wizardBox = new LinearLayout(this);
        wizardBox.setOrientation(LinearLayout.VERTICAL);
        wizardBox.setPadding(dp(24), dp(28), dp(24), dp(24));
        wizardBox.setBackgroundColor(Color.WHITE);

        wizTitle = new TextView(this);
        wizTitle.setTextSize(24);
        wizTitle.setTextColor(Color.rgb(11, 36, 56));
        wizBody = new TextView(this);
        wizBody.setTextSize(16);
        wizBody.setTextColor(Color.rgb(40, 40, 40));
        wizBody.setPadding(0, dp(12), 0, 0);
        wizState = new TextView(this);
        wizState.setTextSize(15);
        wizState.setTextColor(Color.rgb(11, 93, 41));
        wizState.setPadding(0, dp(14), 0, 0);
        wizButtons = new LinearLayout(this);
        wizButtons.setOrientation(LinearLayout.VERTICAL);
        wizButtons.setPadding(0, dp(20), 0, 0);

        wizardBox.addView(wizTitle);
        wizardBox.addView(wizBody);
        wizardBox.addView(wizState);
        wizardBox.addView(wizButtons);

        wizardScroll = new ScrollView(this);
        wizardScroll.addView(wizardBox);
        wizardScroll.setVisibility(View.GONE);
        root.addView(wizardScroll, new FrameLayout.LayoutParams(-1, -1));
    }

    private void buildSignInBar() {
        signInBar = new LinearLayout(this);
        signInBar.setOrientation(LinearLayout.VERTICAL);
        signInBar.setBackgroundColor(Color.rgb(11, 36, 56));
        signInBar.setPadding(dp(16), dp(12), dp(16), dp(16));
        TextView label = new TextView(this);
        label.setText("Sign in to the Office below — use your own Office login. When you're in, tap Done.");
        label.setTextColor(Color.WHITE);
        label.setTextSize(15);
        Button done = new Button(this);
        done.setText("Done signing in");
        done.setOnClickListener(v -> showWizard(2));
        signInBar.addView(label);
        signInBar.addView(done);
        signInBar.setVisibility(View.GONE);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-1, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.gravity = Gravity.BOTTOM;
        root.addView(signInBar, lp);
    }

    void refreshWizardIfVisible() {
        if (wizardStep >= 0) renderWizardStep();
    }

    void showWizard(int step) {
        wizardStep = step;
        renderWizardStep();
    }

    private void renderWizardStep() {
        if (wizardStep < 0) return;
        boolean signInStep = wizardStep == 1;
        wizardScroll.setVisibility(signInStep ? View.GONE : View.VISIBLE);
        signInBar.setVisibility(signInStep ? View.VISIBLE : View.GONE);
        if (signInStep) return;

        wizButtons.removeAllViews();
        switch (wizardStep) {
            case 0: {
                wizTitle.setText("Welcome to the H38 Office app");
                wizBody.setText("This app is the Office on your phone — same sign-in, same everything — "
                        + "plus one thing the web version can't do: it can notice your drives by itself, "
                        + "all day, and log the miles for you.\n\n"
                        + "Setting it up takes four quick steps. Nothing is tracked until setup is done "
                        + "and you turn mileage on in the Office.");
                wizState.setText("");
                addWizardButton("Get started", () -> showWizard(1));
                break;
            }
            case 2: {
                boolean fg = StatusReporter.foregroundLocationGranted(this);
                boolean bg = StatusReporter.backgroundLocationGranted(this);
                wizTitle.setText("Step 2 of 4 — Location");
                wizBody.setText("To notice drives while the app is closed, the phone needs location "
                        + "“Allow all the time.” Your trips are the only thing recorded — where a drive "
                        + "started, where it ended, and the miles. Nothing else is watched.");
                wizState.setText(!fg ? "Location: not allowed yet."
                        : !bg ? "Location: allowed while using the app — one more tap makes it “all the time.”"
                        : "Location: allowed all the time. ✓");
                if (!fg) {
                    addWizardButton("Allow location", () -> {
                        List<String> perms = new ArrayList<>();
                        perms.add(Manifest.permission.ACCESS_FINE_LOCATION);
                        perms.add(Manifest.permission.ACCESS_COARSE_LOCATION);
                        if (Build.VERSION.SDK_INT == 29) perms.add(Manifest.permission.ACCESS_BACKGROUND_LOCATION);
                        ActivityCompat.requestPermissions(this, perms.toArray(new String[0]), REQ_LOCATION_FG);
                    });
                } else if (!bg) {
                    addWizardButton("Open Settings to allow all the time", () -> {
                        Toast.makeText(this, "Tap Permissions → Location → Allow all the time, then come back here.",
                                Toast.LENGTH_LONG).show();
                        openAppDetails();
                    });
                    addWizardButton("Check again", this::renderWizardStep);
                }
                addWizardButton(bg ? "Continue" : "Continue anyway", () -> showWizard(3));
                addWizardButton("Back", () -> showWizard(1));
                break;
            }
            case 3: {
                boolean granted = StatusReporter.notificationsGranted(this);
                wizTitle.setText("Step 3 of 4 — Notifications");
                wizBody.setText("Android requires a small ongoing notification while mileage tracking "
                        + "is on. It just says “Mileage tracking is on” — that's the deal, so you always "
                        + "know it's running.");
                wizState.setText(granted ? "Notifications: allowed. ✓" : "Notifications: not allowed yet.");
                if (!granted && Build.VERSION.SDK_INT >= 33) {
                    addWizardButton("Allow notifications", () ->
                            ActivityCompat.requestPermissions(this,
                                    new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS));
                } else if (!granted) {
                    addWizardButton("Open Settings to allow", this::openAppDetails);
                }
                addWizardButton("Continue", () -> showWizard(4));
                addWizardButton("Back", () -> showWizard(2));
                break;
            }
            case 4: {
                boolean exempt = StatusReporter.batteryExempt(this);
                wizTitle.setText("Step 4 of 4 — Battery");
                wizBody.setText("Some phones put apps to sleep to save battery, which would stop drive "
                        + "detection. Exempting the Office app keeps tracking alive. It only uses the "
                        + "battery it needs — light checks while you're parked, closer tracking while "
                        + "you're driving.");
                wizState.setText(exempt ? "Battery: exempt. ✓" : "Battery: not exempt yet.");
                if (!exempt) {
                    addWizardButton("Exempt the Office app", () -> {
                        try {
                            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                            i.setData(Uri.parse("package:" + getPackageName()));
                            startActivity(i);
                        } catch (Exception e) {
                            openAppDetails();
                        }
                    });
                    addWizardButton("Check again", this::renderWizardStep);
                }
                addWizardButton("Continue", () -> showWizard(5));
                addWizardButton("Back", () -> showWizard(3));
                break;
            }
            case 5: {
                GateEvaluator.Policy p = PolicyStore.loadPolicy(this);
                GateEvaluator.Gate gate = GateEvaluator.evaluate(p, System.currentTimeMillis());
                wizTitle.setText("Tracking");
                wizBody.setText("Last step: in the Office, open Owner Controls and turn on "
                        + "“Mileage Tracking (Phone)”, and leave Recording on. Owners are recorded "
                        + "whenever those are on; employees are recorded only while clocked in. "
                        + "The Off-Duty switch stops everything, any time.");
                wizState.setText(gateText(gate, p));
                addWizardButton("Open the Office", () -> {
                    PolicyStore.setSetupComplete(this, true);
                    wizardStep = -1;
                    wizardScroll.setVisibility(View.GONE);
                    signInBar.setVisibility(View.GONE);
                    TrackingController.reevaluate(this);
                });
                addWizardButton("Check again", this::renderWizardStep);
                addWizardButton("Back", () -> showWizard(4));
                break;
            }
            default: {
                wizardStep = -1;
                wizardScroll.setVisibility(View.GONE);
                signInBar.setVisibility(View.GONE);
            }
        }
    }

    private String gateText(GateEvaluator.Gate gate, GateEvaluator.Policy p) {
        if (p == null || !p.signedIn) return "Not signed in yet — sign in first (step 1).";
        switch (gate) {
            case RECORDING: return "Tracking is ON. Drives will be logged automatically. ✓";
            case WAITING_CLOCKIN: return "Tracking is on — it records while you're clocked in.";
            case PAUSED_STALE: return "Tracking is paused — open the Office once so it can check in.";
            default: return "Tracking isn't on yet — check the mileage switches in the Office (step text above).";
        }
    }

    private void addWizardButton(String text, Runnable action) {
        Button b = new Button(this);
        b.setText(text);
        b.setOnClickListener(v -> action.run());
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(8);
        wizButtons.addView(b, lp);
    }

    private void openAppDetails() {
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            i.setData(Uri.parse("package:" + getPackageName()));
            startActivity(i);
        } catch (Exception ignored) {}
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
