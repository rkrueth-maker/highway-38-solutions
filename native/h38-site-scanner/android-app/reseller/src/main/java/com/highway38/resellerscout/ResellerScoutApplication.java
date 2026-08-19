package com.highway38.resellerscout;

import android.app.Activity;
import android.app.Application;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;

import org.json.JSONObject;

import java.lang.reflect.Field;

public final class ResellerScoutApplication extends Application implements Application.ActivityLifecycleCallbacks {
    private static final String AUTOMATIC_OPPORTUNITY_MARKER = "AUTOMATIC_OPPORTUNITY_MONITOR_V3";
    private static final String AUTO_STOCK_MARKER = "AUTOMATIC_STOCK_QUANTITY_CHECK_V3";
    private static final String SHARED_KEY = "h38_reseller_shared_opportunities_v1";
    private static final String WATCH_KEY = "h38_reseller_watch_terms_v2";

    private static final String OPPORTUNITY_JS = """
            (function(){
              'use strict';
              if(window.__H38AutomaticOpportunityV3){if(window.H38AutomaticRefresh)window.H38AutomaticRefresh();return;}
              window.__H38AutomaticOpportunityV3=true;
              var WATCH_KEY='h38_reseller_watch_terms_v2',SHARED_KEY='h38_reseller_shared_opportunities_v1';
              var SCAN='/functions/v1/reseller-opportunity-scan';
              var SBKEY='sb_publishable_XrF41kGmTC2SmSTgPvo5OQ_vqcBd0N1';
              var DEFAULT_TERMS=['tools','Milwaukee','DeWalt','Snap-on','generator','welder','toolbox','zero turn','pressure washer'];
              var autoClicked=new Set(),scanBusy=false,lastScanAt=0,stockTimer=0,lastRows=[];
              function esc(v){return String(v||'').replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
              function load(key){try{var x=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(x)?x:[]}catch(e){return[]}}
              function save(key,x){try{localStorage.setItem(key,JSON.stringify(x))}catch(e){}}
              function currentQuery(){var e=document.getElementById('itemSearch');return e?String(e.value||'').trim():''}
              function terms(){var xs=load(WATCH_KEY);return xs.length?xs:DEFAULT_TERMS.slice()}
              function rememberCurrentQuery(){var q=currentQuery();if(q.length<2)return false;var xs=load(WATCH_KEY),low=q.toLowerCase();if(!xs.some(function(v){return String(v).toLowerCase()===low})){xs.unshift(q);save(WATCH_KEY,xs.slice(0,24));renderWatches();scan(true);return true}return false}
              function style(){if(document.getElementById('h38AutomaticStyle'))return;var s=document.createElement('style');s.id='h38AutomaticStyle';s.textContent='.h38-auto-deck{margin:10px 0;padding:10px;border:1px solid #cbd7df;border-radius:12px;background:#f8fbfd}.h38-auto-deck h3{margin:0 0 6px;font-size:14px}.h38-watch-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.h38-watch-chip{font-size:11px;padding:4px 7px;border-radius:999px;background:#e7eef3}.h38-auto-card{padding:9px;border:1px solid #d6e0e7;border-radius:9px;margin-top:7px;background:white}.h38-auto-status{font-size:11px;margin-top:5px}.h38-source-buttons{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.h38-source-buttons button{padding:7px 9px;font-size:12px}.h38-stock-summary{margin-top:8px;padding:8px;border-radius:9px;background:#eef4f8;font-size:12px}';document.head.appendChild(s)}
              function renderWatches(){var h=document.getElementById('h38WatchChips');if(!h)return;var xs=load(WATCH_KEY);h.innerHTML=xs.length?xs.map(function(x){return '<span class="h38-watch-chip">'+esc(x)+'</span>'}).join(''):'<span class="muted small">Using automatic resale categories until you search for something specific.</span>'}
              function installDeck(){style();if(document.getElementById('h38AutomaticDeck')){renderWatches();renderStockSummary();return true}var list=document.getElementById('storeList');if(!list||!list.parentNode)return false;var d=document.createElement('section');d.id='h38AutomaticDeck';d.className='card h38-auto-deck';d.innerHTML='<h3>Automatic opportunity monitor</h3><div class="muted small">Scout searches resale sources itself and shows matches here. Source buttons run an in-app scan; they do not redirect you to the source.</div><div class="h38-source-buttons"><button data-h38-scan="all">Scan all</button><button data-h38-scan="Facebook Marketplace">Facebook</button><button data-h38-scan="HiBid">Auctions</button><button data-h38-scan="Craigslist">Craigslist</button></div><div id="h38WatchChips" class="h38-watch-chips"></div><div id="h38AutoStatus" class="h38-auto-status muted">Automatic scan ready.</div><div id="h38SourceStatus" class="h38-auto-status muted"></div><div id="h38StockSummary" class="h38-stock-summary">Price/quantity checks starting…</div><div id="h38AutoFinds"></div>';list.parentNode.insertBefore(d,list);d.querySelectorAll('[data-h38-scan]').forEach(function(b){b.onclick=function(e){e.preventDefault();scan(true,b.dataset.h38Scan||'all')}});renderWatches();renderStockSummary();return true}
              function sourceFrom(text){var s=String(text||'').toLowerCase();if(s.indexOf('facebook.com')>=0||s.indexOf('marketplace')>=0)return 'Facebook Marketplace';if(s.indexOf('hibid')>=0)return 'HiBid';if(s.indexOf('craigslist')>=0)return 'Craigslist';return 'Shared listing'}
              function firstUrl(text){var s=String(text||''),m=s.match(/https?:\\/\\/\\S+/);return m?m[0]:''}
              function renderFinds(rows){var h=document.getElementById('h38AutoFinds');if(!h)return;rows=Array.isArray(rows)?rows:[];lastRows=rows;var shared=load(SHARED_KEY).slice(0,8);var combined=rows.concat(shared.map(function(x){return {source:x.source,title:x.text,url:x.url,price:null,automatic:false}})).slice(0,40);if(!combined.length){h.innerHTML='<div class="muted small" style="margin-top:8px">No matching outside resale finds returned yet.</div>';return}h.innerHTML=combined.map(function(x){var pr=(x.price!==null&&x.price!==undefined&&x.price!=='')?' · <b>$'+esc(x.price)+'</b>':'';return '<div class="h38-auto-card"><strong>'+esc(x.title||'Listing')+'</strong><div class="small">'+esc(x.source||'Source')+pr+(x.automatic===false?' · shared':' · automatic')+'</div>'+(x.url?'<div class="actions"><button data-auto-open="'+esc(x.url)+'">Open find</button></div>':'')+'</div>'}).join('');h.querySelectorAll('[data-auto-open]').forEach(function(b){b.onclick=function(){window.location.href=b.dataset.autoOpen}})}
              function token(){try{var raw=localStorage.getItem('sb-jqukmwtsgcsaruucnqja-auth-token');var p=raw?JSON.parse(raw):null;return p&&p.access_token?String(p.access_token):''}catch(e){return''}}
              function authHeaders(){var t=token();var h={'content-type':'application/json','apikey':SBKEY};if(t)h.authorization='Bearer '+t;return h}
              function sourceStatus(p){var h=document.getElementById('h38SourceStatus');if(!h)return;var s=p&&p.source_summary||{},parts=[];Object.keys(s).forEach(function(k){var x=s[k]||{};parts.push(k+': '+Number(x.matches||0)+' matches'+(Number(x.failed||0)>0?' · '+Number(x.failed)+' blocked/failed':''))});h.textContent=parts.join(' | ')||'No source diagnostics returned.'}
              async function scan(force,source){installDeck();if(scanBusy)return;var now=Date.now();if(!force&&now-lastScanAt<120000)return;scanBusy=true;lastScanAt=now;var st=document.getElementById('h38AutoStatus');if(st)st.textContent='Searching resale sources inside Scout…';try{var body={terms:terms().slice(0,12)};if(source&&source!=='all')body.sources=[source];var r=await fetch(SCAN,{method:'POST',headers:authHeaders(),body:JSON.stringify(body)}),p=await r.json().catch(function(){return{}});if(!r.ok)throw new Error((p&&p.error)||('HTTP '+r.status));renderFinds(p&&p.opportunities);sourceStatus(p);if(st)st.textContent='Automatic scan checked '+String((p&&p.sources_checked)||0)+' requests · '+String((p&&p.opportunities&&p.opportunities.length)||0)+' matches.';}catch(e){if(st)st.textContent='Automatic resale scan failed: '+String(e&&e.message||e)}finally{scanBusy=false}}
              function renderStockSummary(){var h=document.getElementById('h38StockSummary');if(!h)return;var obj={};try{obj=JSON.parse(localStorage.getItem('h38_reseller_stock_results_v1')||'{}')||{}}catch(e){}var vals=Object.keys(obj).map(function(k){return obj[k]||{}}),verified=0,blocked=0,unavailable=0,qty=0,price=0;vals.forEach(function(p){if(p.status==='retailer_blocked')blocked++;else if(p.status==='check_failed'||p.status==='store_not_resolved'||p.status==='unsupported')unavailable++;else if(p.stock_checked)verified++;if(p.stock_count!==null&&p.stock_count!==undefined&&p.stock_count!=='')qty++;if(Number(p.current_price)>0)price++});h.textContent='Price/qty checks: '+vals.length+' attempted · '+price+' prices · '+qty+' exact quantities · '+verified+' usable availability · '+blocked+' retailer-blocked · '+unavailable+' unavailable.'}
              function stockId(b){return String(b.dataset.stock||'')}
              function queueStockChecks(){clearTimeout(stockTimer);stockTimer=setTimeout(function(){var buttons=Array.from(document.querySelectorAll('[data-stock]')),todo=[];buttons.forEach(function(b){var id=stockId(b);if(!id||autoClicked.has(id)||b.disabled)return;autoClicked.add(id);todo.push(b)});todo.slice(0,30).forEach(function(b,i){setTimeout(function(){try{if(document.body.contains(b)&&!b.disabled)b.click()}catch(e){}},i*1400)});},500)}
              function bindSearch(){var e=document.getElementById('itemSearch');if(e&&!e.dataset.h38AutoWatch){e.dataset.h38AutoWatch='1';e.addEventListener('change',rememberCurrentQuery);e.addEventListener('search',rememberCurrentQuery);e.addEventListener('keydown',function(ev){if(ev.key==='Enter')setTimeout(rememberCurrentQuery,0)})}}
              window.H38SharedOpportunity=function(text){text=String(text||'').trim();if(!text)return false;var rows=load(SHARED_KEY),now=Date.now(),url=firstUrl(text);if(!rows.some(function(x){return x.text===text&&now-Number(x.atMs||0)<600000})){rows.unshift({id:now,source:sourceFrom(text),text:text,url:url,atMs:now,at:new Date(now).toISOString()});save(SHARED_KEY,rows.slice(0,50))}installDeck();scan(true);return true};
              window.H38AutomaticRefresh=function(){installDeck();bindSearch();queueStockChecks();scan(false);renderStockSummary()};
              installDeck();bindSearch();queueStockChecks();scan(true);
              var list=document.getElementById('storeList');if(list){var obs=new MutationObserver(function(){installDeck();bindSearch();queueStockChecks();renderStockSummary()});obs.observe(list,{childList:true,subtree:true})}
              setInterval(function(){bindSearch();queueStockChecks();scan(false);renderStockSummary()},120000);
              setInterval(renderStockSummary,3000);
              var automaticMarker='AUTOMATIC_OPPORTUNITY_MONITOR_V3',stockMarker='AUTOMATIC_STOCK_QUANTITY_CHECK_V3';
            })();
            """;

