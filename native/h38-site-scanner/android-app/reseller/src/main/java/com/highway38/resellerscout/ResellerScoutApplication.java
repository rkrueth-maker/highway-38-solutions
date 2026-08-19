package com.highway38.resellerscout;

import android.app.Activity;
import android.app.Application;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;

import org.json.JSONObject;

import java.lang.reflect.Field;

public final class ResellerScoutApplication extends Application implements Application.ActivityLifecycleCallbacks {
    private static final String AUTOMATIC_OPPORTUNITY_MARKER = "AUTOMATIC_OPPORTUNITY_MONITOR_V2";
    private static final String AUTO_STOCK_MARKER = "AUTOMATIC_STOCK_QUANTITY_CHECK_V2";
    private static final String SHARED_KEY = "h38_reseller_shared_opportunities_v1";
    private static final String WATCH_KEY = "h38_reseller_watch_terms_v2";

    private static final String OPPORTUNITY_JS = """
            (function(){
              'use strict';
              if(window.__H38AutomaticOpportunityV2){if(window.H38AutomaticRefresh)window.H38AutomaticRefresh();return;}
              window.__H38AutomaticOpportunityV2=true;
              var WATCH_KEY='h38_reseller_watch_terms_v2',SHARED_KEY='h38_reseller_shared_opportunities_v1';
              var SCAN='/functions/v1/reseller-opportunity-scan';
              var autoClicked=new Set(),scanBusy=false,lastScanAt=0,stockTimer=0;
              function esc(v){return String(v||'').replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
              function load(key){try{var x=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(x)?x:[]}catch(e){return[]}}
              function save(key,x){try{localStorage.setItem(key,JSON.stringify(x))}catch(e){}}
              function currentQuery(){var e=document.getElementById('itemSearch');return e?String(e.value||'').trim():''}
              function rememberCurrentQuery(){var q=currentQuery();if(q.length<2)return false;var xs=load(WATCH_KEY),low=q.toLowerCase();if(!xs.some(function(v){return String(v).toLowerCase()===low})){xs.unshift(q);save(WATCH_KEY,xs.slice(0,24));renderWatches();scanSoon(500);return true}return false}
              function style(){if(document.getElementById('h38AutomaticStyle'))return;var s=document.createElement('style');s.id='h38AutomaticStyle';s.textContent='.h38-auto-deck{margin:10px 0;padding:10px;border:1px solid #cbd7df;border-radius:12px;background:#f8fbfd}.h38-auto-deck h3{margin:0 0 6px;font-size:14px}.h38-watch-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.h38-watch-chip{font-size:11px;padding:4px 7px;border-radius:999px;background:#e7eef3}.h38-auto-card{padding:9px;border:1px solid #d6e0e7;border-radius:9px;margin-top:7px;background:white}.h38-auto-status{font-size:11px;margin-top:5px}';document.head.appendChild(s)}
              function renderWatches(){var h=document.getElementById('h38WatchChips');if(!h)return;var xs=load(WATCH_KEY);h.innerHTML=xs.length?xs.map(function(x){return '<span class="h38-watch-chip">'+esc(x)+'</span>'}).join(''):'<span class="muted small">Search for an item once and Scout will watch it automatically.</span>'}
              function installDeck(){style();if(document.getElementById('h38AutomaticDeck')){renderWatches();return true}var list=document.getElementById('storeList');if(!list||!list.parentNode)return false;var d=document.createElement('section');d.id='h38AutomaticDeck';d.className='card h38-auto-deck';d.innerHTML='<h3>Automatic opportunity monitor</h3><div class="muted small">Scout checks watched searches and available public resale sources automatically. No Marketplace, Craigslist, or auction search buttons are required.</div><div id="h38WatchChips" class="h38-watch-chips"></div><div id="h38AutoStatus" class="h38-auto-status muted">Automatic scan ready.</div><div id="h38AutoFinds"></div>';list.parentNode.insertBefore(d,list);renderWatches();return true}
              function sourceFrom(text){var s=String(text||'').toLowerCase();if(s.indexOf('facebook.com')>=0||s.indexOf('marketplace')>=0)return 'Facebook Marketplace';if(s.indexOf('hibid')>=0)return 'HiBid';if(s.indexOf('craigslist')>=0)return 'Craigslist';return 'Shared listing'}
              function firstUrl(text){var s=String(text||''),m=s.match(/https?:\\/\\/\\S+/);return m?m[0]:''}
              function renderFinds(rows){var h=document.getElementById('h38AutoFinds');if(!h)return;rows=Array.isArray(rows)?rows:[];var shared=load(SHARED_KEY).slice(0,8);var combined=rows.concat(shared.map(function(x){return {source:x.source,title:x.text,url:x.url,price:null,automatic:false}})).slice(0,24);if(!combined.length){h.innerHTML='<div class="muted small" style="margin-top:8px">No matching outside resale finds yet. Scout will keep checking automatically.</div>';return}h.innerHTML=combined.map(function(x){var price=(x.price!==null&&x.price!==undefined&&x.price!=='')?' · <b>$'+esc(x.price)+'</b>':'';return '<div class="h38-auto-card"><strong>'+esc(x.title||'Listing')+'</strong><div class="small">'+esc(x.source||'Source')+price+(x.automatic===false?' · shared':' · automatic')+'</div>'+(x.url?'<div class="actions"><button data-auto-open="'+esc(x.url)+'">Open find</button></div>':'')+'</div>'}).join('');h.querySelectorAll('[data-auto-open]').forEach(function(b){b.onclick=function(){window.location.href=b.dataset.autoOpen}})}
              function authHeaders(){var h={'content-type':'application/json'};try{var raw=localStorage.getItem('sb-jqukmwtsgcsaruucnqja-auth-token');var p=raw?JSON.parse(raw):null;var token=p&&p.access_token;if(token){h.authorization='Bearer '+token;h.apikey=token}}catch(e){}return h}
              function requestArea(){try{var raw=localStorage.getItem('h38_reseller_last_store_response_v1'),s=raw?JSON.parse(raw):null,b=s&&s.requestBody?JSON.parse(s.requestBody):{};return {lat:Number(b.lat)||0,lon:Number(b.lon)||0,radiusMiles:Number(b.radiusMiles)||50}}catch(e){return {lat:0,lon:0,radiusMiles:50}}}
              async function scan(){installDeck();var terms=load(WATCH_KEY);if(!terms.length||scanBusy)return;var now=Date.now();if(now-lastScanAt<120000)return;scanBusy=true;lastScanAt=now;var st=document.getElementById('h38AutoStatus');if(st)st.textContent='Checking resale sources automatically…';try{var area=requestArea(),r=await fetch(SCAN,{method:'POST',headers:authHeaders(),body:JSON.stringify({terms:terms.slice(0,12),lat:area.lat,lon:area.lon,radiusMiles:area.radiusMiles})}),p=await r.json();renderFinds(p&&p.opportunities);if(st)st.textContent='Automatic scan checked '+String((p&&p.sources_checked)||0)+' sources · '+String((p&&p.opportunities&&p.opportunities.length)||0)+' matches.';}catch(e){if(st)st.textContent='Automatic resale scan will retry later.'}finally{scanBusy=false}}
              function scanSoon(ms){setTimeout(scan,ms||700)}
              function stockId(b){return String(b.dataset.stock||'')}
              function queueStockChecks(){clearTimeout(stockTimer);stockTimer=setTimeout(function(){var buttons=Array.from(document.querySelectorAll('[data-stock]')),todo=[];buttons.forEach(function(b){var id=stockId(b);if(!id||autoClicked.has(id)||b.disabled)return;var lead=b.closest('.lead');if(!lead)return;var txt=(lead.textContent||'').toLowerCase();if(txt.indexOf('not checked')<0&&txt.indexOf('check price')<0&&txt.indexOf('check stock')<0&&!lead.querySelector('.pill.penny'))return;autoClicked.add(id);todo.push(b)});todo.slice(0,24).forEach(function(b,i){setTimeout(function(){try{if(document.body.contains(b)&&!b.disabled)b.click()}catch(e){}},i*1800)});},400)}
              function bindSearch(){var e=document.getElementById('itemSearch');if(e&&!e.dataset.h38AutoWatch){e.dataset.h38AutoWatch='1';e.addEventListener('change',rememberCurrentQuery);e.addEventListener('search',rememberCurrentQuery);e.addEventListener('keydown',function(ev){if(ev.key==='Enter')setTimeout(rememberCurrentQuery,0)})}document.querySelectorAll('button').forEach(function(b){var t=(b.textContent||'').toLowerCase();if(!b.dataset.h38AutoWatch&&(/find item|search/.test(t))){b.dataset.h38AutoWatch='1';b.addEventListener('click',function(){setTimeout(rememberCurrentQuery,30)})}})}
              window.H38SharedOpportunity=function(text){text=String(text||'').trim();if(!text)return false;var rows=load(SHARED_KEY),now=Date.now(),url=firstUrl(text);if(!rows.some(function(x){return x.text===text&&now-Number(x.atMs||0)<600000})){rows.unshift({id:now,source:sourceFrom(text),text:text,url:url,atMs:now,at:new Date(now).toISOString()});save(SHARED_KEY,rows.slice(0,50))}installDeck();scanSoon(250);return true};
              window.H38AutomaticRefresh=function(){installDeck();bindSearch();queueStockChecks();scanSoon(700)};
              installDeck();bindSearch();queueStockChecks();scanSoon(900);
              var list=document.getElementById('storeList');if(list){var obs=new MutationObserver(function(){installDeck();bindSearch();queueStockChecks()});obs.observe(list,{childList:true,subtree:true})}
              setInterval(function(){bindSearch();queueStockChecks();scan()},5*60*1000);
              var automaticMarker='AUTOMATIC_OPPORTUNITY_MONITOR_V2',stockMarker='AUTOMATIC_STOCK_QUANTITY_CHECK_V2';
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
