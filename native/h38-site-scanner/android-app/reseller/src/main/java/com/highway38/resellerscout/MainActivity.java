package com.highway38.resellerscout;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

public final class MainActivity extends Activity {
    private static final String APP_BASE_URL =
            "https://highway38solutions.com/commercial-app/reseller-owner-test/";
    private static final int REQUEST_LOCATION = 3901;

    private static final String LAST_RADIUS_KEY = "h38_reseller_last_radius_v1";
    private static final String STORE_OPEN_PATCH_MARKER = "KEEP_STORE_OPEN_ON_SHOW_ALL_V1";
    private static final String DEEP_DISCOUNT_MARKER = "DEEP_DISCOUNT_FIRST_OVER_50_V1";
    private static final String PENNY_AUTO_QTY_MARKER = "PENNY_AUTO_STORE_QTY_V1";
    private static final String HOME_DEPOT_PRICE_MARKER = "HOME_DEPOT_STORE_PRICE_LOCAL_PENNY_V1";
    private static final String HAMMER_LOOP_FIX_MARKER = "HAMMER_MUTATION_LOOP_FIXED_V1";
    private static final String FLOW_POLISH_MARKER = "BROWSE_NONBLOCKING_SEARCH_V1";
    private static final String AUTO_CHECK_LIMIT_MARKER = "AUTO_CHECK_HOME_DEPOT_TOP5_V1";
    private static final String REOPEN_RETENTION_MARKER = "REOPEN_RETENTION_STORE_MERGE_V1";
    private static final String ALL_STORES_MARKER = "ALL_STORES_PARTS_LM_V1";
    private static final String STOCK_RESULT_RETENTION_MARKER = "STOCK_RESULT_RETENTION_V1";
    private static final String TRUTHFUL_STOCK_MARKER = "PENNY_STOCK_NOT_SHOWN_RETAIL_NOT_CHECKED_V1";
    private static final String LIST_CLEANUP_MARKER = "STRICT_PRICED_ITEMS_OR_ONE_SALE_LIST_V1";
    private static final String STOCK_UI_MARKER = "LOCAL_STOCK_DISPLAY_V1";

