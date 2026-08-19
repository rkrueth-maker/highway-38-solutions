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
    private static final String SOURCE_FALLBACK_MARKER = "SOURCE_SCAN_FALLBACK_LIST_V1";
    private static final String STORE_FLYER_MARKER = "STORE_FLYER_FALLBACK_V1";
    private static final String SHARED_KEY = "h38_reseller_shared_opportunities_v1";
    private static final String WATCH_KEY = "h38_reseller_watch_terms_v2";

    private static final String OPPORTUNITY_JS = """
            (function(){
              'use strict';
              if(window.__H38AutomaticOpportunityV4){if(window.H38AutomaticRefresh)window.H38AutomaticRefresh();return;}
              window.__H38AutomaticOpportunityV4=true;
              var WATCH_KEY='h38_reseller_watch_terms_v2',SHARED_KEY='h38_reseller_shared_opportunities_v1';
              var SCAN='/functions/v1/reseller-opportunity-scan';
              var SBKEY='sb_publishable_XrF41kGmTC2SmSTgPvo5OQ_vqcBd0N1';
              var DEFAULT_TERMS=['tools','Milwaukee','DeWalt','Snap-on','generator','welder','toolbox','zero turn','pressure washer'];
              var autoClicked=new Set(),scanBusy=false,lastScanAt=0,stockTimer=0,lastRows=[];
              var FLYERS={
                'home depot':'https://www.homedepot.com/SpecialBuy/SpecialBuyOfTheDay',
                "lowe's":'https://www.lowes.com/l/savings',
                'lowes':'https://www.lowes.com/l/savings',
                'walmart':'https://www.walmart.com/shop/deals',
                'target':'https://www.target.com/c/weekly-ad/-/N-4ykuc',
                'menards':'https://www.menards.com/main/flyer.html',
                'fleet farm':'https://www.fleetfarm.com/sitewide/weekly-ad',
                'l&m fleet supply':'https://www.landmsupply.com/weekly-ad',
                'harbor freight':'https://www.harborfreight.com/coupons-deals.html',
                'tractor supply':'https://www.tractorsupply.com/tsc/cms/weekly-ad',
                'dollar general':'https://www.dollargeneral.com/weekly-ad',
                'dollar tree':'https://www.dollartree.com/weekly-ads',
                'family dollar':'https://www.familydollar.com/weekly-ads',
                'northern tool':'https://www.northerntool.com/sale',
                'ace hardware':'https://www.acehardware.com/ace-rewards-instant-savings',
                'autozone':'https://www.autozone.com/lp/deals',
                "o'reilly auto parts":'https://www.oreillyauto.com/specials',
                'napa auto parts':'https://www.napaonline.com/en/deals',
                'advance auto parts':'https://shop.advanceautoparts.com/o/special-offers',
                'best buy':'https://www.bestbuy.com/site/top-deals/pcmcat1563299784494.c',
                'walgreens':'https://www.walgreens.com/topic/promotion/weeklyad.jsp',
                'cvs':'https://www.cvs.com/weeklyad',
                "kohl's":'https://www.kohls.com/sale-event/coupons-deals.jsp',
                'jcpenney':'https://www.jcpenney.com/m/deals',
                'tj maxx':'https://tjmaxx.tjx.com/store/shop/clearance/_/N-3951437597',
                'marshalls':'https://www.marshalls.com/us/store/shop/clearance/_/N-3951437597',
                'ross':'https://www.rossstores.com/',
                'burlington':'https://www.burlington.com/deals',
                'five below':'https://www.fivebelow.com/categories/new-and-now',
                'aldi':'https://www.aldi.us/weekly-specials/our-weekly-ads',
                'costco':'https://www.costco.com/online-offers.html',
                "sam's club":'https://www.samsclub.com/content/instant-savings-book',
                'petsmart':'https://www.petsmart.com/sale/',
                'petco':'https://www.petco.com/shop/en/petcostore/c/sale',
                'michaels':'https://www.michaels.com/sales-and-coupons',
                'hobby lobby':'https://www.hobbylobby.com/weekly-ad',
                'joann':'https://www.joann.com/weekly-ad/',
                "dunham's":'https://www.dunhamssports.com/weekly-ads.html',
                'runnings':'https://www.runnings.com/weekly-ad',
                'homegoods':'https://www.homegoods.com/'
              };
              function esc(v){return String(v||'').replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
              function load(key){try{var x=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(x)?x:[]}catch(e){return[]}}
              function save(key,x){try{localStorage.setItem(key,JSON.stringify(x))}catch(e){}}
              function currentQuery(){var e=document.getElementById('itemSearch');return e?String(e.value||'').trim():''}
              function terms(){var xs=load(WATCH_KEY);return xs.length?xs:DEFAULT_TERMS.slice()}
              function rememberCurrentQuery(){var q=currentQuery();if(q.length<2)return false;var xs=load(WATCH_KEY),low=q.toLowerCase();if(!xs.some(function(v){return String(v).toLowerCase()===low})){xs.unshift(q);save(WATCH_KEY,xs.slice(0,24));renderWatches();scan(true);return true}return false}
              function style(){if(document.getElementById('h38AutomaticStyle'))return;var s=document.createElement('style');s.id='h38AutomaticStyle';s.textContent='.h38-auto-deck{margin:10px 0;padding:10px;border:1px solid #cbd7df;border-radius:12px;background:#f8fbfd}.h38-auto-deck h3{margin:0 0 6px;font-size:14px}.h38-watch-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.h38-watch-chip{font-size:11px;padding:4px 7px;border-radius:999px;background:#e7eef3}.h38-auto-card{padding:9px;border:1px solid #d6e0e7;border-radius:9px;margin-top:7px;background:white}.h38-auto-status{font-size:11px;margin-top:5px}.h38-source-buttons{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.h38-source-buttons button{padding:7px 9px;font-size:12px}.h38-stock-summary{margin-top:8px;padding:8px;border-radius:9px;background:#eef4f8;font-size:12px}.h38-flyer{margin:7px 8px 10px;padding:8px;border:1px dashed #a8bac6;border-radius:9px;background:#f6fafc}.h38-flyer button{font-size:12px;padding:6px 9px}';document.head.appendChild(s)}
              function renderWatches(){var h=document.getElementById('h38WatchChips');if(!h)return;var xs=load(WATCH_KEY);h.innerHTML=xs.length?xs.map(function(x){return '<span class="h38-watch-chip">'+esc(x)+'</span>'}).join(''):'<span class="muted small">Using automatic resale categories until you search for something specific.</span>'}
              function installDeck(){style();if(document.getElementById('h38AutomaticDeck')){renderWatches();renderStockSummary();decorateStoreFlyers();return true}var list=document.getElementById('storeList');if(!list||!list.parentNode)return false;var d=document.createElement('section');d.id='h38AutomaticDeck';d.className='card h38-auto-deck';d.innerHTML='<h3>Automatic opportunity monitor</h3><div class="muted small">Scout searches resale sources itself. If a source blocks automated results, Scout still builds a source-search list here so the button never dead-ends.</div><div class="h38-source-buttons"><button data-h38-scan="all">Scan all</button><button data-h38-scan="Facebook Marketplace">Facebook</button><button data-h38-scan="HiBid">Auctions</button><button data-h38-scan="Craigslist">Craigslist</button></div><div id="h38WatchChips" class="h38-watch-chips"></div><div id="h38AutoStatus" class="h38-auto-status muted">Automatic scan ready.</div><div id="h38SourceStatus" class="h38-auto-status muted"></div><div id="h38StockSummary" class="h38-stock-summary">Price/quantity checks starting…</div><div id="h38AutoFinds"></div>';list.parentNode.insertBefore(d,list);d.querySelectorAll('[data-h38-scan]').forEach(function(b){b.onclick=function(e){e.preventDefault();scan(true,b.dataset.h38Scan||'all')}});renderWatches();renderStockSummary();decorateStoreFlyers();return true}
              function sourceFrom(text){var s=String(text||'').toLowerCase();if(s.indexOf('facebook.com')>=0||s.indexOf('marketplace')>=0)return 'Facebook Marketplace';if(s.indexOf('hibid')>=0)return 'HiBid';if(s.indexOf('craigslist')>=0)return 'Craigslist';return 'Shared listing'}
              function firstUrl(text){var s=String(text||''),m=s.match(/https?:\\/\\/\\S+/);return m?m[0]:''}
              function sourceSearchRows(source){var q=terms().slice(0,12),src=source||'all',out=[];q.forEach(function(term){var enc=encodeURIComponent(term);if(src==='all'||src==='Facebook Marketplace')out.push({source:'Facebook Marketplace',title:term+' · Marketplace search',url:'https://www.facebook.com/marketplace/search/?query='+enc,automatic:false,fallback:true});if(src==='all'||src==='HiBid')out.push({source:'HiBid',title:term+' · auction search',url:'https://hibid.com/lots?search='+enc,automatic:false,fallback:true});if(src==='all'||src==='Craigslist')out.push({source:'Craigslist',title:term+' · local search',url:'https://geo.craigslist.org/iso/us?q='+enc,automatic:false,fallback:true})});return out.slice(0,36)}
              function renderFinds(rows,fallbackSource){var h=document.getElementById('h38AutoFinds');if(!h)return;rows=Array.isArray(rows)?rows:[];if(!rows.length&&fallbackSource)rows=sourceSearchRows(fallbackSource);lastRows=rows;var shared=load(SHARED_KEY).slice(0,8);var combined=rows.concat(shared.map(function(x){return {source:x.source,title:x.text,url:x.url,price:null,automatic:false}})).slice(0,48);if(!combined.length){h.innerHTML='<div class="muted small" style="margin-top:8px">No outside resale sources available.</div>';return}h.innerHTML=combined.map(function(x){var pr=(x.price!==null&&x.price!==undefined&&x.price!=='')?' · <b>$'+esc(x.price)+'</b>':'';var kind=x.fallback?' · source search':(x.automatic===false?' · shared':' · automatic');return '<div class="h38-auto-card"><strong>'+esc(x.title||'Listing')+'</strong><div class="small">'+esc(x.source||'Source')+pr+kind+'</div>'+(x.url?'<div class="actions"><button data-auto-open="'+esc(x.url)+'">Open find</button></div>':'')+'</div>'}).join('');h.querySelectorAll('[data-auto-open]').forEach(function(b){b.onclick=function(){window.location.href=b.dataset.autoOpen}})}
              function token(){try{var raw=localStorage.getItem('sb-jqukmwtsgcsaruucnqja-auth-token');var p=raw?JSON.parse(raw):null;return p&&p.access_token?String(p.access_token):''}catch(e){return''}}
              function authHeaders(){var t=token();var h={'content-type':'application/json','apikey':SBKEY};if(t)h.authorization='Bearer '+t;return h}
              function sourceStatus(p){var h=document.getElementById('h38SourceStatus');if(!h)return;var s=p&&p.source_summary||{},parts=[];Object.keys(s).forEach(function(k){var x=s[k]||{};parts.push(k+': '+Number(x.matches||0)+' matches'+(Number(x.failed||0)>0?' · '+Number(x.failed)+' blocked/failed':''))});h.textContent=parts.join(' | ')||'Source links are available even when direct source retrieval is blocked.'}
              function retailerName(d){var t=String(d&&d.textContent||'').toLowerCase(),keys=Object.keys(FLYERS);for(var i=0;i<keys.length;i++)if(t.indexOf(keys[i])>=0)return keys[i];return ''}
              function fallbackFlyerUrl(d){var name=String(d&&d.querySelector('summary')&&d.querySelector('summary').textContent||d&&d.textContent||'store').trim().replace(/\\s+/g,' ');return 'https://www.google.com/search?q='+encodeURIComponent(name+' weekly ad flyer deals')}
              function decorateStoreFlyers(){var list=document.getElementById('storeList');if(!list)return;Array.from(list.querySelectorAll('details.store,details[data-store-key]')).forEach(function(d){if(d.querySelector('.h38-flyer'))return;var key=retailerName(d),url=key?FLYERS[key]:fallbackFlyerUrl(d),name=String(d.querySelector('summary')&&d.querySelector('summary').textContent||'Store').trim().replace(/\\s+/g,' ');var box=document.createElement('div');box.className='h38-flyer';box.innerHTML='<div class="small"><strong>Ad / flyer source</strong> · every listed store keeps at least one sale source.</div><div class="actions"><button data-flyer-open="'+esc(url)+'">Open '+esc(name)+' ad / deals</button></div>';d.appendChild(box);var b=box.querySelector('[data-flyer-open]');if(b)b.onclick=function(e){e.preventDefault();e.stopPropagation();window.location.href=b.dataset.flyerOpen}})}
              async function scan(force,source){installDeck();if(scanBusy)return;var now=Date.now();if(!force&&now-lastScanAt<120000)return;scanBusy=true;lastScanAt=now;var st=document.getElementById('h38AutoStatus'),requested=source||'all';if(st)st.textContent='Searching resale sources inside Scout…';try{var body={terms:terms().slice(0,12)};if(requested!=='all')body.sources=[requested];var r=await fetch(SCAN,{method:'POST',headers:authHeaders(),body:JSON.stringify(body)}),p=await r.json().catch(function(){return{}});if(!r.ok)throw new Error((p&&p.error)||('HTTP '+r.status));var rows=p&&p.opportunities;if(!Array.isArray(rows)||!rows.length){renderFinds([],requested);if(st)st.textContent='Direct source returned no listings · built '+sourceSearchRows(requested).length+' source-search links instead.';}else{renderFinds(rows,requested);if(st)st.textContent='Automatic scan checked '+String((p&&p.sources_checked)||0)+' requests · '+String(rows.length)+' matches.';}sourceStatus(p);}catch(e){var fallback=sourceSearchRows(requested);renderFinds(fallback);if(st)st.textContent='Direct source scan unavailable · built '+fallback.length+' source-search links instead.';var ss=document.getElementById('h38SourceStatus');if(ss)ss.textContent='Fallback list active: '+String(e&&e.message||e);}finally{scanBusy=false;decorateStoreFlyers()}}
              function renderStockSummary(){var h=document.getElementById('h38StockSummary');if(!h)return;var obj={};try{obj=JSON.parse(localStorage.getItem('h38_reseller_stock_results_v1')||'{}')||{}}catch(e){}var vals=Object.keys(obj).map(function(k){return obj[k]||{}}),verified=0,blocked=0,unavailable=0,qty=0,price=0;vals.forEach(function(p){if(p.status==='retailer_blocked')blocked++;else if(p.status==='check_failed'||p.status==='store_not_resolved'||p.status==='unsupported')unavailable++;else if(p.stock_checked)verified++;if(p.stock_count!==null&&p.stock_count!==undefined&&p.stock_count!=='')qty++;if(Number(p.current_price)>0)price++});h.textContent='Price/qty checks: '+vals.length+' attempted · '+price+' prices · '+qty+' exact quantities · '+verified+' usable availability · '+blocked+' retailer-blocked · '+unavailable+' unavailable.'}
              function stockId(b){return String(b.dataset.stock||'')}
              function queueStockChecks(){clearTimeout(stockTimer);stockTimer=setTimeout(function(){var buttons=Array.from(document.querySelectorAll('[data-stock]')),todo=[];buttons.forEach(function(b){var id=stockId(b);if(!id||autoClicked.has(id)||b.disabled)return;autoClicked.add(id);todo.push(b)});todo.slice(0,30).forEach(function(b,i){setTimeout(function(){try{if(document.body.contains(b)&&!b.disabled)b.click()}catch(e){}},i*1400)});},500)}
              function bindSearch(){var e=document.getElementById('itemSearch');if(e&&!e.dataset.h38AutoWatch){e.dataset.h38AutoWatch='1';e.addEventListener('change',rememberCurrentQuery);e.addEventListener('search',rememberCurrentQuery);e.addEventListener('keydown',function(ev){if(ev.key==='Enter')setTimeout(rememberCurrentQuery,0)})}}
              window.H38SharedOpportunity=function(text){text=String(text||'').trim();if(!text)return false;var rows=load(SHARED_KEY),now=Date.now(),url=firstUrl(text);if(!rows.some(function(x){return x.text===text&&now-Number(x.atMs||0)<600000})){rows.unshift({id:now,source:sourceFrom(text),text:text,url:url,atMs:now,at:new Date(now).toISOString()});save(SHARED_KEY,rows.slice(0,50))}installDeck();scan(true);return true};
              window.H38AutomaticRefresh=function(){installDeck();bindSearch();queueStockChecks();scan(false);renderStockSummary();decorateStoreFlyers()};
              installDeck();bindSearch();queueStockChecks();scan(true);decorateStoreFlyers();
              var list=document.getElementById('storeList');if(list){var obs=new MutationObserver(function(){installDeck();bindSearch();queueStockChecks();renderStockSummary();decorateStoreFlyers()});obs.observe(list,{childList:true,subtree:true})}
              setInterval(function(){bindSearch();queueStockChecks();scan(false);renderStockSummary();decorateStoreFlyers()},120000);
              setInterval(function(){renderStockSummary();decorateStoreFlyers()},3000);
              var automaticMarker='AUTOMATIC_OPPORTUNITY_MONITOR_V3',stockMarker='AUTOMATIC_STOCK_QUANTITY_CHECK_V3',sourceFallbackMarker='SOURCE_SCAN_FALLBACK_LIST_V1',storeFlyerMarker='STORE_FLYER_FALLBACK_V1';
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
