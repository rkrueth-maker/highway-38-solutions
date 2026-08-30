package com.highway38.resellerscout;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
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

final class FacebookMarketplaceEmbeddedCollector {
    private static final String PREFS="h38_reseller_facebook_browser_v1";
    private static final String ROWS="rows";
    private static final String LAST_POSTAL="last_postal";
    private static final String LAST_STATUS="last_status";
    private static final String LAST_DIAGNOSTICS="last_diagnostics";
    private static final int MAX_ROWS=240;
    private static final int MAX_TERMS=4;
    private static final String CONNECT_TERM="__H38_CONNECT__";

    private final MainActivity activity;
    private final FrameLayout root;
    private final WebView scoutWebView;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final List<String> terms=new ArrayList<>();

    private WebView collector;
    private FrameLayout connectLayer;
    private int termIndex=0;
    private int generation=0;
    private int scheduledGeneration=-1;
    private int totalCaptured=0;
    private int totalAccepted=0;
    private String currentTerm="";
    private String postal="";
    private double lat=Double.NaN;
    private double lon=Double.NaN;
    private int radiusMiles=50;
    private boolean authBlocked=false;

    FacebookMarketplaceEmbeddedCollector(MainActivity activity,FrameLayout root,WebView scoutWebView){
        this.activity=activity;
        this.root=root;
        this.scoutWebView=scoutWebView;
    }

    void start(String termsJson,double lat,double lon,int radius,String postal){
        if(isConnectRequest(termsJson)){
            showConnect();
            return;
        }
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
        this.authBlocked=false;
        this.currentTerm="";
        terms.clear();
        try{
            JSONArray a=new JSONArray(termsJson==null?"[]":termsJson);
            for(int i=0;i<a.length()&&terms.size()<MAX_TERMS;i++){
                String t=a.optString(i,"").trim();
                if(t.length()>=2&&!terms.contains(t))terms.add(t);
            }
        }catch(Exception ignored){}
        if(terms.isEmpty()){
            terms.add("tools");
            terms.add("electronics");
            terms.add("appliances");
            terms.add("lawn mower");
        }
        prepareStore();
        if(!hasFacebookUserCookie()){
            authBlocked=true;
            writeDiagnostics("{\"reason\":\"NO_C_USER_COOKIE\",\"captured\":0}");
            finishPass();
            return;
        }
        createCollectorWebView();
        loadTerm(0);
    }

    private boolean isConnectRequest(String termsJson){
        try{
            JSONArray a=new JSONArray(termsJson==null?"[]":termsJson);
            return a.length()>0&&CONNECT_TERM.equals(a.optString(0,""));
        }catch(Exception ignored){
            return false;
        }
    }

    private void prepareStore(){
        try{
            SharedPreferences p=activity.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
            p.edit()
                .putString(LAST_POSTAL,postal)
                .putString(LAST_STATUS,"SCANNING")
                .putString(LAST_DIAGNOSTICS,"{}")
                .remove(ROWS)
                .apply();
        }catch(Exception ignored){}
    }

    private void writeDiagnostics(String json){
        try{activity.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putString(LAST_DIAGNOSTICS,json==null?"{}":json).apply();}catch(Exception ignored){}
    }