    private static final String STORE_FETCH_GUARD = """
            <script>
            (function(){
              'use strict';
              var rawFetch=window.fetch.bind(window),inflight=new Map(),lastGood=new Map(),lastGoodAt=new Map(),servedPersisted=new Set();
              var STORE='/functions/v1/reseller-nearby-stores',LEADS='/functions/v1/reseller-auto-leads';
              var STORE_KEY='h38_reseller_last_store_response_v1',LEADS_KEY='h38_reseller_last_leads_response_v1',RADIUS_KEY='h38_reseller_last_radius_v1';

              function urlOf(input){return typeof input==='string'?input:(input&&input.url)||'';}
              function kindOf(url){if(url.indexOf(STORE)>=0)return 'store';if(url.indexOf(LEADS)>=0)return 'leads';return '';}
              function cacheKey(kind){return kind==='store'?STORE_KEY:LEADS_KEY;}
              function responseOf(s){return new Response(s.body,{status:s.status,statusText:s.statusText,headers:s.headers});}
              async function snap(r){return {body:await r.text(),status:r.status,statusText:r.statusText,headers:Array.from(r.headers.entries())};}
              function count(kind,s){try{var p=JSON.parse(s.body),a=kind==='store'?p.stores:p.leads;return Array.isArray(a)?a.length:0;}catch(e){return 0;}}
              function bodyJson(raw){try{return JSON.parse(String(raw||'{}'));}catch(e){return {};}}
              function sameArea(previousBody,init){
                try{
                  var a=bodyJson(previousBody),b=bodyJson((init&&init.body)||'{}');
                  if(String(Number(a.radiusMiles||50))!==String(Number(b.radiusMiles||50)))return false;
                  var alat=Number(a.lat),alon=Number(a.lon),blat=Number(b.lat),blon=Number(b.lon);
                  if(![alat,alon,blat,blon].every(Number.isFinite))return false;
                  return Math.abs(alat-blat)<=0.08&&Math.abs(alon-blon)<=0.12;
                }catch(e){return false;}
              }
              function storeIdentity(x){return String(x.store_key||[x.retailer||x.store_name||'',x.store_address||'',Number(x.lat||0).toFixed(4),Number(x.lon||0).toFixed(4)].join('|'));}
              function mergeStoreSnap(s,init){
                try{
                  var raw=localStorage.getItem(STORE_KEY);if(!raw)return s;
                  var old=JSON.parse(raw);if(!old||Date.now()-Number(old.at||0)>86400000||!sameArea(old.requestBody,init))return s;
                  var current=JSON.parse(s.body),previous=JSON.parse(old.body);
                  if(!Array.isArray(current.stores)||!Array.isArray(previous.stores))return s;
                  var merged=new Map();
                  previous.stores.forEach(function(x){merged.set(storeIdentity(x),x);});
                  current.stores.forEach(function(x){merged.set(storeIdentity(x),x);});
                  current.stores=Array.from(merged.values()).sort(function(a,b){return Number(a.distance_miles||9999)-Number(b.distance_miles||9999);});
                  current.merged_previous=true;s.body=JSON.stringify(current);
                }catch(e){}
                return s;
              }
              function markPersisted(kind,s){
                try{
                  var p=JSON.parse(s.body);p.cached=true;p.persisted=true;
                  if(kind==='store'){p.stale=true;p.warning='Showing your last nearby-store list while H38 refreshes it.';}
                  s.body=JSON.stringify(p);
                }catch(e){}
                return s;
              }
              function savePersistent(kind,s,init){
                try{
                  if(kind==='store')s=mergeStoreSnap(s,init);
                  if(count(kind,s)<=0)return;
                  var copy={body:s.body,status:s.status,statusText:s.statusText,headers:s.headers,at:Date.now(),requestBody:String((init&&init.body)||'')};
                  localStorage.setItem(cacheKey(kind),JSON.stringify(copy));
                  if(kind==='store'){
                    try{
                      var q=JSON.parse(copy.requestBody||'{}'),r=String(Number(q.radiusMiles||50));
                      if(['25','50','100','150'].indexOf(r)>=0)localStorage.setItem(RADIUS_KEY,r);
                    }catch(e){}
                  }
                }catch(e){}
              }
              function loadPersistent(kind,init){
                try{
                  var raw=localStorage.getItem(cacheKey(kind));if(!raw)return null;
                  var s=JSON.parse(raw);if(!s||!s.body)return null;
                  if(kind==='store'&&!sameArea(s.requestBody,init))return null;
                  return markPersisted(kind,s);
                }catch(e){return null;}
              }
              function setBusy(v){['refreshStores','refreshTop'].forEach(function(id){var b=document.getElementById(id);if(b)b.disabled=v;});}

              window.fetch=async function(input,init){
                var url=urlOf(input),kind=kindOf(url);if(!kind)return rawFetch(input,init);
                var persisted=loadPersistent(kind,init);

                if(!servedPersisted.has(kind)&&persisted){
                  servedPersisted.add(kind);
                  rawFetch(input,init).then(async function(r){
                    var s=await snap(r);if(kind==='store'&&r.ok&&count(kind,s)>0)s=mergeStoreSnap(s,init);if(r.ok&&count(kind,s)>0)savePersistent(kind,s,init);
                  }).catch(function(){});
                  return responseOf(persisted);
                }

                var key=kind+'|'+String((init&&init.body)||url),good=lastGood.get(key),age=Date.now()-(lastGoodAt.get(key)||0);
                if(good&&age<10000)return responseOf(good);
                if(inflight.has(key))return responseOf(await inflight.get(key));
                setBusy(true);

                var work=(async function(){
                  try{
                    var r=await rawFetch(input,init),s=await snap(r);
                    if(kind==='store'&&r.ok&&count(kind,s)>0)s=mergeStoreSnap(s,init);
                    var c=count(kind,s),prior=lastGood.get(key)||loadPersistent(kind,init);
                    if(r.ok&&c>0){lastGood.set(key,s);lastGoodAt.set(key,Date.now());savePersistent(kind,s,init);return s;}
                    if(prior)return prior;
                    return s;
                  }catch(e){
                    var prior=lastGood.get(key)||loadPersistent(kind,init);
                    if(prior)return prior;
                    throw e;
                  }
                })();

                inflight.set(key,work);
                try{return responseOf(await work);}
                finally{inflight.delete(key);if(inflight.size===0)setBusy(false);}
              };
            })();
            </script>
            """;

