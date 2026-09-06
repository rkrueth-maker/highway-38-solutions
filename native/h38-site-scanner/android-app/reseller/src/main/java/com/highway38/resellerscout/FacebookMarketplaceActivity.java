package com.highway38.resellerscout;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Automatic Marketplace collector used by Scout.
 *
 * The collector window is intentionally reduced to a 1x1 non-touchable translucent surface so
 * Android never replaces Scout with a blank/black foreground screen. The WebView remains a full
 * offscreen viewport inside that clipped window so Marketplace can render normal listing DOM.
 */
public final class FacebookMarketplaceActivity extends Activity {
    public static final String EXTRA_TERMS="terms",EXTRA_LAT="lat",EXTRA_LON="lon",EXTRA_RADIUS="radius",EXTRA_POSTAL="postal",EXTRA_URL="url";
    private static final String PREFS="h38_reseller_facebook_browser_v1",ROWS="rows",LAST_POSTAL="last_postal",LAST_STATUS="last_status";
    private static final int MAX_ROWS=240,MAX_TERMS=4;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final List<String> terms=new ArrayList<>();
    private WebView webView;
    private int termIndex=0,generation=0,totalNew=0;
    private String currentTerm="",postal="";
    private double lat=Double.NaN,lon=Double.NaN;
    private int radiusMiles=50;
    private boolean authBlocked=false;

