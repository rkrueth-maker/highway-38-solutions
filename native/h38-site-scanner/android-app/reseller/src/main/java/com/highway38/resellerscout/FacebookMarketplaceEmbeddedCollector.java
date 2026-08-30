package com.highway38.resellerscout;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
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
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Public-only Marketplace discovery. No Facebook authentication is used. */
final class FacebookMarketplaceEmbeddedCollector {
    private static final String PREFS="h38_reseller_facebook_browser_v1";
    private static final String ROWS="rows",LAST_POSTAL="last_postal",LAST_STATUS="last_status",LAST_DIAGNOSTICS="last_diagnostics";
    private static final int MAX_ROWS=240,MAX_TERMS=4;
    private final MainActivity activity;
    private final FrameLayout root;
    private final WebView scoutWebView;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final List<String> terms=new ArrayList<>();
    private WebView collector;
    private int termIndex=0,generation=0,totalCaptured=0,totalAccepted=0;
    private boolean publicBlocked=false;
    private String currentTerm="",postal="",phase="DIRECT";
    private double lat=Double.NaN,lon=Double.NaN;
    private int radiusMiles=50;

    FacebookMarketplaceEmbeddedCollector(MainActivity activity,FrameLayout root,WebView scoutWebView){this.activity=activity;this.root=root;this.scoutWebView=scoutWebView;}

    void start(String termsJson,double lat,double lon,int radius,String postal){
        stopCollector(true);this.lat=lat;this.lon=lon;this.radiusMiles=(radius==25||radius==50||radius==100||radius==150)?radius:50;this.postal=postal==null?"":postal.trim();termIndex=0;generation++;totalCaptured=0;totalAccepted=0;publicBlocked=false;currentTerm="";phase="DIRECT";terms.clear();
        try{JSONArray a=new JSONArray(termsJson==null?"[]":termsJson);for(int i=0;i<a.length()&&terms.size()<MAX_TERMS;i++){String t=a.optString(i,"").trim();if(t.length()>=2&&!t.startsWith("__H38_")&&!terms.contains(t))terms.add(t);}}catch(Exception ignored){}
        if(terms.isEmpty()){terms.add("tools");terms.add("electronics");terms.add("appliances");terms.add("lawn mower");}
        prepareStore();clearFacebookAuthCookies();createCollectorWebView();loadDirect(0);
    }

    private void prepareStore(){try{activity.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putString(LAST_POSTAL,postal).putString(LAST_STATUS,"SCANNING_PUBLIC").putString(LAST_DIAGNOSTICS,"{\"mode\":\"PUBLIC_ONLY_V304\"}").remove(ROWS).apply();}catch(Exception ignored){}}
    private void clearFacebookAuthCookies(){try{CookieManager cm=CookieManager.getInstance();for(String name:new String[]{"c_user","xs","presence"})cm.setCookie("https://www.facebook.com/",name+"=; Max-Age=0; Path=/; Domain=.facebook.com; Secure");cm.flush();}catch(Exception ignored){}}
    private void writeStatus(String status){try{activity.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putString(LAST_STATUS,status).apply();}catch(Exception ignored){}}
    private void writeDiagnostics(JSONObject o){try{activity.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putString(LAST_DIAGNOSTICS,o==null?"{}":o.toString()).apply();}catch(Exception ignored){}}