    private void configureWebView(WebView w,boolean visible){
        w.setBackgroundColor(visible?Color.WHITE:Color.TRANSPARENT);
        w.setAlpha(1f);
        w.setFocusable(visible);
        w.setFocusableInTouchMode(visible);
        w.setClickable(visible);
        w.setImportantForAccessibility(visible?View.IMPORTANT_FOR_ACCESSIBILITY_YES:View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        WebSettings s=w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setLoadsImagesAutomatically(true);
        s.setBlockNetworkImage(false);
        CookieManager cm=CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(w,true);
    }

    private static boolean allowedFacebookHost(String host){
        String h=host==null?"":host.toLowerCase(Locale.US);
        return h.equals("facebook.com")||h.endsWith(".facebook.com")||h.equals("fbcdn.net")||h.endsWith(".fbcdn.net");
    }

    private void createCollectorWebView(){
        collector=new WebView(activity);
        configureWebView(collector,false);
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

    private void showConnect(){
        closeConnect(false);
        generation++;
        stopCollector(false);
        connectLayer=new FrameLayout(activity);
        connectLayer.setBackgroundColor(Color.WHITE);
        WebView login=new WebView(activity);
        configureWebView(login,true);
        connectLayer.addView(login,new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT,FrameLayout.LayoutParams.MATCH_PARENT));
        Button close=new Button(activity);
        close.setText("Back to Scout");
        FrameLayout.LayoutParams bp=new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT,FrameLayout.LayoutParams.WRAP_CONTENT);
        bp.gravity=Gravity.TOP|Gravity.END;
        bp.setMargins(16,16,16,16);
        connectLayer.addView(close,bp);
        close.setOnClickListener(v->closeConnect(false));
        login.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){Uri u=req.getUrl();return u==null||!allowedFacebookHost(u.getHost());}
            @Override public void onPageFinished(WebView view,String url){
                String low=url==null?"":url.toLowerCase(Locale.US);
                if(hasFacebookUserCookie()&&!low.contains("/login")&&!low.contains("/checkpoint")){
                    try{CookieManager.getInstance().flush();activity.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putString(LAST_STATUS,"CONNECTED").apply();}catch(Exception ignored){}
                    handler.postDelayed(()->closeConnect(true),400);
                }
            }
        });
        root.addView(connectLayer);
        login.loadUrl("https://www.facebook.com/marketplace/");
    }

    private boolean hasFacebookUserCookie(){
        try{String c=CookieManager.getInstance().getCookie("https://www.facebook.com/");return c!=null&&c.contains("c_user=");}catch(Exception ignored){return false;}
    }

    private void closeConnect(boolean connected){
        FrameLayout layer=connectLayer;connectLayer=null;
        if(layer!=null){
            try{root.removeView(layer);for(int i=0;i<layer.getChildCount();i++){View v=layer.getChildAt(i);if(v instanceof WebView){WebView w=(WebView)v;w.stopLoading();w.destroy();}}}catch(Exception ignored){}
        }
        if(connected){scoutWebView.postDelayed(()->scoutWebView.evaluateJavascript("window.H38FacebookConnected&&window.H38FacebookConnected();",null),150);}
    }

    private int coarseRadius(){if(radiusMiles<=25)return 40;if(radiusMiles<=50)return 60;if(radiusMiles<=100)return 100;return 250;}

    private String searchUrl(String term){
        StringBuilder u=new StringBuilder("https://www.facebook.com/marketplace/search/?query=").append(Uri.encode(term)).append("&sortBy=creation_time_descend&daysSinceListed=7&deliveryMethod=local_pick_up&exact=false&radius=").append(coarseRadius());
        if(Double.isFinite(lat)&&Double.isFinite(lon)&&!(lat==0d&&lon==0d)){u.append("&latitude=").append(lat).append("&longitude=").append(lon);}
        return u.toString();
    }

    private static String norm(String v){return v==null?"":v.toLowerCase(Locale.US).replaceAll("[^a-z0-9]","");}
    private static String stateAbbrev(String s){String x=s==null?"":s.trim().toLowerCase(Locale.US);if("minnesota".equals(x))return"mn";if("ohio".equals(x))return"oh";if("wisconsin".equals(x))return"wi";if("michigan".equals(x))return"mi";if("iowa".equals(x))return"ia";if("north dakota".equals(x))return"nd";if("south dakota".equals(x))return"sd";return x.length()==2?x:"";}

    private boolean locationMatches(String value){
        String page=value==null?"":value.trim();if(page.isBlank()||postal.isBlank())return false;String pageNorm=norm(page);
        for(String proof:postal.split("\\|")){
            proof=proof.trim();if(proof.isBlank())continue;
            if(proof.matches(".*\\d{5}.*")){String zip=proof.replaceAll(".*?(\\d{5}).*","$1");if(page.contains(zip))return true;}
            String[] p=proof.split(",");
            if(p.length>=2){String city=norm(p[0]);String state=norm(p[1]);String abbr=stateAbbrev(p[1]);if(!city.isBlank()&&pageNorm.contains(city)&&((!state.isBlank()&&pageNorm.contains(state))||(!abbr.isBlank()&&pageNorm.contains(norm(abbr)))))return true;}
            else{String simple=norm(proof);if(simple.length()>=4&&pageNorm.contains(simple))return true;}
        }
        return false;
    }

    private void loadTerm(int index){
        if(index<0||index>=terms.size()||authBlocked){finishPass();return;}
        termIndex=index;currentTerm=terms.get(index);final int g=++generation;scheduledGeneration=-1;collector.loadUrl(searchUrl(currentTerm));handler.postDelayed(()->{if(g==generation)capturePage();},2500);
    }

    private void scheduleCapture(int g){
        if(g!=generation||scheduledGeneration==g)return;scheduledGeneration=g;
        handler.postDelayed(()->{if(g==generation)capturePage();},1300);
        handler.postDelayed(()->{if(g==generation&&collector!=null){try{collector.evaluateJavascript("window.scrollBy(0,Math.max(900,window.innerHeight*.85));",null);}catch(Exception ignored){}capturePage();}},3200);
        handler.postDelayed(()->{if(g==generation&&collector!=null){try{collector.evaluateJavascript("window.scrollBy(0,Math.max(1100,window.innerHeight));",null);}catch(Exception ignored){}capturePage();}},5200);
        handler.postDelayed(()->nextTerm(g),7200);
    }

    private void nextTerm(int g){if(g!=generation)return;int n=termIndex+1;if(n>=terms.size())finishPass();else loadTerm(n);}

    private void finishPass(){
        currentTerm="";generation++;scheduledGeneration=-1;String status;
        if(authBlocked)status="AUTH_REQUIRED";else if(totalAccepted>0)status="COMPLETE_WITH_ROWS";else if(totalCaptured>0)status="COMPLETE_LOCATION_UNPROVEN";else status="COMPLETE_EMPTY";
        try{activity.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putString(LAST_STATUS,status).apply();}catch(Exception ignored){}
        stopCollector(false);scoutWebView.postDelayed(()->scoutWebView.evaluateJavascript("window.H38ScoutReturned&&window.H38ScoutReturned();",null),120);
    }

    void destroy(){closeConnect(false);stopCollector(true);}
    private void stopCollector(boolean clearCallbacks){if(clearCallbacks)handler.removeCallbacksAndMessages(null);WebView w=collector;collector=null;if(w!=null){try{root.removeView(w);}catch(Exception ignored){}try{w.stopLoading();w.removeJavascriptInterface("AndroidH38FacebookBrowser");w.removeAllViews();w.destroy();}catch(Exception ignored){}}}

    private void capturePage(){
        if(collector==null)return;
        String script="""
(function(){
 try{
  function T(e){return String((e&&e.innerText)||'').replace(/\\s+/g,' ').trim()}
  function itemId(v){var m=String(v||'').match(/\\/marketplace\\/item\\/(\\d+)/i);return m?m[1]:''}
  function cleanUrl(v){var x=String(v||'').replace(/\\\\u002F/g,'/').replace(/\\\\\//g,'/');var m=x.match(/https?:\\/\\/[^\\s\"']*?\\/marketplace\\/item\\/\\d+/i);if(m)return m[0].split('?')[0].replace(/\\/$/,'');var id=itemId(x);return id?'https://www.facebook.com/marketplace/item/'+id:''}
  function price(raw){var m=String(raw||'').match(/\\$\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)/);return m?Number(m[1].replace(/,/g,'')):null}
  function distance(raw){var m=String(raw||'').match(/([0-9]+(?:\\.[0-9]+)?)\\s*(?:mi|miles)\\b/i);return m?Number(m[1]):null}
  function goodImage(v){var x=String(v||'');return /^https:\\/\\//i.test(x)&&!/(?:logo|favicon|sprite|pixel|tracking|placeholder|blank|spacer)/i.test(x)}
  function pageLocation(){
    var body=String((document.body&&document.body.innerText)||''),lines=body.split('\\n');
    for(var j=0;j<Math.min(lines.length,260);j++){var line=String(lines[j]||'').trim(),low=line.toLowerCase(),near=low.lastIndexOf(' near ');if(low.indexOf('search results for')>=0&&near>=0){var x=line.substring(near+6).trim();if(x.length>2&&x.length<100)return x;}}
    var nodes=[].slice.call(document.querySelectorAll('[aria-label*="location" i],[data-testid*="location" i],button,[role="button"]'));
    for(var i=0;i<nodes.length;i++){var aria=String(nodes[i].getAttribute&&nodes[i].getAttribute('aria-label')||''),x=T(nodes[i]);if(x.length>2&&x.length<100&&x.indexOf('$')<0&&/location|radius|within/i.test(aria))return x;}
    return'';
  }
  function cardFor(a){var best=a,n=a;for(var up=0;up<10&&n;up++,n=n.parentElement){var raw=T(n);if(raw.length>=8&&raw.length<=1200)best=n;if(n.querySelector&&n.querySelector('img')&&raw.length>=16&&raw.length<=900)return n;}return best;}
  function titleFor(a,card){var aria=String(a&&a.getAttribute&&a.getAttribute('aria-label')||'').trim();if(aria.length>=3&&aria.length<=180&&!/^\\$/.test(aria))return aria;var imgs=[].slice.call(card&&card.querySelectorAll?card.querySelectorAll('img'):[]);for(var i=0;i<imgs.length;i++){var alt=String(imgs[i].getAttribute('alt')||'').replace(/\\s+/g,' ').trim();if(alt.length>=3&&alt.length<=180&&!/^(image|photo|facebook|marketplace)$/i.test(alt))return alt;}var nodes=[].slice.call(card&&card.querySelectorAll?card.querySelectorAll('[dir="auto"],span,div'):[]);for(var j=0;j<nodes.length;j++){var x=T(nodes[j]);if(x.length<3||x.length>180||x.charAt(0)==='$'||/\\b(?:mi|miles)\\b/i.test(x)||/^(sponsored|new listing)$/i.test(x))continue;return x;}return'Marketplace listing';}
  function imageFor(card){var imgs=[].slice.call(card&&card.querySelectorAll?card.querySelectorAll('img'):[]);for(var i=0;i<imgs.length;i++){var u=String(imgs[i].currentSrc||imgs[i].src||imgs[i].getAttribute('src')||'');if(goodImage(u))return u;}return'';}

  var body=String((document.body&&document.body.innerText)||''),html=String((document.documentElement&&document.documentElement.innerHTML)||''),low=body.toLowerCase(),path=String(location.pathname||'').toLowerCase();
  var allAnchors=[].slice.call(document.querySelectorAll('a[href]')),anchors=allAnchors.filter(function(a){return /\\/marketplace\\/item\\/\\d+/i.test(String(a.href||a.getAttribute('href')||''))});
  var login=!anchors.length&&(low.indexOf('log in to facebook')>=0||low.indexOf('email or phone')>=0||low.indexOf('security check')>=0||low.indexOf('confirm your identity')>=0||path.indexOf('/login')>=0||path.indexOf('/checkpoint')>=0);
  if(login){AndroidH38FacebookBrowser.capture(JSON.stringify({login_required:true,rows:[],diagnostics:{reason:'LOGIN_PAGE',anchor_count:allAnchors.length,body_chars:body.length}}));return}

  var seen={},rows=[];
  anchors.forEach(function(a){var href=String(a.href||a.getAttribute('href')||''),id=itemId(href);if(!id||seen[id])return;seen[id]=1;var card=cardFor(a),raw=T(card||a);rows.push({id:id,source:'Facebook Marketplace',title:titleFor(a,card||a),text:raw||('Marketplace listing '+id),price:price(raw),url:cleanUrl(href),image_url:imageFor(card||a),distance_miles:distance(raw),captured_at:Date.now(),browser_session:true,capture_method:'DOM_ANCHOR'});});

  var normalizedHtml=html.replace(/\\\\u002F/g,'/').replace(/\\\\\//g,'/'),re=/\\/marketplace\\/item\\/(\\d+)/ig,m,sourceHits=0;
  while((m=re.exec(normalizedHtml))&&sourceHits<300){sourceHits++;var id=m[1];if(seen[id])continue;seen[id]=1;var from=Math.max(0,m.index-600),to=Math.min(normalizedHtml.length,m.index+900),near=normalizedHtml.slice(from,to).replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/\\s+/g,' ').trim();var pm=near.match(/\\$\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)/),im=normalizedHtml.slice(from,to).match(/https:\\/\\/[^\"'<> ]+(?:jpg|jpeg|png|webp)[^\"'<> ]*/i);rows.push({id:id,source:'Facebook Marketplace',title:'Marketplace listing '+id,text:near.slice(0,700),price:pm?Number(pm[1].replace(/,/g,'')):null,url:'https://www.facebook.com/marketplace/item/'+id,image_url:im&&goodImage(im[0])?im[0]:'',distance_miles:distance(near),captured_at:Date.now(),browser_session:true,capture_method:'HTML_ITEM_URL'});if(rows.length>=120)break;}

  AndroidH38FacebookBrowser.capture(JSON.stringify({login_required:false,location_text:pageLocation(),rows:rows,item_urls_seen:rows.length,diagnostics:{anchor_count:allAnchors.length,dom_item_anchors:anchors.length,html_item_hits:sourceHits,body_chars:body.length,html_chars:html.length,path:path,title:String(document.title||'')}}));
 }catch(e){AndroidH38FacebookBrowser.capture(JSON.stringify({error:String(e),rows:[],diagnostics:{reason:'EXTRACTOR_EXCEPTION',message:String(e)}}));}
})();
""";
        collector.evaluateJavascript(script,null);
    }

    private final class Bridge{
        @JavascriptInterface public void capture(String json){
            activity.runOnUiThread(()->{
                try{
                    JSONObject p=new JSONObject(json==null?"{}":json);
                    JSONObject diagnostics=p.optJSONObject("diagnostics");
                    if(diagnostics!=null)writeDiagnostics(diagnostics.toString());
                    if(p.optBoolean("login_required",false)){authBlocked=true;finishPass();return;}
                    JSONArray incoming=p.optJSONArray("rows");if(incoming==null)return;
                    String pageLoc=p.optString("location_text","");boolean pageProven=locationMatches(pageLoc);totalCaptured+=incoming.length();JSONArray preserved=new JSONArray();
                    for(int i=0;i<incoming.length();i++){
                        JSONObject x=incoming.optJSONObject(i);if(x==null)continue;double d=x.has("distance_miles")&&!x.isNull("distance_miles")?x.optDouble("distance_miles",Double.NaN):Double.NaN;boolean hasDistance=Double.isFinite(d);boolean distanceProven=hasDistance&&d<=radiusMiles;boolean outsideRadius=hasDistance&&d>radiusMiles;boolean cardProven=locationMatches(x.optString("text",""));boolean verified=!outsideRadius&&(distanceProven||cardProven||pageProven);
                        x.put("distance_verified",distanceProven);x.put("page_location_verified",pageProven);x.put("card_location_verified",cardProven);x.put("location_verified",verified);x.put("facebook_marketplace_location",pageLoc);
                        if(outsideRadius)x.put("location_status","OUTSIDE_RADIUS");else if(distanceProven)x.put("location_status","DISTANCE_VERIFIED");else if(cardProven)x.put("location_status","CARD_LOCATION_VERIFIED");else if(pageProven)x.put("location_status","PAGE_LOCATION_VERIFIED");else x.put("location_status","LOCATION_UNPROVEN");if(verified)totalAccepted++;preserved.put(x);
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
            if(!status.isBlank()){JSONObject marker=new JSONObject();marker.put("h38_system",true);marker.put("status",status);marker.put("location_verified",false);marker.put("captured_count",captured);marker.put("usable_count",usable);marker.put("location_unproven_count",unproven);marker.put("outside_radius_count",outside);try{marker.put("diagnostics",new JSONObject(diagnostics));}catch(Exception ignored){}safe.put(marker);}
            for(int i=0;i<old.length();i++){JSONObject x=old.optJSONObject(i);if(x==null)continue;if(postal.isBlank()||postal.equals(x.optString("search_postal","")))safe.put(x);}return safe.toString();
        }catch(Exception ignored){return"[]";}
    }
}
