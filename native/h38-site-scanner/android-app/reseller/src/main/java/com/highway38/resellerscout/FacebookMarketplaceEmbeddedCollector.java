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

/**
 * Public-only Facebook Marketplace collector.
 *
 * This collector intentionally does not ask the owner to authenticate to Facebook and does not
 * depend on a persisted Facebook session. It attempts anonymous/public Marketplace pages only.
 * If Facebook presents a login/checkpoint wall to anonymous traffic, Scout records PUBLIC_BLOCKED
 * truthfully and continues its other providers. No checkpoint, CAPTCHA, or auth bypass is attempted.
 */
final class FacebookMarketplaceEmbeddedCollector {
    private static final String PREFS="h38_reseller_facebook_browser_v1";
    private static final String ROWS="rows";
    private static final String LAST_POSTAL="last_postal";
    private static final String LAST_STATUS="last_status";
    private static final String LAST_DIAGNOSTICS="last_diagnostics";
    private static final int MAX_ROWS=240;
    private static final int MAX_TERMS=4;

    private final MainActivity activity;
    private final FrameLayout root;
    private final WebView scoutWebView;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final List<String> terms=new ArrayList<>();

    private WebView collector;
    private int termIndex=0;
    private int generation=0;
    private int scheduledGeneration=-1;
    private int totalCaptured=0;
    private int totalAccepted=0;
    private boolean publicBlocked=false;
    private String currentTerm="";
    private String postal="";
    private double lat=Double.NaN;
    private double lon=Double.NaN;
    private int radiusMiles=50;

    FacebookMarketplaceEmbeddedCollector(MainActivity activity,FrameLayout root,WebView scoutWebView){
        this.activity=activity;
        this.root=root;
        this.scoutWebView=scoutWebView;
    }

    void start(String termsJson,double lat,double lon,int radius,String postal){
        stopCollector(false);
        this.lat=lat;
        this.lon=lon;
        this.radiusMiles=(radius==25||radius==50||radius==100||radius==150)?radius:50;
        this.postal=postal==null?"":postal.trim();
        this.termIndex=0;
        this.generation++;
        this.scheduledGeneration=-1;
        this.totalCaptured=0;
        this.totalAccepted=0;
        this.publicBlocked=false;
        this.currentTerm="";
        terms.clear();
        try{
            JSONArray a=new JSONArray(termsJson==null?"[]":termsJson);
            for(int i=0;i<a.length()&&terms.size()<MAX_TERMS;i++){
                String t=a.optString(i,"").trim();
                if(t.length()>=2&&!t.startsWith("__H38_")&&!terms.contains(t))terms.add(t);
            }
        }catch(Exception ignored){}
        if(terms.isEmpty()){
            terms.add("tools");
            terms.add("electronics");
            terms.add("appliances");
            terms.add("lawn mower");
        }
        prepareStore();
        clearFacebookAuthCookies();
        createCollectorWebView();
        loadTerm(0);
    }

    private void prepareStore(){
        try{
            activity.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit()
                .putString(LAST_POSTAL,postal)
                .putString(LAST_STATUS,"SCANNING_PUBLIC")
                .putString(LAST_DIAGNOSTICS,"{\"mode\":\"PUBLIC_ONLY\"}")
                .remove(ROWS)
                .apply();
        }catch(Exception ignored){}
    }

    private void clearFacebookAuthCookies(){
        try{
            CookieManager cm=CookieManager.getInstance();
            String base="https://www.facebook.com/";
            for(String name:new String[]{"c_user","xs","presence"}){
                cm.setCookie(base,name+"=; Max-Age=0; Path=/; Domain=.facebook.com; Secure");
            }
            cm.flush();
        }catch(Exception ignored){}
    }

    private void writeDiagnostics(JSONObject o){
        try{activity.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putString(LAST_DIAGNOSTICS,o==null?"{}":o.toString()).apply();}catch(Exception ignored){}
    }