    private void configureWebView(WebView w){w.setBackgroundColor(Color.TRANSPARENT);w.setAlpha(1f);w.setFocusable(false);w.setFocusableInTouchMode(false);w.setClickable(false);w.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);WebSettings s=w.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setDatabaseEnabled(true);s.setMediaPlaybackRequiresUserGesture(true);s.setLoadsImagesAutomatically(true);s.setBlockNetworkImage(false);s.setUserAgentString("Mozilla/5.0 (Linux; Android 16; Mobile) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36 H38ScoutPublic/"+BuildConfig.VERSION_NAME);CookieManager cm=CookieManager.getInstance();cm.setAcceptCookie(true);cm.setAcceptThirdPartyCookies(w,false);}
    private static boolean allowedHost(String host){String h=host==null?"":host.toLowerCase(Locale.US);return h.equals("facebook.com")||h.endsWith(".facebook.com")||h.equals("fbcdn.net")||h.endsWith(".fbcdn.net")||h.equals("duckduckgo.com")||h.endsWith(".duckduckgo.com");}
    private void createCollectorWebView(){collector=new WebView(activity);configureWebView(collector);collector.addJavascriptInterface(new Bridge(),"AndroidH38FacebookBrowser");collector.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){Uri u=req.getUrl();return u==null||!allowedHost(u.getHost());}@Override public void onPageFinished(WebView view,String url){final int g=generation;handler.postDelayed(()->{if(g==generation)capturePage();},phase.equals("DIRECT")?2600:2200);}});root.addView(collector,0,new FrameLayout.LayoutParams(1080,1920));}

    private int coarseRadius(){if(radiusMiles<=25)return 40;if(radiusMiles<=50)return 60;if(radiusMiles<=100)return 100;return 250;}
    private String directUrl(String term){StringBuilder u=new StringBuilder("https://www.facebook.com/marketplace/search/?query=").append(Uri.encode(term)).append("&sortBy=creation_time_descend&daysSinceListed=7&deliveryMethod=local_pick_up&exact=false&radius=").append(coarseRadius());if(Double.isFinite(lat)&&Double.isFinite(lon)&&!(lat==0d&&lon==0d))u.append("&latitude=").append(lat).append("&longitude=").append(lon);return u.toString();}
    private String indexUrl(String term){String loc=postal.replace('|',' ').trim();String q="site:facebook.com/marketplace/item/ \""+term+"\" "+loc;return"https://html.duckduckgo.com/html/?q="+Uri.encode(q);}
    private void loadDirect(int index){if(index<0||index>=terms.size()){finishPass();return;}termIndex=index;currentTerm=terms.get(index);phase="DIRECT";writeStatus("SCANNING_PUBLIC");final int g=++generation;collector.loadUrl(directUrl(currentTerm));handler.postDelayed(()->{if(g==generation)capturePage();},4200);}
    private void loadIndex(){phase="INDEX";writeStatus("SEARCHING_PUBLIC_INDEX");final int g=++generation;collector.loadUrl(indexUrl(currentTerm));handler.postDelayed(()->{if(g==generation)capturePage();},3800);}
    private void nextTerm(){int n=termIndex+1;if(n>=terms.size())finishPass();else loadDirect(n);}
    private void finishPass(){generation++;currentTerm="";String status=totalAccepted>0?"COMPLETE_WITH_ROWS":totalCaptured>0?"COMPLETE_LOCATION_UNPROVEN":publicBlocked?"PUBLIC_BLOCKED":"COMPLETE_EMPTY";writeStatus(status);stopCollector(false);scoutWebView.postDelayed(()->scoutWebView.evaluateJavascript("window.H38ScoutReturned&&window.H38ScoutReturned();",null),120);}
    void destroy(){stopCollector(true);}private void stopCollector(boolean clearCallbacks){if(clearCallbacks)handler.removeCallbacksAndMessages(null);WebView w=collector;collector=null;if(w!=null){try{root.removeView(w);}catch(Exception ignored){}try{w.stopLoading();w.removeJavascriptInterface("AndroidH38FacebookBrowser");w.removeAllViews();w.destroy();}catch(Exception ignored){}}}

    private void capturePage(){if(collector==null)return;String p=phase;String script="""
(function(){
 try{
  function textOf(e){return String((e&&e.innerText)||'').trim()}
  function target(v){var s=String(v||'');try{var u=new URL(s,location.href),x=u.searchParams.get('uddg');if(x)s=decodeURIComponent(x)}catch(e){}return s}
  function itemId(v){var s=target(v),p=s.indexOf('/marketplace/item/');if(p<0)return'';var tail=s.slice(p+18),id='';for(var i=0;i<tail.length;i++){var c=tail.charAt(i);if(c>='0'&&c<='9')id+=c;else break}return id}
  function cleanUrl(v){var id=itemId(v);return id?'https://www.facebook.com/marketplace/item/'+id:''}
  function price(raw){var m=String(raw||'').match(/[$][ ]*([0-9][0-9,.]*)/);if(!m)return null;var n=Number(m[1].split(',').join(''));return Number.isFinite(n)?n:null}
  function distance(raw){var s=String(raw||'').toLowerCase(),at=s.indexOf(' mi');if(at<1)at=s.indexOf(' mile');if(at<1)return null;var left=s.slice(Math.max(0,at-8),at),n='';for(var i=left.length-1;i>=0;i--){var c=left.charAt(i);if((c>='0'&&c<='9')||c==='.')n=c+n;else if(n)break}var v=Number(n);return Number.isFinite(v)?v:null}
  function goodImage(v){var x=String(v||'');return x.indexOf('https://')===0&&x.toLowerCase().indexOf('logo')<0&&x.toLowerCase().indexOf('placeholder')<0&&x.toLowerCase().indexOf('pixel')<0}
  function cardFor(a){var n=a;for(var i=0;i<9&&n;i++,n=n.parentElement){if(n.classList&&(n.classList.contains('result')||n.classList.contains('web-result')))return n;if(n.querySelector&&n.querySelector('img')&&textOf(n).length>12)return n}return a}
  function imageFor(card){var imgs=[].slice.call(card&&card.querySelectorAll?card.querySelectorAll('img'):[]);for(var i=0;i<imgs.length;i++){var u=String(imgs[i].currentSrc||imgs[i].src||'');if(goodImage(u))return u}return''}
  var body=String((document.body&&document.body.innerText)||''),low=body.toLowerCase(),all=[].slice.call(document.querySelectorAll('a[href]')),seen={},rows=[];
  all.forEach(function(a){var href=target(a.href||a.getAttribute('href')||''),id=itemId(href);if(!id||seen[id])return;seen[id]=1;var card=cardFor(a),raw=textOf(card),title=textOf(a)||'Marketplace listing '+id;rows.push({id:id,source:'Facebook Marketplace',title:title.slice(0,180),text:raw.slice(0,900),price:price(raw),url:cleanUrl(href),image_url:imageFor(card),distance_miles:distance(raw),captured_at:Date.now(),browser_session:false,public_only:true,public_indexed:%INDEXED%,freshness_unproven:%INDEXED%,capture_method:%METHOD%})});
  var blocked=rows.length===0&&(low.indexOf('log in to facebook')>=0||low.indexOf('email or phone')>=0||low.indexOf('security check')>=0||String(location.pathname||'').toLowerCase().indexOf('/login')>=0||String(location.pathname||'').toLowerCase().indexOf('/checkpoint')>=0);
  AndroidH38FacebookBrowser.capture(JSON.stringify({phase:%PHASE%,public_blocked:blocked,rows:rows,diagnostics:{mode:'PUBLIC_ONLY_V304',phase:%PHASE%,host:String(location.host||''),path:String(location.pathname||''),anchors:all.length,item_urls_seen:rows.length,body_chars:body.length,title:String(document.title||'')}}));
 }catch(e){AndroidH38FacebookBrowser.capture(JSON.stringify({phase:%PHASE%,error:String(e),rows:[],diagnostics:{mode:'PUBLIC_ONLY_V304',reason:'EXTRACTOR_EXCEPTION',message:String(e)}}))}
})();
""".replace("%INDEXED%",p.equals("INDEX")?"true":"false").replace("%METHOD%",p.equals("INDEX")?"'PUBLIC_WEB_INDEX'":"'PUBLIC_DOM_ANCHOR'").replace("%PHASE%",JSONObject.quote(p));collector.evaluateJavascript(script,null);}

    private static String norm(String v){return v==null?"":v.toLowerCase(Locale.US).replaceAll("[^a-z0-9]","");}
    private boolean locationMatches(String value){String page=value==null?"":value.trim();if(page.isBlank()||postal.isBlank())return false;String pn=norm(page);for(String proof:postal.split("[|]")){String q=proof.trim();if(q.isBlank())continue;String n=norm(q);if(n.length()>=4&&pn.contains(n))return true;String[] parts=q.split(",");if(parts.length>=2){String city=norm(parts[0]),state=norm(parts[1]);if(city.length()>=3&&pn.contains(city)&&state.length()>=2&&pn.contains(state))return true;}}return false;}

    private final class Bridge{@JavascriptInterface public void capture(String json){activity.runOnUiThread(()->{try{JSONObject p=new JSONObject(json==null?"{}":json),diagnostics=p.optJSONObject("diagnostics");if(diagnostics!=null)writeDiagnostics(diagnostics);String gotPhase=p.optString("phase",phase);if(p.optBoolean("public_blocked",false))publicBlocked=true;JSONArray incoming=p.optJSONArray("rows");if(incoming!=null){JSONArray preserved=new JSONArray();totalCaptured+=incoming.length();for(int i=0;i<incoming.length();i++){JSONObject x=incoming.optJSONObject(i);if(x==null)continue;double d=x.has("distance_miles")&&!x.isNull("distance_miles")?x.optDouble("distance_miles",Double.NaN):Double.NaN;boolean hasDistance=Double.isFinite(d),distanceProven=hasDistance&&d<=radiusMiles,outside=hasDistance&&d>radiusMiles,cardProven=locationMatches(x.optString("text","")),verified=!outside&&(distanceProven||cardProven);x.put("distance_verified",distanceProven);x.put("card_location_verified",cardProven);x.put("location_verified",verified);x.put("location_status",outside?"OUTSIDE_RADIUS":distanceProven?"DISTANCE_VERIFIED":cardProven?"CARD_LOCATION_VERIFIED":"LOCATION_UNPROVEN");x.put("public_only",true);x.put("browser_session",false);if(verified)totalAccepted++;preserved.put(x);}mergeRows(activity,preserved,currentTerm,postal,radiusMiles);}
            if("DIRECT".equals(gotPhase))loadIndex();else nextTerm();}catch(Exception ignored){if("DIRECT".equals(phase))loadIndex();else nextTerm();}});}}

    private static int mergeRows(Context context,JSONArray incoming,String term,String postal,int radius){if(incoming==null)return 0;try{SharedPreferences p=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);JSONArray old=new JSONArray(p.getString(ROWS,"[]"));Map<String,JSONObject> merged=new LinkedHashMap<>();Set<String> oldIds=new HashSet<>();for(int i=0;i<old.length();i++){JSONObject x=old.optJSONObject(i);if(x==null)continue;String id=x.optString("id",x.optString("url",""));if(id.isBlank())continue;oldIds.add(id);merged.put(id,x);}int added=0;Set<String> incomingIds=new HashSet<>();for(int i=0;i<incoming.length();i++){JSONObject x=incoming.optJSONObject(i);if(x==null)continue;String id=x.optString("id",x.optString("url",""));if(id.isBlank()||!incomingIds.add(id))continue;x.put("term",term==null?"":term);x.put("captured_at",System.currentTimeMillis());x.put("search_postal",postal==null?"":postal);x.put("search_radius_miles",radius);if(!oldIds.contains(id))added++;merged.put(id,x);}JSONArray save=new JSONArray();List<JSONObject> rows=new ArrayList<>(merged.values());int start=Math.max(0,rows.size()-MAX_ROWS);for(int i=start;i<rows.size();i++)save.put(rows.get(i));p.edit().putString(ROWS,save.toString()).apply();return added;}catch(Exception ignored){return 0;}}

    static String rowsJson(Context context){try{SharedPreferences p=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);String raw=p.getString(ROWS,"[]"),postal=p.getString(LAST_POSTAL,""),status=p.getString(LAST_STATUS,""),diagnostics=p.getString(LAST_DIAGNOSTICS,"{}");JSONArray old=new JSONArray(raw),safe=new JSONArray();int captured=0,usable=0,unproven=0,outside=0,indexed=0;for(int i=0;i<old.length();i++){JSONObject x=old.optJSONObject(i);if(x==null)continue;if(!postal.isBlank()&&!postal.equals(x.optString("search_postal","")))continue;captured++;if(x.optBoolean("public_indexed",false))indexed++;if(x.optBoolean("location_verified",false))usable++;else if("OUTSIDE_RADIUS".equals(x.optString("location_status","")))outside++;else unproven++;}if(!status.isBlank()){JSONObject marker=new JSONObject();marker.put("h38_system",true);marker.put("status",status);marker.put("mode","PUBLIC_ONLY_V304");marker.put("captured_count",captured);marker.put("usable_count",usable);marker.put("location_unproven_count",unproven);marker.put("outside_radius_count",outside);marker.put("public_index_count",indexed);try{marker.put("diagnostics",new JSONObject(diagnostics));}catch(Exception ignored){}safe.put(marker);}for(int i=0;i<old.length();i++){JSONObject x=old.optJSONObject(i);if(x==null)continue;if(postal.isBlank()||postal.equals(x.optString("search_postal","")))safe.put(x);}return safe.toString();}catch(Exception ignored){return"[]";}}
}
