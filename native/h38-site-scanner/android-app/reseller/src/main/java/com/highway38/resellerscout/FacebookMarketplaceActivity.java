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
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Device-side authenticated Marketplace browser. Facebook auth remains entirely inside this WebView session. */
public final class FacebookMarketplaceActivity extends Activity {
    public static final String EXTRA_TERMS="terms",EXTRA_LAT="lat",EXTRA_LON="lon",EXTRA_RADIUS="radius",EXTRA_POSTAL="postal",EXTRA_URL="url";
    private static final String PREFS="h38_reseller_facebook_browser_v1",ROWS="rows",LAST_POSTAL="last_postal";
    private static final int MAX_ROWS=240,MAX_TERMS=6;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final List<String> terms=new ArrayList<>();
    private WebView webView;
    private TextView status;
    private int termIndex=0,generation=0,totalNew=0;
    private String currentTerm="",postal="";
    private double lat=Double.NaN,lon=Double.NaN;
    private int radiusMiles=50;
    private boolean locationFixing=false,authWaiting=false;

    @Override protected void onCreate(Bundle state){
        super.onCreate(state);
        readIntent();
        prepareCandidateStore();
        buildUi();
        String direct=getIntent().getStringExtra(EXTRA_URL);
        if(direct!=null&&direct.startsWith("https://www.facebook.com/marketplace/")){
            status.setText("Opening captured Marketplace listing in this Scout Facebook session.");
            webView.loadUrl(direct);
        }else startSearchCycle();
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
            terms.add("electronics");terms.add("appliances");terms.add("furniture");terms.add("tools");terms.add("lawn mower");terms.add("collectibles");
        }
    }

    private void prepareCandidateStore(){
        try{
            SharedPreferences p=getSharedPreferences(PREFS,MODE_PRIVATE);
            String old=p.getString(LAST_POSTAL,"");
            if(!postal.isBlank()&&!postal.equals(old))p.edit().remove(ROWS).putString(LAST_POSTAL,postal).apply();
            else if(!postal.isBlank())p.edit().putString(LAST_POSTAL,postal).apply();
        }catch(Exception ignored){}
    }

    private int coarseFacebookRadius(){if(radiusMiles<=25)return 40;if(radiusMiles<=50)return 60;if(radiusMiles<=100)return 100;return 250;}
    private String desiredLocation(){return "55744".equals(postal)?"Grand Rapids, MN":postal;}
    private boolean strictLocationRequired(){return "55744".equals(postal);}
    private static boolean isGrandRapidsMn(String value){
        String x=value==null?"":value.trim().toLowerCase();
        return x.contains("grand rapids")&&(x.contains(", mn")||x.contains(" minnesota")||x.contains("55744"));
    }

    private void buildUi(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Color.WHITE);
        status=new TextView(this);status.setPadding(18,14,18,14);status.setTextSize(13f);status.setText("Starting Facebook Marketplace pass…");
        root.addView(status,new LinearLayout.LayoutParams(-1,-2));
        LinearLayout buttons=new LinearLayout(this);buttons.setOrientation(LinearLayout.HORIZONTAL);buttons.setPadding(12,0,12,8);
        Button back=new Button(this);back.setText("Back to Scout");back.setOnClickListener(v->finish());
        Button capture=new Button(this);capture.setText("Capture now");capture.setOnClickListener(v->captureVisible(false,true));
        buttons.addView(back,new LinearLayout.LayoutParams(0,-2,1f));buttons.addView(capture,new LinearLayout.LayoutParams(0,-2,1f));root.addView(buttons);
        webView=new WebView(this);
        WebSettings s=webView.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setDatabaseEnabled(true);s.setMediaPlaybackRequiresUserGesture(true);
        s.setUserAgentString(s.getUserAgentString()+" H38ResellerScoutMarketplace/2.2.1");
        CookieManager cm=CookieManager.getInstance();cm.setAcceptCookie(true);cm.setAcceptThirdPartyCookies(webView,true);
        webView.addJavascriptInterface(new BrowserBridge(),"AndroidH38FacebookBrowser");
        webView.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
                Uri u=req.getUrl();if(u==null)return false;String host=String.valueOf(u.getHost()).toLowerCase();
                if(host.endsWith("facebook.com")||host.endsWith("fbcdn.net"))return false;
                try{startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ignored){}return true;
            }
            @Override public void onPageFinished(WebView view,String url){super.onPageFinished(view,url);scheduleCurrentPage(generation);}
        });
        root.addView(webView,new LinearLayout.LayoutParams(-1,0,1f));setContentView(root);
    }

    private String searchUrl(String term){
        StringBuilder u=new StringBuilder("https://www.facebook.com/marketplace/search/?query=").append(Uri.encode(term))
                .append("&sortBy=creation_time_descend&daysSinceListed=7&deliveryMethod=local_pick_up&exact=false&radius=").append(coarseFacebookRadius());
        if(Double.isFinite(lat)&&Double.isFinite(lon))u.append("&latitude=").append(lat).append("&longitude=").append(lon);
        return u.toString();
    }

    private void startSearchCycle(){termIndex=0;loadTerm(0);}
    private void loadTerm(int index){
        if(index<0||index>=terms.size()){finishPass();return;}
        termIndex=index;currentTerm=terms.get(index);generation++;locationFixing=false;authWaiting=false;
        String where=postal.isBlank()?"your selected Scout area":"ZIP "+postal;
        status.setText("Scout is scanning Facebook "+(index+1)+"/"+terms.size()+" · "+currentTerm+" · "+where+"\nFacebook may overfetch to "+coarseFacebookRadius()+" mi; Scout still enforces your strict "+radiusMiles+" mi verification radius.");
        webView.loadUrl(searchUrl(currentTerm));
    }

    private void scheduleCurrentPage(int g){
        handler.postDelayed(()->{if(g==generation)captureVisible(true,true);},1800);
        handler.postDelayed(()->{if(g==generation)captureVisible(true,false);},3800);
        handler.postDelayed(()->{if(g==generation){try{webView.evaluateJavascript("window.scrollBy(0,Math.max(650,window.innerHeight*.75));",null);}catch(Exception ignored){}captureVisible(true,false);}},5900);
        handler.postDelayed(()->advanceWhenReady(g),9000);
    }

    private void advanceWhenReady(int g){
        if(g!=generation||currentTerm.isEmpty())return;
        if(authWaiting){
            status.setText("Facebook sign-in/security check is still open. Scout will resume this same search automatically when it clears.");
            handler.postDelayed(()->advanceWhenReady(g),3000);return;
        }
        if(locationFixing){
            status.setText("Scout is setting Facebook Marketplace to "+desiredLocation()+". Wrong-area cards are being withheld.");
            handler.postDelayed(()->{if(g==generation){captureVisible(true,true);advanceWhenReady(g);}},3000);return;
        }
        nextTerm();
    }

    private void resumeCurrentTermAfterAuth(){
        if(currentTerm.isEmpty())return;
        final int g=++generation;authWaiting=false;locationFixing=false;
        status.setText("Facebook sign-in complete. Resuming "+currentTerm+" automatically in "+desiredLocation()+"…");
        handler.postDelayed(()->{if(g==generation&&!currentTerm.isEmpty())webView.loadUrl(searchUrl(currentTerm));},450);
    }

    private void nextTerm(){if(currentTerm.isEmpty())return;int n=termIndex+1;if(n>=terms.size())finishPass();else loadTerm(n);}
    private void finishPass(){
        currentTerm="";generation++;authWaiting=false;locationFixing=false;
        status.setText("Facebook pass complete · "+totalNew+" new verified listing"+(totalNew==1?"":"s")+" captured. Returning to Scout to rank results…");
        handler.postDelayed(this::finish,1400);
    }

    private void captureVisible(boolean automatic,boolean steerLocation){
        if(webView==null)return;
        final String desired=desiredLocation();
        final String expectedCity="55744".equals(postal)?"Grand Rapids":"";
        String script="""
(function(){
 try{
  var desired=%s, expectedCity=%s, shouldSteer=%s;
  function T(e){return String((e&&e.innerText)||'').trim()}
  function itemId(v){var key='/marketplace/item/',p=String(v||'').toLowerCase().indexOf(key);if(p<0)return'';var s=String(v).substring(p+key.length),out='';for(var i=0;i<s.length;i++){var c=s.charAt(i);if(c>='0'&&c<='9')out+=c;else break}return out}
  function hrefOf(e){
    var n=e;
    for(var up=0;up<5&&n;up++,n=n.parentElement){
      var vals=[];try{vals.push(n.href,n.getAttribute&&n.getAttribute('href'),n.getAttribute&&n.getAttribute('data-href'))}catch(_){}
      try{n.querySelectorAll&&n.querySelectorAll('a[href],a[data-href]').forEach(function(a){vals.push(a.href,a.getAttribute('href'),a.getAttribute('data-href'))})}catch(_){}
      for(var i=0;i<vals.length;i++){var v=String(vals[i]||'');if(itemId(v)){try{return new URL(v,location.origin).toString().split('?')[0]}catch(_){return v.split('?')[0]}}}
    }
    return'';
  }
  function currentMarketplaceLocation(){
    var body=String((document.body&&document.body.innerText)||''),lines=body.split(String.fromCharCode(10));
    for(var j=0;j<Math.min(lines.length,100);j++){var line=String(lines[j]||'').trim(),low=line.toLowerCase(),near=low.lastIndexOf(' near ');if(low.indexOf('search results for')>=0&&near>=0){var x=line.substring(near+6).trim();if(x.length>2&&x.length<100)return x}}
    var nodes=[].slice.call(document.querySelectorAll('button,a,[role="button"]')).filter(function(e){var r=e.getBoundingClientRect();return r.top>=0&&r.top<420});
    for(var i=0;i<nodes.length;i++){var x=T(nodes[i]);if(x.length>3&&x.length<85&&x.indexOf(',')>1&&x.indexOf('$')<0)return x}
    return'';
  }
  function locationMatches(loc){var low=String(loc||'').toLowerCase();if(!expectedCity)return true;return low.indexOf('grand rapids')>=0&&(low.indexOf(', mn')>=0||low.indexOf(' minnesota')>=0||low.indexOf('55744')>=0)}
  function priceFrom(raw){var p=raw.indexOf('$');if(p<0)return null;var out='';for(var i=p+1;i<Math.min(raw.length,p+18);i++){var c=raw.charAt(i);if((c>='0'&&c<='9')||c==='.'||c===',')out+=c;else if(out.length)break}var n=Number(out.split(',').join(''));return Number.isFinite(n)?n:null}
  function distanceFrom(raw){var low=raw.toLowerCase(),p=low.indexOf(' miles');if(p<0)p=low.indexOf(' mi');if(p<0)return null;var out='';for(var i=p-1;i>=0&&i>p-12;i--){var c=raw.charAt(i);if((c>='0'&&c<='9')||c==='.')out=c+out;else if(out.length)break}var n=Number(out);return Number.isFinite(n)?n:null}
  function scan(){
    var body=(document.body&&document.body.innerText)||'',lowBody=String(body).toLowerCase(),path=String(location.pathname||'').toLowerCase();
    var hasItems=!!document.querySelector('a[href*="/marketplace/item/"]');
    var login=((lowBody.indexOf('log in to facebook')>=0||lowBody.indexOf('email or phone')>=0||lowBody.indexOf('create new account')>=0||lowBody.indexOf('security check')>=0||lowBody.indexOf('confirm your identity')>=0||path.indexOf('/login')>=0||path.indexOf('/checkpoint')>=0)&&!hasItems);
    if(login){AndroidH38FacebookBrowser.capture(JSON.stringify({login_required:true,url:location.href,rows:[]}));return}
    var rows=[],seen=new Set(),nodes=[].slice.call(document.querySelectorAll('a[href],[role="link"],[data-href]')),urlsSeen=0;
    nodes.forEach(function(el){
      var href=hrefOf(el),id=itemId(href);if(!href||!id||seen.has(id))return;seen.add(id);urlsSeen++;
      var node=el;for(var i=0;i<7&&node;i++){var raw0=T(node);if(raw0.length>=18&&raw0.length<=1400&&(node.querySelector&&node.querySelector('img')))break;node=node.parentElement}
      var raw=T(node||el);if(raw.length<4)return;
      var price=priceFrom(raw),dist=distanceFrom(raw),lines=String((node&&node.innerText)||el.innerText||'').split(String.fromCharCode(10)),title='';
      for(var j=0;j<lines.length;j++){var x=String(lines[j]||'').trim(),lx=x.toLowerCase();if(!x||x.charAt(0)==='$'||lx==='listed'||lx==='sponsored'||lx==='ships'||lx==='delivery'||lx==='local pickup'||lx==='results'||lx==='filter'||lx==='filters'||lx==='sort'||lx.indexOf(' mi away')>=0||lx.indexOf(' miles away')>=0)continue;if(x.length>=3&&x.length<=160){title=x;break}}
      if(!title)title=String(el.getAttribute&&el.getAttribute('aria-label')||el.textContent||'Marketplace listing').trim().slice(0,160);
      var img=(node&&node.querySelector&&node.querySelector('img'))||(el.querySelector&&el.querySelector('img')),im=img?String(img.currentSrc||img.src||''):'';
      rows.push({id:id,source:'Facebook Marketplace',title:title,text:raw,price:price,url:href,image_url:im,distance_miles:dist,location_label:'',captured_at:Date.now(),browser_session:true});
    });
    var loc=currentMarketplaceLocation(),ok=locationMatches(loc);
    AndroidH38FacebookBrowser.capture(JSON.stringify({login_required:false,url:location.href,rows:rows,item_urls_seen:urlsSeen,location_text:loc,location_ok:ok}));
  }
  function steer(){
    if(!shouldSteer||!expectedCity)return false;
    var loc=currentMarketplaceLocation();if(locationMatches(loc))return false;
    var clickables=[].slice.call(document.querySelectorAll('button,a,[role="button"]')),target=null;
    for(var i=0;i<clickables.length;i++){
      var x=T(clickables[i]),r=clickables[i].getBoundingClientRect(),aria=String(clickables[i].getAttribute&&clickables[i].getAttribute('aria-label')||'').toLowerCase();
      if(r.top<560&&((loc&&x.indexOf(loc)>=0)||aria.indexOf('location')>=0)){target=clickables[i];break}
    }
    if(!target&&loc){var first=loc.split(',')[0].trim().toLowerCase();target=clickables.find(function(e){return T(e).toLowerCase().indexOf(first)>=0})||null}
    if(!target)return false;
    target.click();AndroidH38FacebookBrowser.capture(JSON.stringify({rows:[],location_fixing:true,location_text:loc,location_ok:false}));
    setTimeout(function(){
      var inp=document.querySelector('[role="dialog"] input[placeholder*="location" i],[role="dialog"] input[aria-label*="location" i],input[placeholder*="location" i],input[aria-label*="location" i]');if(!inp)return;
      try{var setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(inp,desired)}catch(_){inp.value=desired}
      inp.dispatchEvent(new Event('input',{bubbles:true}));inp.dispatchEvent(new Event('change',{bubbles:true}));
      setTimeout(function(){
        var opts=[].slice.call(document.querySelectorAll('[role="dialog"] [role="option"],[role="dialog"] [role="button"],[role="dialog"] li,[role="dialog"] a'));
        var city=expectedCity.toLowerCase();
        var pick=opts.find(function(e){var x=T(e).toLowerCase();return x.indexOf(city)>=0&&(x.indexOf('mn')>=0||x.indexOf('minnesota')>=0||x.indexOf('55744')>=0)});
        if(pick)pick.click();
      },1100);
    },500);
    return true;
  }
  if(!window.__h38MarketplaceObserver&&document.body){
    window.__h38MarketplaceObserver=new MutationObserver(function(){clearTimeout(window.__h38MarketplaceTimer);window.__h38MarketplaceTimer=setTimeout(scan,900)});
    window.__h38MarketplaceObserver.observe(document.body,{childList:true,subtree:true});
  }
  if(!steer())scan();else setTimeout(scan,2800);
 }catch(e){AndroidH38FacebookBrowser.capture(JSON.stringify({error:String(e),rows:[]}));}
})();
""".formatted(JSONObject.quote(desired),JSONObject.quote(expectedCity),steerLocation?"true":"false");
        webView.evaluateJavascript(script,null);
        if(!automatic)status.setText("Capturing visible Marketplace cards and verifying the "+desired+" search area…");
    }

    private final class BrowserBridge{
        @JavascriptInterface public void capture(String json){runOnUiThread(()->{
            try{
                JSONObject p=new JSONObject(json==null?"{}":json);
                if(p.optBoolean("login_required",false)){
                    if(!authWaiting){authWaiting=true;generation++;}
                    status.setText("Facebook needs sign-in or a security check. Complete it here; Scout will resume this same search automatically afterward.");
                    return;
                }
                if(authWaiting){resumeCurrentTermAfterAuth();return;}
                if(p.optBoolean("location_fixing",false)){
                    locationFixing=true;
                    status.setText("Scout found Facebook on "+p.optString("location_text","the wrong area")+" and is switching Marketplace to "+desiredLocation()+". Wrong-area cards are withheld.");
                    return;
                }
                boolean locationOk=!strictLocationRequired()||p.optBoolean("location_ok",false);
                String loc=p.optString("location_text","");
                if(strictLocationRequired()&&(!locationOk||!isGrandRapidsMn(loc))){
                    locationFixing=true;
                    status.setText("Facebook Marketplace location is not yet verified as Grand Rapids, MN"+(loc.isBlank()?"":" (currently "+loc+")")+". Scout is withholding these cards and retrying location automatically.");
                    final int g=generation;handler.postDelayed(()->{if(g==generation&&!authWaiting)captureVisible(true,true);},1300);
                    return;
                }
                locationFixing=false;
                JSONArray a=p.optJSONArray("rows");
                int newCount=mergeRows(FacebookMarketplaceActivity.this,a,currentTerm,postal,radiusMiles,loc,true);totalNew+=newCount;
                int seen=p.optInt("item_urls_seen",0);
                if(newCount>0)status.setText("Captured "+newCount+" new verified Marketplace listing"+(newCount==1?"":"s")+" for "+currentTerm+(loc.isBlank()?"":" · "+loc)+". Scout will continue automatically.");
                else if(p.has("error"))status.setText("Marketplace capture error: "+p.optString("error"));
                else if(seen>0)status.setText("Marketplace cards are readable ("+seen+" item links seen). No new unique verified cards this pass"+(loc.isBlank()?"":" · "+loc)+".");
                else status.setText("Facebook rendered no readable Marketplace item links yet"+(loc.isBlank()?"":" · "+loc)+". Scout will retry while this category loads.");
            }catch(Exception e){status.setText("Marketplace capture error: "+e.getMessage());}
        });}
    }

    private static int mergeRows(Context context,JSONArray incoming,String term,String postal,int radius,String locationText,boolean locationVerified){
        if(incoming==null)return 0;
        try{
            SharedPreferences p=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
            JSONArray old=new JSONArray(p.getString(ROWS,"[]"));Map<String,JSONObject> merged=new LinkedHashMap<>();Set<String> oldIds=new HashSet<>();
            for(int i=0;i<old.length();i++){
                JSONObject x=old.optJSONObject(i);if(x==null)continue;String id=x.optString("id",x.optString("url",""));if(id.isBlank())continue;oldIds.add(id);merged.put(id,x);
            }
            int added=0;Set<String> incomingIds=new HashSet<>();
            for(int i=0;i<incoming.length();i++){
                JSONObject x=incoming.optJSONObject(i);if(x==null)continue;String id=x.optString("id",x.optString("url",""));if(id.isBlank()||!incomingIds.add(id))continue;
                x.put("term",term==null?"":term);x.put("captured_at",System.currentTimeMillis());x.put("search_postal",postal==null?"":postal);x.put("search_radius_miles",radius);x.put("facebook_marketplace_location",locationText==null?"":locationText);x.put("location_verified",locationVerified);
                if(!oldIds.contains(id))added++;merged.put(id,x);
            }
            JSONArray save=new JSONArray();List<JSONObject> rows=new ArrayList<>(merged.values());
            for(int i=rows.size()-1,n=0;i>=0&&n<MAX_ROWS;i--,n++)save.put(rows.get(i));
            p.edit().putString(ROWS,save.toString()).apply();return added;
        }catch(Exception ignored){return 0;}
    }

    public static String rowsJson(Context context){
        try{
            SharedPreferences p=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);String raw=p.getString(ROWS,"[]"),postal=p.getString(LAST_POSTAL,"");
            if(!"55744".equals(postal))return raw;
            JSONArray old=new JSONArray(raw),safe=new JSONArray();
            for(int i=0;i<old.length();i++){
                JSONObject x=old.optJSONObject(i);if(x==null||!x.optBoolean("location_verified",false))continue;
                if(isGrandRapidsMn(x.optString("facebook_marketplace_location","")))safe.put(x);
            }
            return safe.toString();
        }catch(Exception ignored){return"[]";}
    }
}