    private void configureWebView(WebView w){
        w.setBackgroundColor(Color.TRANSPARENT);
        w.setAlpha(1f);
        w.setFocusable(false);
        w.setFocusableInTouchMode(false);
        w.setClickable(false);
        w.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        WebSettings s=w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setLoadsImagesAutomatically(true);
        s.setBlockNetworkImage(false);
        s.setUserAgentString("Mozilla/5.0 (Linux; Android 16; Mobile) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36 H38ScoutPublic/"+BuildConfig.VERSION_NAME);
        CookieManager cm=CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(w,false);
    }

    private static boolean allowedFacebookHost(String host){
        String h=host==null?"":host.toLowerCase(Locale.US);
        return h.equals("facebook.com")||h.endsWith(".facebook.com")||h.equals("fbcdn.net")||h.endsWith(".fbcdn.net");
    }

    private void createCollectorWebView(){
        collector=new WebView(activity);
        configureWebView(collector);
        collector.addJavascriptInterface(new Bridge(),"AndroidH38FacebookBrowser");
        collector.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
                Uri u=req.getUrl();
                return u==null||!allowedFacebookHost(u.getHost());
            }
            @Override public void onPageFinished(WebView view,String url){scheduleCapture(generation);}
        });
        root.addView(collector,0,new FrameLayout.LayoutParams(1080,1920));
    }

    private int coarseRadius(){if(radiusMiles<=25)return 40;if(radiusMiles<=50)return 60;if(radiusMiles<=100)return 100;return 250;}

    private String searchUrl(String term){
        StringBuilder u=new StringBuilder("https://www.facebook.com/marketplace/search/?query=")
            .append(Uri.encode(term))
            .append("&sortBy=creation_time_descend&daysSinceListed=7&deliveryMethod=local_pick_up&exact=false&radius=")
            .append(coarseRadius());
        if(Double.isFinite(lat)&&Double.isFinite(lon)&&!(lat==0d&&lon==0d))u.append("&latitude=").append(lat).append("&longitude=").append(lon);
        return u.toString();
    }

    private static String norm(String v){return v==null?"":v.toLowerCase(Locale.US).replaceAll("[^a-z0-9]","");}
    private static String stateAbbrev(String s){String x=s==null?"":s.trim().toLowerCase(Locale.US);if("minnesota".equals(x))return"mn";if("ohio".equals(x))return"oh";if("wisconsin".equals(x))return"wi";if("michigan".equals(x))return"mi";if("iowa".equals(x))return"ia";if("north dakota".equals(x))return"nd";if("south dakota".equals(x))return"sd";return x.length()==2?x:"";}

    private boolean locationMatches(String value){
        String page=value==null?"":value.trim();
        if(page.isBlank()||postal.isBlank())return false;
        String pageNorm=norm(page);
        for(String proof:postal.split("\\|")){
            proof=proof.trim();if(proof.isBlank())continue;
            if(proof.matches(".*\\d{5}.*")){String zip=proof.replaceAll(".*?(\\d{5}).*","$1");if(page.contains(zip))return true;}
            String[] p=proof.split(",");
            if(p.length>=2){String city=norm(p[0]),state=norm(p[1]),abbr=stateAbbrev(p[1]);if(!city.isBlank()&&pageNorm.contains(city)&&((!state.isBlank()&&pageNorm.contains(state))||(!abbr.isBlank()&&pageNorm.contains(norm(abbr)))))return true;}
            else{String simple=norm(proof);if(simple.length()>=4&&pageNorm.contains(simple))return true;}
        }
        return false;
    }

    private void loadTerm(int index){
        if(index<0||index>=terms.size()){finishPass();return;}
        termIndex=index;currentTerm=terms.get(index);final int g=++generation;scheduledGeneration=-1;
        collector.loadUrl(searchUrl(currentTerm));
        handler.postDelayed(()->{if(g==generation)capturePage();},2600);
    }

    private void scheduleCapture(int g){
        if(g!=generation||scheduledGeneration==g)return;
        scheduledGeneration=g;
        handler.postDelayed(()->{if(g==generation)capturePage();},1400);
        handler.postDelayed(()->{if(g==generation&&collector!=null){try{collector.evaluateJavascript("window.scrollBy(0,Math.max(900,window.innerHeight*.85));",null);}catch(Exception ignored){}capturePage();}},3400);
        handler.postDelayed(()->{if(g==generation&&collector!=null){try{collector.evaluateJavascript("window.scrollBy(0,Math.max(1100,window.innerHeight));",null);}catch(Exception ignored){}capturePage();}},5400);
        handler.postDelayed(()->nextTerm(g),7600);
    }

    private void nextTerm(int g){if(g!=generation)return;int n=termIndex+1;if(n>=terms.size())finishPass();else loadTerm(n);}

    private void finishPass(){
        currentTerm="";generation++;scheduledGeneration=-1;
        String status=totalAccepted>0?"COMPLETE_WITH_ROWS":totalCaptured>0?"COMPLETE_LOCATION_UNPROVEN":publicBlocked?"PUBLIC_BLOCKED":"COMPLETE_EMPTY";
        try{activity.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putString(LAST_STATUS,status).apply();}catch(Exception ignored){}
        stopCollector(false);
        scoutWebView.postDelayed(()->scoutWebView.evaluateJavascript("window.H38ScoutReturned&&window.H38ScoutReturned();",null),120);
    }

    void destroy(){stopCollector(true);}
    private void stopCollector(boolean clearCallbacks){if(clearCallbacks)handler.removeCallbacksAndMessages(null);WebView w=collector;collector=null;if(w!=null){try{root.removeView(w);}catch(Exception ignored){}try{w.stopLoading();w.removeJavascriptInterface("AndroidH38FacebookBrowser");w.removeAllViews();w.destroy();}catch(Exception ignored){}}}

    private void capturePage(){
        if(collector==null)return;
        String script="""
(function(){
 try{
  function textOf(e){return String((e&&e.innerText)||'').replace(/\s+/g,' ').trim()}
  function itemId(v){var s=String(v||''),p=s.indexOf('/marketplace/item/');if(p<0)return'';var tail=s.slice(p+18),id='';for(var i=0;i<tail.length;i++){var c=tail.charAt(i);if(c>='0'&&c<='9')id+=c;else break}return id}
  function cleanUrl(v){var id=itemId(v);return id?'https://www.facebook.com/marketplace/item/'+id:''}
  function price(raw){var s=String(raw||''),m=s.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/);return m?Number(m[1].replace(/,/g,'')):null}
  function distance(raw){var m=String(raw||'').match(/([0-9]+(?:\.[0-9]+)?)\s*(?:mi|miles)\b/i);return m?Number(m[1]):null}
  function goodImage(v){var x=String(v||'');return x.indexOf('https://')===0&&!/(?:logo|favicon|sprite|pixel|tracking|placeholder|blank|spacer)/i.test(x)}
  function pageLocation(){var body=String((document.body&&document.body.innerText)||''),lines=body.split('\n');for(var j=0;j<Math.min(lines.length,260);j++){var line=String(lines[j]||'').trim(),low=line.toLowerCase(),near=low.lastIndexOf(' near ');if(low.indexOf('search results for')>=0&&near>=0){var x=line.substring(near+6).trim();if(x.length>2&&x.length<100)return x}}return''}
  function cardFor(a){var best=a,n=a;for(var up=0;up<10&&n;up++,n=n.parentElement){var raw=textOf(n);if(raw.length>=8&&raw.length<=1200)best=n;if(n.querySelector&&n.querySelector('img')&&raw.length>=16&&raw.length<=900)return n}return best}
  function titleFor(a,card){var aria=String(a&&a.getAttribute&&a.getAttribute('aria-label')||'').trim();if(aria.length>=3&&aria.length<=180&&aria.charAt(0)!=='$')return aria;var imgs=[].slice.call(card&&card.querySelectorAll?card.querySelectorAll('img'):[]);for(var i=0;i<imgs.length;i++){var alt=String(imgs[i].getAttribute('alt')||'').replace(/\s+/g,' ').trim();if(alt.length>=3&&alt.length<=180&&!/^(image|photo|facebook|marketplace)$/i.test(alt))return alt}return'Marketplace listing'}
  function imageFor(card){var imgs=[].slice.call(card&&card.querySelectorAll?card.querySelectorAll('img'):[]);for(var i=0;i<imgs.length;i++){var u=String(imgs[i].currentSrc||imgs[i].src||imgs[i].getAttribute('src')||'');if(goodImage(u))return u}return''}

  var body=String((document.body&&document.body.innerText)||''),html=String((document.documentElement&&document.documentElement.innerHTML)||''),low=body.toLowerCase(),path=String(location.pathname||'').toLowerCase();
  var all=[].slice.call(document.querySelectorAll('a[href]')),anchors=all.filter(function(a){return itemId(String(a.href||a.getAttribute('href')||''))!==''});
  var blocked=!anchors.length&&(low.indexOf('log in to facebook')>=0||low.indexOf('email or phone')>=0||low.indexOf('security check')>=0||low.indexOf('confirm your identity')>=0||path.indexOf('/login')>=0||path.indexOf('/checkpoint')>=0);
  if(blocked){AndroidH38FacebookBrowser.capture(JSON.stringify({public_blocked:true,rows:[],diagnostics:{mode:'PUBLIC_ONLY',reason:'PUBLIC_LOGIN_WALL',anchor_count:all.length,body_chars:body.length,path:path}}));return}

  var seen={},rows=[];
  anchors.forEach(function(a){var href=String(a.href||a.getAttribute('href')||''),id=itemId(href);if(!id||seen[id])return;seen[id]=1;var card=cardFor(a),raw=textOf(card||a);rows.push({id:id,source:'Facebook Marketplace',title:titleFor(a,card||a),text:raw||('Marketplace listing '+id),price:price(raw),url:cleanUrl(href),image_url:imageFor(card||a),distance_miles:distance(raw),captured_at:Date.now(),browser_session:false,public_only:true,capture_method:'PUBLIC_DOM_ANCHOR'})});

  var needle='/marketplace/item/',at=0,htmlHits=0;
  while(rows.length<120&&(at=html.indexOf(needle,at))>=0){htmlHits++;var id=itemId(html.slice(at,at+120));at+=needle.length;if(!id||seen[id])continue;seen[id]=1;var from=Math.max(0,at-500),to=Math.min(html.length,at+900),near=html.slice(from,to).replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();rows.push({id:id,source:'Facebook Marketplace',title:'Marketplace listing '+id,text:near.slice(0,700),price:price(near),url:'https://www.facebook.com/marketplace/item/'+id,image_url:'',distance_miles:distance(near),captured_at:Date.now(),browser_session:false,public_only:true,capture_method:'PUBLIC_HTML_ITEM_URL'})}

  AndroidH38FacebookBrowser.capture(JSON.stringify({public_blocked:false,location_text:pageLocation(),rows:rows,item_urls_seen:rows.length,diagnostics:{mode:'PUBLIC_ONLY',anchor_count:all.length,dom_item_anchors:anchors.length,html_item_hits:htmlHits,body_chars:body.length,html_chars:html.length,path:path,title:String(document.title||'')}}));
 }catch(e){AndroidH38FacebookBrowser.capture(JSON.stringify({error:String(e),rows:[],diagnostics:{mode:'PUBLIC_ONLY',reason:'EXTRACTOR_EXCEPTION',message:String(e)}}))}
})();
""";
        collector.evaluateJavascript(script,null);
    }

    private final class Bridge{
        @JavascriptInterface public void capture(String json){
            activity.runOnUiThread(()->{
                try{
                    JSONObject p=new JSONObject(json==null?"{}":json);
                    JSONObject diagnostics=p.optJSONObject("diagnostics");if(diagnostics!=null)writeDiagnostics(diagnostics);
                    if(p.optBoolean("public_blocked",false)){publicBlocked=true;return;}
                    JSONArray incoming=p.optJSONArray("rows");if(incoming==null)return;
                    String pageLoc=p.optString("location_text","");boolean pageProven=locationMatches(pageLoc);totalCaptured+=incoming.length();JSONArray preserved=new JSONArray();
                    for(int i=0;i<incoming.length();i++){
                        JSONObject x=incoming.optJSONObject(i);if(x==null)continue;
                        double d=x.has("distance_miles")&&!x.isNull("distance_miles")?x.optDouble("distance_miles",Double.NaN):Double.NaN;
                        boolean hasDistance=Double.isFinite(d),distanceProven=hasDistance&&d<=radiusMiles,outsideRadius=hasDistance&&d>radiusMiles,cardProven=locationMatches(x.optString("text","")),verified=!outsideRadius&&(distanceProven||cardProven||pageProven);
                        x.put("distance_verified",distanceProven);x.put("page_location_verified",pageProven);x.put("card_location_verified",cardProven);x.put("location_verified",verified);x.put("facebook_marketplace_location",pageLoc);x.put("public_only",true);x.put("browser_session",false);
                        if(outsideRadius)x.put("location_status","OUTSIDE_RADIUS");else if(distanceProven)x.put("location_status","DISTANCE_VERIFIED");else if(cardProven)x.put("location_status","CARD_LOCATION_VERIFIED");else if(pageProven)x.put("location_status","PAGE_LOCATION_VERIFIED");else x.put("location_status","LOCATION_UNPROVEN");
                        if(verified)totalAccepted++;preserved.put(x);
                    }
                    mergeRows(activity,preserved,currentTerm,postal,radiusMiles,pageLoc);
                }catch(Exception ignored){}
            });
        }
    }

    private static int mergeRows(Context context,JSONArray incoming,String term,String postal,int radius,String locationText){
        if(incoming==null)return 0;
        try{
            SharedPreferences p=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);JSONArray old=new JSONArray(p.getString(ROWS,"[]"));Map<String,JSONObject> merged=new LinkedHashMap<>();Set<String> oldIds=new HashSet<>();
            for(int i=0;i<old.length();i++){JSONObject x=old.optJSONObject(i);if(x==null)continue;String id=x.optString("id",x.optString("url",""));if(id.isBlank())continue;oldIds.add(id);merged.put(id,x);}
            int added=0;Set<String> incomingIds=new HashSet<>();
            for(int i=0;i<incoming.length();i++){JSONObject x=incoming.optJSONObject(i);if(x==null)continue;String id=x.optString("id",x.optString("url",""));if(id.isBlank()||!incomingIds.add(id))continue;x.put("term",term==null?"":term);x.put("captured_at",System.currentTimeMillis());x.put("search_postal",postal==null?"":postal);x.put("search_radius_miles",radius);if(!x.has("facebook_marketplace_location"))x.put("facebook_marketplace_location",locationText==null?"":locationText);if(!oldIds.contains(id))added++;merged.put(id,x);}
            JSONArray save=new JSONArray();List<JSONObject> rows=new ArrayList<>(merged.values());int start=Math.max(0,rows.size()-MAX_ROWS);for(int i=start;i<rows.size();i++)save.put(rows.get(i));p.edit().putString(ROWS,save.toString()).apply();return added;
        }catch(Exception ignored){return 0;}
    }

    static String rowsJson(Context context){
        try{
            SharedPreferences p=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);String raw=p.getString(ROWS,"[]"),postal=p.getString(LAST_POSTAL,""),status=p.getString(LAST_STATUS,""),diagnostics=p.getString(LAST_DIAGNOSTICS,"{}");JSONArray old=new JSONArray(raw),safe=new JSONArray();int captured=0,usable=0,unproven=0,outside=0;
            for(int i=0;i<old.length();i++){JSONObject x=old.optJSONObject(i);if(x==null)continue;if(!postal.isBlank()&&!postal.equals(x.optString("search_postal","")))continue;captured++;if(x.optBoolean("location_verified",false))usable++;else if("OUTSIDE_RADIUS".equals(x.optString("location_status","")))outside++;else unproven++;}
            if(!status.isBlank()){JSONObject marker=new JSONObject();marker.put("h38_system",true);marker.put("status",status);marker.put("mode","PUBLIC_ONLY");marker.put("location_verified",false);marker.put("captured_count",captured);marker.put("usable_count",usable);marker.put("location_unproven_count",unproven);marker.put("outside_radius_count",outside);try{marker.put("diagnostics",new JSONObject(diagnostics));}catch(Exception ignored){}safe.put(marker);}
            for(int i=0;i<old.length();i++){JSONObject x=old.optJSONObject(i);if(x==null)continue;if(postal.isBlank()||postal.equals(x.optString("search_postal","")))safe.put(x);}return safe.toString();
        }catch(Exception ignored){return"[]";}
    }
}