    @Override public void onCreate(){super.onCreate();registerActivityLifecycleCallbacks(this);}

    private WebView findWebView(Activity activity){
        try{Field field=activity.getClass().getDeclaredField("webView");field.setAccessible(true);Object value=field.get(activity);return value instanceof WebView?(WebView)value:null;}
        catch(Exception ignored){return null;}
    }

    private String sharedText(Intent intent){
        if(intent==null||!Intent.ACTION_SEND.equals(intent.getAction()))return null;
        String type=intent.getType();if(type!=null&&!type.startsWith("text/"))return null;
        String text=intent.getStringExtra(Intent.EXTRA_TEXT);if(text==null||text.trim().isEmpty())text=intent.getStringExtra(Intent.EXTRA_SUBJECT);
        return text==null||text.trim().isEmpty()?null:text.trim();
    }

    private void install(Activity activity,long delayMs,String shared){
        WebView webView=findWebView(activity);if(webView==null)return;
        String suffix=shared==null?"":"\nwindow.H38SharedOpportunity&&window.H38SharedOpportunity("+JSONObject.quote(shared)+");";
        webView.postDelayed(()->webView.evaluateJavascript(OPPORTUNITY_JS+suffix,null),delayMs);
    }

    @Override public void onActivityResumed(Activity activity){
        if(!(activity instanceof MainActivity))return;String shared=sharedText(activity.getIntent());
        install(activity,250,shared);install(activity,1100,shared);install(activity,2600,shared);
        if(shared!=null)activity.getIntent().setAction(null);
    }

    @Override public void onActivityCreated(Activity activity,Bundle state){}
    @Override public void onActivityStarted(Activity activity){}
    @Override public void onActivityPaused(Activity activity){}
    @Override public void onActivityStopped(Activity activity){}
    @Override public void onActivitySaveInstanceState(Activity activity,Bundle outState){}
    @Override public void onActivityDestroyed(Activity activity){}
}