    @Override protected void onCreate(Bundle state){
        setTheme(android.R.style.Theme_Translucent_NoTitleBar);
        super.onCreate(state);
        getWindow().setBackgroundDrawableResource(android.R.color.transparent);
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE|WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL);
        WindowManager.LayoutParams lp=getWindow().getAttributes();
        lp.width=1;lp.height=1;lp.gravity=Gravity.BOTTOM|Gravity.END;lp.dimAmount=0f;lp.alpha=0.01f;
        getWindow().setAttributes(lp);
        overridePendingTransition(0,0);
        readIntent();prepareCandidateStore();buildHiddenCollector();
        startSearchCycle();
    }

    private void readIntent(){
        lat=getIntent().getDoubleExtra(EXTRA_LAT,Double.NaN);
        lon=getIntent().getDoubleExtra(EXTRA_LON,Double.NaN);
        radiusMiles=getIntent().getIntExtra(EXTRA_RADIUS,50);
        if(radiusMiles!=25&&radiusMiles!=50&&radiusMiles!=100&&radiusMiles!=150)radiusMiles=50;
        postal=String.valueOf(getIntent().getStringExtra(EXTRA_POSTAL)==null?"":getIntent().getStringExtra(EXTRA_POSTAL)).trim();
        try{
            JSONArray a=new JSONArray(String.valueOf(getIntent().getStringExtra(EXTRA_TERMS)==null?"[]":getIntent().getStringExtra(EXTRA_TERMS)));
            for(int i=0;i<a.length()&&terms.size()<MAX_TERMS;i++){
                String t=a.optString(i,"").trim();
                if(t.length()>=2&&!terms.contains(t))terms.add(t);
            }
        }catch(Exception ignored){}
        if(terms.isEmpty()){
            terms.add("tools");terms.add("electronics");terms.add("appliances");terms.add("lawn mower");
        }
    }

    private void prepareCandidateStore(){
        try{
            SharedPreferences p=getSharedPreferences(PREFS,MODE_PRIVATE);
            String old=p.getString(LAST_POSTAL,"");
            SharedPreferences.Editor e=p.edit().putString(LAST_POSTAL,postal).putString(LAST_STATUS,"SCANNING");
            if(!postal.isBlank()&&!postal.equals(old))e.remove(ROWS);
            e.apply();
        }catch(Exception ignored){}
    }

    private void buildHiddenCollector(){
        FrameLayout root=new FrameLayout(this);root.setBackgroundColor(Color.TRANSPARENT);
        webView=new WebView(this);webView.setBackgroundColor(Color.TRANSPARENT);webView.setAlpha(0.01f);
        webView.setMinimumWidth(1080);webView.setMinimumHeight(1920);
        WebSettings s=webView.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setDatabaseEnabled(true);s.setMediaPlaybackRequiresUserGesture(true);s.setLoadsImagesAutomatically(true);s.setBlockNetworkImage(false);s.setUseWideViewPort(true);s.setLoadWithOverviewMode(false);s.setUserAgentString(s.getUserAgentString()+" H38ResellerScoutMarketplace/"+BuildConfig.VERSION_NAME);
        CookieManager cm=CookieManager.getInstance();cm.setAcceptCookie(true);cm.setAcceptThirdPartyCookies(webView,true);
        webView.addJavascriptInterface(new BrowserBridge(),"AndroidH38FacebookBrowser");
        webView.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
                Uri u=req.getUrl();if(u==null)return true;String host=String.valueOf(u.getHost()).toLowerCase();
                return !(host.endsWith("facebook.com")||host.endsWith("fbcdn.net"));
            }
            @Override public void onPageFinished(WebView view,String url){super.onPageFinished(view,url);scheduleCapture(generation);}
        });
        FrameLayout.LayoutParams wp=new FrameLayout.LayoutParams(1080,1920);
        root.addView(webView,wp);
        setContentView(root);
    }

    private int coarseFacebookRadius(){if(radiusMiles<=25)return 40;if(radiusMiles<=50)return 60;if(radiusMiles<=100)return 100;return 250;}
    private String searchUrl(String term){
        StringBuilder u=new StringBuilder("https://www.facebook.com/marketplace/search/?query=").append(Uri.encode(term)).append("&sortBy=creation_time_descend&daysSinceListed=7&deliveryMethod=local_pick_up&exact=false&radius=").append(coarseFacebookRadius());
        if(Double.isFinite(lat)&&Double.isFinite(lon))u.append("&latitude=").append(lat).append("&longitude=").append(lon);
        return u.toString();
    }
    private static String norm(String v){return v==null?"":v.toLowerCase().replaceAll("[^a-z0-9]","");}
    private boolean locationMatches(String v){if(postal.isBlank())return false;String a=norm(v),b=norm(postal);return !a.isBlank()&&!b.isBlank()&&a.contains(b);}

    private void startSearchCycle(){termIndex=0;loadTerm(0);}
    private void loadTerm(int index){
        if(index<0||index>=terms.size()||authBlocked){finishPass();return;}
        termIndex=index;currentTerm=terms.get(index);generation++;
        webView.loadUrl(searchUrl(currentTerm));
    }
    private void scheduleCapture(int g){
        handler.postDelayed(()->{if(g==generation)capturePage();},1800);
        handler.postDelayed(()->{if(g==generation){try{webView.evaluateJavascript("window.scrollBy(0,Math.max(700,window.innerHeight*.8));",null);}catch(Exception ignored){}capturePage();}},3600);
        handler.postDelayed(()->{if(g==generation)nextTerm();},5200);
    }
    private void nextTerm(){int n=termIndex+1;if(n>=terms.size())finishPass();else loadTerm(n);}
    private void finishPass(){
        if(currentTerm.isEmpty()&&generation>1000)return;
        currentTerm="";generation=1001;
        try{getSharedPreferences(PREFS,MODE_PRIVATE).edit().putString(LAST_STATUS,authBlocked?"AUTH_REQUIRED":"COMPLETE").apply();}catch(Exception ignored){}
        handler.postDelayed(()->{try{finish();overridePendingTransition(0,0);}catch(Exception ignored){}},120);
    }

    private void capturePage(){
        if(webView==null)return;
        String script="""
(function(){
 try{
  function T(e){return String((e&&e.innerText)||'').replace(/\\s+/g,' ').trim()}
  function itemId(v){var m=String(v||'').match(/\\/marketplace\\/item\\/(\\d+)/i);return m?m[1]:''}
  function price(raw){var m=String(raw||'').match(/\\$\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)/);return m?Number(m[1].replace(/,/g,'')):null}
  function distance(raw){var m=String(raw||'').match(/([0-9]+(?:\\.[0-9]+)?)\\s*(?:mi|miles)\\b/i);return m?Number(m[1]):null}
  function pageLocation(){var nodes=[].slice.call(document.querySelectorAll('[aria-label*="location" i],button,[role="button"]'));for(var i=0;i<nodes.length;i++){var x=T(nodes[i]);if(x.length>2&&x.length<90&&x.indexOf('$')<0&&(/location/i.test(String(nodes[i].getAttribute&&nodes[i].getAttribute('aria-label')||''))||/^[A-Za-z .\'-]+(?:,\\s*[A-Za-z]{2})?$/.test(x)))return x}return''}
  var body=String((document.body&&document.body.innerText)||''),low=body.toLowerCase(),path=String(location.pathname||'').toLowerCase();
  var anchors=[].slice.call(document.querySelectorAll('a[href*="/marketplace/item/"]'));
  var login=!anchors.length&&(low.indexOf('log in to facebook')>=0||low.indexOf('email or phone')>=0||low.indexOf('security check')>=0||path.indexOf('/login')>=0||path.indexOf('/checkpoint')>=0);
  if(login){AndroidH38FacebookBrowser.capture(JSON.stringify({login_required:true,rows:[]}));return}
  var seen={},rows=[];
  anchors.forEach(function(a){var href=String(a.href||a.getAttribute('href')||''),id=itemId(href);if(!id||seen[id])return;seen[id]=1;var n=a;for(var up=0;up<7&&n;up++,n=n.parentElement){if(n.querySelector&&n.querySelector('img')&&T(n).length>=10)break}var raw=T(n||a);if(!raw)return;var lines=raw.split(/\\n| · /).map(function(x){return x.trim()}).filter(Boolean),title='';for(var i=0;i<lines.length;i++){var x=lines[i],lx=x.toLowerCase();if(x.charAt(0)==='$'||/\\b(?:mi|miles)\\b/.test(lx)||lx==='listed'||lx==='sponsored'||lx==='local pickup')continue;if(x.length>=3&&x.length<=150){title=x;break}}if(!title)title=String(a.getAttribute('aria-label')||'Marketplace listing').slice(0,150);var img=(n&&n.querySelector&&n.querySelector('img'))||(a.querySelector&&a.querySelector('img'));rows.push({id:id,source:'Facebook Marketplace',title:title,text:raw,price:price(raw),url:href.split('?')[0],image_url:img?String(img.currentSrc||img.src||''):'',distance_miles:distance(raw),captured_at:Date.now(),browser_session:true})});
  AndroidH38FacebookBrowser.capture(JSON.stringify({login_required:false,location_text:pageLocation(),rows:rows,item_urls_seen:rows.length}));
 }catch(e){AndroidH38FacebookBrowser.capture(JSON.stringify({error:String(e),rows:[]}));}
})();
""";
        webView.evaluateJavascript(script,null);
    }

    private final class BrowserBridge{
        @JavascriptInterface public void capture(String json){runOnUiThread(()->{
            try{
                JSONObject p=new JSONObject(json==null?"{}":json);
                if(p.optBoolean("login_required",false)){authBlocked=true;finishPass();return;}
                JSONArray in=p.optJSONArray("rows");if(in==null)return;
                String pageLoc=p.optString("location_text","");boolean pageProven=locationMatches(pageLoc);JSONArray safe=new JSONArray();
                for(int i=0;i<in.length();i++){
                    JSONObject x=in.optJSONObject(i);if(x==null)continue;double d=x.has("distance_miles")&&!x.isNull("distance_miles")?x.optDouble("distance_miles",Double.NaN):Double.NaN;
                    boolean distanceProven=Double.isFinite(d)&&d<=radiusMiles;
                    if(!pageProven&&!distanceProven)continue;
                    x.put("distance_verified",distanceProven);x.put("location_verified",true);x.put("facebook_marketplace_location",pageLoc);safe.put(x);
                }
                totalNew+=mergeRows(FacebookMarketplaceActivity.this,safe,currentTerm,postal,radiusMiles,pageLoc,true);
            }catch(Exception ignored){}
        });}
    }

    private static int mergeRows(Context context,JSONArray incoming,String term,String postal,int radius,String locationText,boolean locationVerified){
        if(incoming==null)return 0;try{
            SharedPreferences p=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);JSONArray old=new JSONArray(p.getString(ROWS,"[]"));Map<String,JSONObject> merged=new LinkedHashMap<>();Set<String> oldIds=new HashSet<>();
            for(int i=0;i<old.length();i++){JSONObject x=old.optJSONObject(i);if(x==null)continue;String id=x.optString("id",x.optString("url",""));if(id.isBlank())continue;oldIds.add(id);merged.put(id,x);}
            int added=0;Set<String> incomingIds=new HashSet<>();
            for(int i=0;i<incoming.length();i++){
                JSONObject x=incoming.optJSONObject(i);if(x==null)continue;String id=x.optString("id",x.optString("url",""));if(id.isBlank()||!incomingIds.add(id))continue;
                x.put("term",term==null?"":term);x.put("captured_at",System.currentTimeMillis());x.put("search_postal",postal==null?"":postal);x.put("search_radius_miles",radius);x.put("facebook_marketplace_location",locationText==null?"":locationText);x.put("location_verified",locationVerified);
                if(!oldIds.contains(id))added++;merged.put(id,x);
            }
            JSONArray save=new JSONArray();List<JSONObject> rows=new ArrayList<>(merged.values());for(int i=rows.size()-1,n=0;i>=0&&n<MAX_ROWS;i--,n++)save.put(rows.get(i));p.edit().putString(ROWS,save.toString()).apply();return added;
        }catch(Exception ignored){return 0;}
    }

    public static String rowsJson(Context context){
        try{
            SharedPreferences p=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);String raw=p.getString(ROWS,"[]"),postal=p.getString(LAST_POSTAL,"");if(postal.isBlank())return raw;
            JSONArray old=new JSONArray(raw),safe=new JSONArray();for(int i=0;i<old.length();i++){JSONObject x=old.optJSONObject(i);if(x==null||!x.optBoolean("location_verified",false))continue;if(postal.equals(x.optString("search_postal","")))safe.put(x);}return safe.toString();
        }catch(Exception ignored){return"[]";}
    }
    public static String status(Context context){try{return context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).getString(LAST_STATUS,"IDLE");}catch(Exception ignored){return"IDLE";}}

    @Override protected void onDestroy(){handler.removeCallbacksAndMessages(null);try{if(webView!=null){webView.stopLoading();webView.removeAllViews();webView.destroy();}}catch(Exception ignored){}super.onDestroy();}
}
