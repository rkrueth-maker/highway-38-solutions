package com.highway38.resellerscout;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Authenticated device-side Facebook Marketplace browser.
 *
 * Scout never copies Facebook cookies out of another app and never attempts to
 * bypass a Facebook login/challenge. The user signs in here if Facebook allows
 * the embedded browser. Cookies then remain in Android WebView storage on this
 * phone and visible Marketplace cards can be analyzed by Scout.
 */
public final class FacebookMarketplaceActivity extends Activity {
    public static final String EXTRA_TERMS = "terms";
    public static final String EXTRA_LAT = "lat";
    public static final String EXTRA_LON = "lon";
    public static final String EXTRA_RADIUS = "radius";
    public static final String EXTRA_POSTAL = "postal";
    public static final String EXTRA_URL = "url";

    private static final String PREFS = "h38_reseller_facebook_browser_v1";
    private static final String ROWS = "rows";
    private static final int MAX_ROWS = 180;
    private static final int MAX_TERMS = 6;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<String> terms = new ArrayList<>();
    private WebView webView;
    private TextView status;
    private int termIndex = 0;
    private int generation = 0;
    private String currentTerm = "";
    private double lat = Double.NaN, lon = Double.NaN;
    private int radiusMiles = 50;
    private String postal = "";

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        readIntent();
        buildUi();
        String direct = getIntent().getStringExtra(EXTRA_URL);
        if (direct != null && direct.startsWith("https://www.facebook.com/marketplace/")) {
            status.setText("Opening saved Marketplace listing in your Scout Facebook session.");
            webView.loadUrl(direct);
        } else {
            startSearchCycle();
        }
    }

    private void readIntent() {
        lat = getIntent().getDoubleExtra(EXTRA_LAT, Double.NaN);
        lon = getIntent().getDoubleExtra(EXTRA_LON, Double.NaN);
        radiusMiles = getIntent().getIntExtra(EXTRA_RADIUS, 50);
        if (radiusMiles != 25 && radiusMiles != 50 && radiusMiles != 100 && radiusMiles != 150) radiusMiles = 50;
        postal = String.valueOf(getIntent().getStringExtra(EXTRA_POSTAL) == null ? "" : getIntent().getStringExtra(EXTRA_POSTAL));
        try {
            JSONArray a = new JSONArray(String.valueOf(getIntent().getStringExtra(EXTRA_TERMS) == null ? "[]" : getIntent().getStringExtra(EXTRA_TERMS)));
            for (int i = 0; i < a.length() && terms.size() < MAX_TERMS; i++) {
                String t = a.optString(i, "").trim();
                if (t.length() >= 2 && !terms.contains(t)) terms.add(t);
            }
        } catch (Exception ignored) {}
        if (terms.isEmpty()) {
            terms.add("Milwaukee"); terms.add("DeWalt"); terms.add("generator"); terms.add("welder"); terms.add("toolbox");
        }
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);

        status = new TextView(this);
        status.setPadding(18, 14, 18, 14);
        status.setTextSize(13f);
        status.setText("Facebook Marketplace browser starting…");
        root.addView(status, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        LinearLayout buttons = new LinearLayout(this);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        buttons.setPadding(12, 0, 12, 8);
        Button back = new Button(this); back.setText("Back to Scout"); back.setOnClickListener(v -> finish());
        Button capture = new Button(this); capture.setText("Capture visible"); capture.setOnClickListener(v -> captureVisible(false));
        Button next = new Button(this); next.setText("Next search"); next.setOnClickListener(v -> nextTerm());
        buttons.addView(back, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        buttons.addView(capture, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        buttons.addView(next, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        root.addView(buttons);

        webView = new WebView(this);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setUserAgentString(s.getUserAgentString() + " H38ResellerScoutMarketplace/0.1.27");
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(webView, true);
        webView.addJavascriptInterface(new BrowserBridge(), "AndroidH38FacebookBrowser");
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (u == null) return false;
                String host = String.valueOf(u.getHost()).toLowerCase();
                if (host.endsWith("facebook.com") || host.endsWith("fbcdn.net")) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                int g = generation;
                handler.postDelayed(() -> { if (g == generation) captureVisible(true); }, 2600);
                handler.postDelayed(() -> { if (g == generation) captureVisible(true); }, 5200);
                if (!currentTerm.isEmpty()) handler.postDelayed(() -> { if (g == generation) nextTerm(); }, 7200);
            }
        });
        root.addView(webView, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);
    }

    private String searchUrl(String term) {
        StringBuilder u = new StringBuilder("https://www.facebook.com/marketplace/search/?query=")
                .append(Uri.encode(term))
                .append("&sortBy=creation_time_descend&daysSinceListed=7&deliveryMethod=local_pick_up&exact=false&radius=")
                .append(radiusMiles);
        if (Double.isFinite(lat) && Double.isFinite(lon)) {
            u.append("&latitude=").append(lat).append("&longitude=").append(lon);
        }
        return u.toString();
    }

    private void startSearchCycle() {
        termIndex = 0;
        loadTerm(0);
    }

    private void loadTerm(int index) {
        if (index < 0 || index >= terms.size()) {
            currentTerm = "";
            status.setText("Facebook scan pass complete. Captured listings are ready in Scout. You can keep browsing and tap Capture visible anytime.");
            return;
        }
        termIndex = index;
        currentTerm = terms.get(index);
        generation++;
        String where = postal.isBlank() ? "selected Scout area" : "ZIP " + postal;
        status.setText("Searching Facebook Marketplace for “" + currentTerm + "” near " + where + " / " + radiusMiles + " mi. If Facebook shows a different Marketplace location, set it once in this browser; Scout will keep this browser session on your phone.");
        webView.loadUrl(searchUrl(currentTerm));
    }

    private void nextTerm() {
        if (currentTerm.isEmpty()) return;
        int n = termIndex + 1;
        if (n >= terms.size()) {
            currentTerm = "";
            generation++;
            status.setText("Facebook search pass complete. Return to Scout to rank captured listings by resale profit.");
            return;
        }
        loadTerm(n);
    }

    private void captureVisible(boolean automatic) {
        if (webView == null) return;
        String script = """
            (function(){
              try{
                var body=(document.body&&document.body.innerText)||'';
                var login=/log in to facebook|email or phone|create new account/i.test(body.slice(0,12000)) && !document.querySelector('a[href*="/marketplace/item/"]');
                var rows=[],seen=new Set();
                document.querySelectorAll('a[href*="/marketplace/item/"]').forEach(function(a){
                  var href=String(a.href||'').split('?')[0];if(!href||seen.has(href))return;seen.add(href);
                  var node=a;
                  for(var i=0;i<5&&node&&String(node.innerText||'').trim().length<18;i++)node=node.parentElement;
                  var raw=String((node&&node.innerText)||a.innerText||'').replace(/\\s+/g,' ').trim();
                  if(raw.length<4)return;
                  var pm=raw.match(/\\$\\s*([0-9]{1,7}(?:,[0-9]{3})*(?:\\.[0-9]{1,2})?)/),price=pm?Number(pm[1].replace(/,/g,'')):null;
                  var dm=raw.match(/([0-9]+(?:\\.[0-9]+)?)\\s*(?:mi|miles)\\s*(?:away)?/i),dist=dm?Number(dm[1]):null;
                  var lines=String((node&&node.innerText)||a.innerText||'').split(/\\n+/).map(function(x){return x.trim()}).filter(Boolean);
                  var title='';for(var j=0;j<lines.length;j++){var x=lines[j];if(/^\\$/.test(x)||/^(listed|sponsored|ships|delivery|local pickup)/i.test(x)||/\\b(?:mi|miles) away\\b/i.test(x))continue;if(x.length>=3&&x.length<=150){title=x;break}}
                  if(!title)title=String(a.getAttribute('aria-label')||a.textContent||'Marketplace listing').trim().slice(0,150);
                  var img=(node&&node.querySelector&&node.querySelector('img'))||a.querySelector('img');
                  var im=img?String(img.currentSrc||img.src||''):'';
                  var id=(href.match(/\\/marketplace\\/item\\/(\\d+)/)||[])[1]||href;
                  rows.push({id:id,source:'Facebook Marketplace',title:title,text:raw,price:price,url:href,image_url:im,distance_miles:dist,location_label:'',captured_at:Date.now(),browser_session:true});
                });
                AndroidH38FacebookBrowser.capture(JSON.stringify({login_required:login,url:location.href,rows:rows}));
              }catch(e){AndroidH38FacebookBrowser.capture(JSON.stringify({error:String(e),rows:[]}));}
            })();
            """;
        webView.evaluateJavascript(script, null);
        if (!automatic) status.setText("Capturing the Marketplace listings currently visible on this page…");
    }

    private final class BrowserBridge {
        @JavascriptInterface public void capture(String json) {
            runOnUiThread(() -> {
                try {
                    JSONObject p = new JSONObject(json == null ? "{}" : json);
                    if (p.optBoolean("login_required", false)) {
                        status.setText("Facebook requires a login in this Scout browser. Sign in normally here if Facebook allows it. Scout will not bypass a Facebook login or copy cookies from another app.");
                        currentTerm = "";
                        generation++;
                        return;
                    }
                    JSONArray a = p.optJSONArray("rows");
                    int count = mergeRows(FacebookMarketplaceActivity.this, a, currentTerm);
                    if (count > 0) status.setText("Captured " + count + " visible Marketplace listing" + (count == 1 ? "" : "s") + " for “" + currentTerm + "”. Scout will rank them after you return.");
                    else if (p.has("error")) status.setText("Marketplace capture unavailable on this page: " + p.optString("error"));
                    else status.setText("No readable Marketplace listing cards were visible yet. Let the page finish loading, scroll, or use the next search.");
                } catch (Exception e) {
                    status.setText("Marketplace capture could not be read: " + e.getMessage());
                }
            });
        }
    }

    private static int mergeRows(Context context, JSONArray incoming, String term) {
        if (incoming == null) return 0;
        try {
            SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray old = new JSONArray(p.getString(ROWS, "[]"));
            Map<String, JSONObject> merged = new LinkedHashMap<>();
            int added = 0;
            for (int i = 0; i < incoming.length(); i++) {
                JSONObject x = incoming.optJSONObject(i); if (x == null) continue;
                String id = x.optString("id", x.optString("url", "")); if (id.isBlank()) continue;
                x.put("term", term == null ? "" : term);
                x.put("captured_at", System.currentTimeMillis());
                merged.put(id, x); added++;
            }
            for (int i = 0; i < old.length(); i++) {
                JSONObject x = old.optJSONObject(i); if (x == null) continue;
                String id = x.optString("id", x.optString("url", "")); if (id.isBlank() || merged.containsKey(id)) continue;
                merged.put(id, x);
            }
            JSONArray save = new JSONArray();
            int n = 0; for (JSONObject x : merged.values()) { if (n++ >= MAX_ROWS) break; save.put(x); }
            p.edit().putString(ROWS, save.toString()).apply();
            return added;
        } catch (Exception ignored) { return 0; }
    }

    public static String rowsJson(Context context) {
        try { return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(ROWS, "[]"); }
        catch (Exception ignored) { return "[]"; }
    }
}