    private static final String RADIUS_BOOTSTRAP = """
            <script>
            (function(){
              try{
                var r=localStorage.getItem('h38_reseller_last_radius_v1')||'50';
                var e=document.getElementById('radius');
                if(e&&['25','50','100','150'].indexOf(r)>=0)e.value=r;
              }catch(x){
                var e=document.getElementById('radius');if(e)e.value='50';
              }
            })();
            </script>
            """;

    private static final String STOCK_RUNTIME = """
            <script>
            (function(){
              'use strict';
              var STOCK='/functions/v1/reseller-stock-check';
              var baseFetch=window.fetch.bind(window);
              function loadStockResults(){try{return new Map(Object.entries(JSON.parse(localStorage.getItem('h38_reseller_stock_results_v1')||'{}')))}catch(e){return new Map()}}
              function persistStockResults(){try{localStorage.setItem('h38_reseller_stock_results_v1',JSON.stringify(Object.fromEntries(results)))}catch(e){}}
              var results=loadStockResults(),pending=new Set(),sigToId=new Map(),queued=new Set();

              function norm(v){return String(v||'').trim().toLowerCase().replace(/\\s+/g,' ');}
              function sig(x){return [String(x.store_key||''),norm(x.title),String(x.upc||'').replace(/\\D/g,''),norm(x.sku)].join('|');}
              function detailsFor(sk){return Array.from(document.querySelectorAll('details[data-store-key]')).find(function(d){return d.dataset.storeKey===sk;})||null;}
              function itemFromLead(lead,sk){
                var t=lead.querySelector('.lead-title'),txt=lead.textContent||'';
                var u=txt.match(/UPC\\s+(\\d+)/i),s=txt.match(/Model\\/SKU\\s+([^·\\n]+)/i);
                return {store_key:sk,title:t?t.textContent.trim():'',upc:u?u[1]:'',sku:s?s[1].trim():''};
              }
              function remember(b){
                var d=b.closest('details[data-store-key]'),lead=b.closest('.lead');
                if(!d||!lead)return '';
                var id=b.dataset.stock||'',x=itemFromLead(lead,d.dataset.storeKey||'');
                if(id)sigToId.set(sig(x),id);
                return id;
              }
              function qty(p){
                if(!p)return 'Not checked';
                var raw=p.stock_count;
                if(raw!==null&&raw!==undefined&&raw!==''&&Number.isFinite(Number(raw)))return String(Number(raw));
                var st=String(p.stock_status||'').toLowerCase();
                if(st==='out_of_stock')return 'OUT';
                if(st==='in_stock')return 'IN';
                if(p.status==='retailer_blocked')return 'Blocked';
                if(p.status==='check_failed')return 'Unavailable';
                if(p.status==='store_not_resolved')return 'No store match';
                if(p.stock_checked&&p.store_bound)return 'Qty not exposed';
                if(p.stock_checked)return 'Unavailable';
                return 'Not checked';
              }
              function price(p){
                if(!p)return 'Not checked';
                var raw=p.current_price,n=Number(raw);
                if(raw!==null&&raw!==undefined&&raw!==''&&Number.isFinite(n)&&n>0)return '$'+n.toFixed(2);
                if(p.status==='retailer_blocked')return 'Blocked';
                if(p.status==='check_failed')return 'Unavailable';
                if(p.status==='store_not_resolved')return 'No store match';
                if(p.store_bound)return 'Not exposed';
                if(p.stock_checked)return 'Unavailable';
                return 'Not checked';
              }
              function setText(el,value){if(el&&el.textContent!==value)el.textContent=value;}
              function openRetailer(lead,d,id){
                var x=itemFromLead(lead,d.dataset.storeKey||''),p=results.get(id);
                var q=x.sku||x.upc||x.title;if(!q)return;
                var u='https://www.homedepot.com/s/'+encodeURIComponent(q);
                if(p&&p.store_id)u+=(u.indexOf('?')>=0?'&':'?')+'storeSelection='+encodeURIComponent(p.store_id);
                window.location.href=u;
              }
              function decorate(root){
                Array.from((root||document).querySelectorAll('.lead')).forEach(function(lead){
                  var b=lead.querySelector('[data-stock]'),meta=lead.querySelector('.lead-meta');
                  if(!b||!meta)return;
                  var d=lead.closest('details[data-store-key]'),id=b.dataset.stock||'',p=results.get(id),busy=pending.has(id);
                  var qbox=meta.querySelector('[data-h38-store-qty]'),pbox=meta.querySelector('[data-h38-store-price]');
                  if(!pbox){pbox=document.createElement('div');pbox.className='stat';pbox.setAttribute('data-h38-store-price','1');pbox.innerHTML='<strong>Not checked</strong><span>STORE PRICE</span>';meta.appendChild(pbox);}
                  if(!qbox){qbox=document.createElement('div');qbox.className='stat';qbox.setAttribute('data-h38-store-qty','1');qbox.innerHTML='<strong>Not checked</strong><span>STORE QTY</span>';meta.appendChild(qbox);}
                  setText(pbox.querySelector('strong'),busy?'Checking…':price(p));
                  setText(qbox.querySelector('strong'),busy?'Checking…':qty(p));

                  var old=lead.querySelector('.stock-line:not([data-h38-store-status])');if(old&&old.style.display!=='none')old.style.display='none';
                  var status=lead.querySelector('[data-h38-store-status]');
                  if(!status){status=document.createElement('div');status.className='stock-line small';status.setAttribute('data-h38-store-status','1');lead.insertBefore(status,lead.querySelector('.actions'));}
                  setText(status,busy?'Checking this physical store…':(p&&p.availability_label?p.availability_label:'Store not checked yet.'));

                  var badge=lead.querySelector('[data-h38-local-penny]'),isLocal=!!(p&&p.penny_price_detected===true&&lead.querySelector('.pill.penny'));
                  if(isLocal&&!badge){badge=document.createElement('span');badge.className='pill local';badge.setAttribute('data-h38-local-penny','1');badge.textContent='LOCAL $0.01';var host=lead.querySelector('.lead-head>div:last-child');if(host){host.appendChild(document.createTextNode(' '));host.appendChild(badge);}}
                  else if(!isLocal&&badge)badge.remove();

                  var retailer=norm(d&&d.querySelector('.store-title')&&d.querySelector('.store-title').textContent);
                  if(retailer==='home depot'&&lead.querySelector('.pill.penny')){
                    var actions=lead.querySelector('.actions'),official=lead.querySelector('[data-h38-retailer]');
                    if(actions&&!official){official=document.createElement('button');official.className='secondary';official.setAttribute('data-h38-retailer','1');official.textContent='Open Home Depot';official.onclick=function(e){e.preventDefault();e.stopPropagation();openRetailer(lead,d,id);};actions.appendChild(official);}
                  }
                });
              }

              document.addEventListener('click',function(e){var n=e.target;if(!(n instanceof Element))return;var b=n.closest('[data-stock]');if(b)remember(b);},true);

              window.fetch=async function(input,init){
                var url=typeof input==='string'?input:(input&&input.url)||'';
                if(url.indexOf(STOCK)<0)return baseFetch(input,init);
                var body={};try{body=JSON.parse(String((init&&init.body)||'{}'));}catch(e){}
                var signature=sig(body),id=sigToId.get(signature)||signature;
                pending.add(id);decorate(document);
                try{
                  var r=await baseFetch(input,init),c=r.clone();
                  c.json().then(function(p){results.set(id,p||{});persistStockResults();pending.delete(id);queued.delete(id);decorate(document);}).catch(function(){pending.delete(id);queued.delete(id);decorate(document);});
                  return r;
                }catch(e){results.set(id,{status:'check_failed',stock_checked:true,stock_status:'unknown'});persistStockResults();pending.delete(id);queued.delete(id);decorate(document);throw e;}
              };

              function findButton(id){return Array.from(document.querySelectorAll('[data-stock]')).find(function(b){return b.dataset.stock===id;})||null;}
              function queuePenny(d){
                if(!d||!d.open)return;
                var title=d.querySelector('.store-title'),retailer=norm(title&&title.textContent);if(retailer!=='home depot')return;
                var sk=d.dataset.storeKey||'',todo=[];
                Array.from(d.querySelectorAll('.lead')).forEach(function(lead){if(todo.length>=5)return;if(!lead.querySelector('.pill.penny'))return;var b=lead.querySelector('[data-stock]');if(!b)return;var id=remember(b);if(!id||results.has(id)||pending.has(id)||queued.has(id))return;queued.add(id);todo.push(id);});
                decorate(d);
                todo.forEach(function(id,i){setTimeout(function(){var live=detailsFor(sk);if(!live||!live.open){queued.delete(id);return;}var b=findButton(id);if(!b){queued.delete(id);return;}if(results.has(id)||pending.has(id)){queued.delete(id);return;}remember(b);b.click();},i*2200);});
              }

              document.addEventListener('toggle',function(e){var d=e.target;if(d instanceof HTMLDetailsElement&&d.matches('details[data-store-key]')&&d.open)queuePenny(d);},true);
              var h38HammerLoopFixed='HAMMER_MUTATION_LOOP_FIXED_V1',h38FlowPolish='BROWSE_NONBLOCKING_SEARCH_V1',h38AutoCheckLimit='AUTO_CHECK_HOME_DEPOT_TOP5_V1',h38Retention='STOCK_RESULT_RETENTION_V1';
              var list=document.getElementById('storeList');
              var obs=list?new MutationObserver(function(){decorate(list);Array.from(list.querySelectorAll('details[data-store-key][open]')).forEach(queuePenny);}):null;
              if(obs)obs.observe(list,{childList:true});
              setTimeout(function(){decorate(document);Array.from(document.querySelectorAll('details[data-store-key][open]')).forEach(queuePenny);},0);
            })();
            </script>
            """;

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(238, 243, 247));
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return windowInsets;
        });
        setContentView(webView);
        ViewCompat.requestApplyInsets(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString() + " H38ResellerScoutAndroid/0.1.17-retention-stores");

        webView.addJavascriptInterface(new ResellerBridge(), "AndroidH38Reseller");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                Uri uri = request.getUrl();
                String url = uri == null ? "" : uri.toString();
                if (url.startsWith(APP_BASE_URL)) return false;
                if (uri != null && ("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme()))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); return true; }
                    catch (Exception ignored) { return false; }
                }
                return true;
            }
        });
        loadEmbeddedApp();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_LOCATION) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) deliverLocation();
            else sendLocationError("Location permission is required for the local store search.");
        }
    }

    private static String replaceRequired(String source, String from, String to, String label) {
        if (!source.contains(from)) throw new IllegalStateException("Reseller Scout patch anchor missing: " + label);
        return source.replace(from, to);
    }

    private void loadEmbeddedApp() {
        try (InputStream input = getAssets().open("reseller/index.html"); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            String html = output.toString(StandardCharsets.UTF_8.name());

            html = replaceRequired(html,
                    ".toolbar{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end}",
                    ".toolbar{display:grid;grid-template-columns:minmax(180px,1.4fr) minmax(130px,1fr) minmax(130px,1fr) auto;gap:8px;align-items:end}",
                    "search toolbar grid");
            html = replaceRequired(html,
                    ".toolbar label{font-size:12px;font-weight:700}",
                    ".toolbar label{font-size:12px;font-weight:700}.toolbar input,.toolbar select{width:100%;padding:10px;border:1px solid #cbd7df;border-radius:9px;background:#fff}",
                    "search toolbar controls");
            html = replaceRequired(html,
                    ".lead-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:8px 0}",
                    ".lead-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px;margin:8px 0}",
                    "lead stat grid");
            html = replaceRequired(html,
                    "<section class=\"card\"><div class=\"toolbar\"><label>Retailer",
                    "<section class=\"card\"><div class=\"toolbar\"><label>Find item<input id=\"itemSearch\" type=\"search\" inputmode=\"search\" placeholder=\"Item, SKU or UPC\"></label><label>Retailer",
                    "item search control");
            html = html.replace(">Use phone location</button>", ">Update location & stores</button>");
            html = html.replace(">Refresh hunt</button>", ">Refresh deals</button>");
            html = html.replace("Check store qty", "Check price & stock");

            html = replaceRequired(html,
                    "let user=null,stores=[],leads=[],saved=[],point=null,storeLoad=null,leadLoad=null,targetScan=null,expandedStores=new Set();",
                    "let user=null,stores=[],leads=[],saved=[],point=null,storeLoad=null,leadLoad=null,targetScan=null,expandedStores=new Set((()=>{try{return JSON.parse(localStorage.getItem('h38_reseller_expanded_stores_v1')||'[]')}catch(e){return[]}})()),openStores=new Set((()=>{try{return JSON.parse(localStorage.getItem('h38_reseller_open_stores_v1')||'[]')}catch(e){return[]}})());",
                    "persistent store state");
            html = replaceRequired(html,
                    "function startWork(text){workDepth++;$('workingText').textContent=text||'H38 is working…';$('working').classList.remove('hidden')}",
                    "function startWork(text){workDepth++;if(!$('app').classList.contains('hidden'))return;$('workingText').textContent=text||'H38 is working…';$('working').classList.remove('hidden')}",
                    "nonblocking browse work");
            html = replaceRequired(html,
                    "function leadForStore(s){return leads.filter(x=>norm(x.retailer)===norm(s.retailer)).sort((a,b)=>n(b.resale_potential)-n(a.resale_potential)||n(b.discount_pct)-n(a.discount_pct))}",
                    "function leadForStore(s){const q=norm(($('itemSearch')&&$('itemSearch').value)||'');return leads.filter(x=>norm(x.retailer)===norm(s.retailer)&&(!q||norm([x.title,x.sku,x.upc,x.source_name].join(' ')).includes(q))).sort((a,b)=>Number(!!b.deep_discount)-Number(!!a.deep_discount)||n(b.discount_pct)-n(a.discount_pct)||n(b.resale_potential)-n(a.resale_potential))}",
                    "search-first lead filtering");
            html = replaceRequired(html,
                    "function renderStore(s){const auto=leadForStore(s),mine=savedForStore(s),showAll=expandedStores.has(s.store_key),shown=showAll?auto:auto.slice(0,18),hot=auto.length>0;return`<details class=\"store ${hot?'hot':''}\">",
                    "function renderStore(s){const auto=leadForStore(s),mine=savedForStore(s),showAll=expandedStores.has(s.store_key),shown=showAll?auto:auto.slice(0,18),hot=auto.length>0,isOpen=openStores.has(s.store_key);return`<details data-store-key=\"${esc(s.store_key)}\" class=\"store ${hot?'hot':''}\" ${isOpen?'open':''}>",
                    "store open persistence");
            html = replaceRequired(html,
                    "function bindActions(node){node.querySelectorAll('[data-more]').forEach(b=>b.onclick=()=>{expandedStores.add(b.dataset.more);renderStores()});",
                    "function bindActions(node){node.querySelectorAll('details[data-store-key]').forEach(d=>d.ontoggle=()=>{if(d.open)openStores.add(d.dataset.storeKey);else openStores.delete(d.dataset.storeKey);localStorage.setItem('h38_reseller_open_stores_v1',JSON.stringify(Array.from(openStores)))});node.querySelectorAll('[data-more]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();expandedStores.add(b.dataset.more);openStores.add(b.dataset.more);localStorage.setItem('h38_reseller_expanded_stores_v1',JSON.stringify(Array.from(expandedStores)));localStorage.setItem('h38_reseller_open_stores_v1',JSON.stringify(Array.from(openStores)));renderStores()});",
                    "store toggle binding");
            html = replaceRequired(html,
                    "function leadBadge(l){if(l.deal_type==='penny')return'<span class=\"pill penny\">PENNY</span>';if(l.deal_type==='in_store_bargain')return'<span class=\"pill local\">LOCAL BARGAIN</span>';return'<span class=\"pill deal\">RESALE DEAL</span>'}",
                    "function leadBadge(l){if(l.deal_type==='penny')return'<span class=\"pill penny\">PENNY</span>';if(l.deep_discount&&n(l.discount_pct)>50)return'<span class=\"pill local\">DEEP '+n(l.discount_pct).toFixed(0)+'% OFF</span>';if(l.deal_type==='in_store_bargain')return'<span class=\"pill local\">LOCAL BARGAIN</span>';return'<span class=\"pill deal\">RESALE DEAL</span>'}",
                    "deep discount badge");
            html = replaceRequired(html,
                    "function renderLead(s,l){const existing=savedMatch(s,l),potential=n(l.resale_potential),rank=potential>=90?'STRONG':potential>=78?'GOOD':'CHECK',sourceOnly=!!l.source_only;",
                    "function renderLead(s,l){const existing=savedMatch(s,l),potential=n(l.resale_potential),rank=potential>=90?'STRONG':potential>=78?'GOOD':'CHECK',sourceOnly=!!l.source_only;if(sourceOnly)return`<div class=\"lead\"><div class=\"lead-head\"><div><div class=\"lead-title\">${esc(l.title)}</div><div class=\"muted small\">${esc(l.availability_label||'Open the retailer sale list to browse all items.')}</div></div><div><span class=\"pill local\">SALE LIST</span></div></div><div class=\"actions\"><button data-source=\"${esc(l.id)}\">View full sale list</button></div></div>`;",
                    "sale-list compact rendering");
            html = replaceRequired(html,
                    "<div class=\"stat\"><strong>${money(l.buy_price)}</strong><span>Current/hunt price</span></div>",
                    "<div class=\"stat\"><strong>${l.deal_type==='penny'&&n(l.reported_penny_price)>0?money(l.reported_penny_price):money(l.buy_price)}</strong><span>${l.deal_type==='penny'?'Reported penny':'Current/hunt price'}</span></div>",
                    "reported penny label");
            html = replaceRequired(html,
                    "const next=Array.isArray(p.stores)?p.stores:[];stores=next;renderAll();",
                    "const next=Array.isArray(p.stores)?p.stores:[];if((p.partial||p.stale)&&stores.length>next.length){msg(`Store search was partial · keeping ${stores.length} known stores instead of dropping to ${next.length}.`,'warn');return stores}const merged=new Map(stores.map(x=>[x.store_key,x]));next.forEach(x=>merged.set(x.store_key,x));stores=Array.from(merged.values()).sort((a,b)=>n(a.distance_miles)-n(b.distance_miles));renderAll();",
                    "stable store merge");
            html = replaceRequired(html,
                    "await Promise.all([loadLeads(false),loadStores(true),loadSaved()]);renderAll();msg(`Hunt refreshed · ${stores.length} stores · ${leads.length} automatic deal leads · ${saved.length} saved finds.`,'good')",
                    "await Promise.all([loadLeads(true),loadSaved()]);renderAll();msg(`Deals refreshed · ${stores.length} stores kept · ${leads.length} automatic deal leads · ${saved.length} saved finds.`,'good')",
                    "deal-only refresh");
            html = replaceRequired(html,
                    "function renderFilters(){const current=$('retailerFilter').value,names=[...new Set([...stores.map(s=>s.retailer),...leads.map(l=>l.retailer),...saved.map(d=>d.retailer)].filter(Boolean))].sort();$('retailerFilter').innerHTML='<option value=\"\">All retailers</option>'+names.map(x=>`<option>${esc(x)}</option>`).join('');$('retailerFilter').value=names.includes(current)?current:''}",
                    "function renderFilters(){const current=$('retailerFilter').value||localStorage.getItem('h38_reseller_retailer_filter_v1')||'',names=[...new Set([...stores.map(s=>s.retailer),...leads.map(l=>l.retailer),...saved.map(d=>d.retailer)].filter(Boolean))].sort();$('retailerFilter').innerHTML='<option value=\"\">All stores</option>'+names.map(x=>`<option>${esc(x)}</option>`).join('');$('retailerFilter').value=names.includes(current)?current:''}",
                    "retailer filter persistence");
            html = replaceRequired(html,
                    "$('retailerFilter').onchange=renderStores;$('storeFilter').onchange=renderStores;",
                    "try{$('itemSearch').value=localStorage.getItem('h38_reseller_item_search_v1')||'';var sf=localStorage.getItem('h38_reseller_store_filter_v1')||'all';if(Array.from($('storeFilter').options).some(o=>o.value===sf))$('storeFilter').value=sf;}catch(e){}$('itemSearch').oninput=()=>{localStorage.setItem('h38_reseller_item_search_v1',$('itemSearch').value||'');renderStores()};$('retailerFilter').onchange=()=>{if(!$('retailerFilter').value)$('storeFilter').value='all';localStorage.setItem('h38_reseller_retailer_filter_v1',$('retailerFilter').value||'');localStorage.setItem('h38_reseller_store_filter_v1',$('storeFilter').value||'all');renderStores()};$('storeFilter').onchange=()=>{localStorage.setItem('h38_reseller_store_filter_v1',$('storeFilter').value||'all');renderStores()};",
                    "persistent filter binding");

            html = html.replace("</head>", STORE_FETCH_GUARD + "\n</head>");
            html = html.replace("<script>\n(()=>{'use strict';", RADIUS_BOOTSTRAP + "\n<script>\n(()=>{'use strict';");
            html = html.replace("</body>", STOCK_RUNTIME + "\n</body>");
            webView.loadDataWithBaseURL(APP_BASE_URL, html, "text/html", "UTF-8", APP_BASE_URL);
        } catch (Exception error) {
            Toast.makeText(this, "Reseller Scout failed to open: " + error.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void requestLocationPermissionOrDeliver() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
                checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQUEST_LOCATION);
            return;
        }
        deliverLocation();
    }

    private void deliverLocation() {
        try {
            LocationManager manager = (LocationManager) getSystemService(LOCATION_SERVICE);
            Location best = null;
            List<String> providers = manager.getProviders(true);
            for (String provider : providers) {
                try {
                    Location candidate = manager.getLastKnownLocation(provider);
                    if (candidate != null && (best == null || candidate.getAccuracy() < best.getAccuracy())) best = candidate;
                } catch (SecurityException ignored) {}
            }
            if (best != null) { sendLocation(best); return; }
            String provider = manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) ? LocationManager.NETWORK_PROVIDER :
                    (manager.isProviderEnabled(LocationManager.GPS_PROVIDER) ? LocationManager.GPS_PROVIDER : null);
            if (provider == null) { sendLocationError("Turn on phone location services."); return; }
            manager.requestSingleUpdate(provider, new LocationListener() {
                @Override public void onLocationChanged(Location location) { sendLocation(location); }
                @Override public void onProviderEnabled(String provider) {}
                @Override public void onProviderDisabled(String provider) {}
                @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
            }, Looper.getMainLooper());
        } catch (Exception error) { sendLocationError(error.getMessage()); }
    }

    private void sendLocation(Location location) {
        if (webView == null || location == null) return;
        double lat = location.getLatitude(), lon = location.getLongitude();
        webView.post(() -> webView.evaluateJavascript("window.H38NativeLocationResult && window.H38NativeLocationResult(" + lat + "," + lon + ");", null));
    }

    private void sendLocationError(String text) {
        if (webView == null) return;
        String encoded = JSONObject.quote(text == null ? "Location unavailable." : text);
        webView.post(() -> webView.evaluateJavascript("window.H38NativeLocationError && window.H38NativeLocationError(" + encoded + ");", null));
    }

    private void sendBarcode(String value) {
        if (webView == null) return;
        String encoded = JSONObject.quote(value == null ? "" : value);
        webView.post(() -> webView.evaluateJavascript("window.H38NativeBarcodeResult && window.H38NativeBarcodeResult(" + encoded + ");", null));
    }

    private void sendBarcodeError(String value) {
        if (webView == null) return;
        String encoded = JSONObject.quote(value == null ? "Barcode scanner unavailable." : value);
        webView.post(() -> webView.evaluateJavascript("window.H38NativeBarcodeError && window.H38NativeBarcodeError(" + encoded + ");", null));
    }

    private final class ResellerBridge {
        @JavascriptInterface public void requestLocation() { runOnUiThread(MainActivity.this::requestLocationPermissionOrDeliver); }

        @JavascriptInterface public void scanBarcode() {
            runOnUiThread(() -> {
                GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder()
                        .setBarcodeFormats(Barcode.FORMAT_UPC_A, Barcode.FORMAT_UPC_E, Barcode.FORMAT_EAN_13,
                                Barcode.FORMAT_EAN_8, Barcode.FORMAT_CODE_128, Barcode.FORMAT_QR_CODE)
                        .enableAutoZoom().build();
                GmsBarcodeScanner scanner = GmsBarcodeScanning.getClient(MainActivity.this, options);
                scanner.startScan().addOnSuccessListener(barcode -> {
                    String raw = barcode.getRawValue();
                    if (raw == null || raw.trim().isEmpty()) sendBarcodeError("No barcode value was returned."); else sendBarcode(raw.trim());
                }).addOnCanceledListener(() -> sendBarcodeError("Scan canceled."))
                        .addOnFailureListener(error -> sendBarcodeError(error.getMessage()));
            });
        }

        @JavascriptInterface public String build() { return "20260819-retention-allstores-parts-lm-v017"; }
    }
}
