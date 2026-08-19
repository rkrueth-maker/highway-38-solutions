package com.highway38.resellerscout;

import android.app.Activity;
import android.app.Application;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;

import org.json.JSONObject;

import java.lang.reflect.Field;

public final class ResellerScoutApplication extends Application implements Application.ActivityLifecycleCallbacks {
    private static final String OPPORTUNITY_ENGINE_MARKER = "OPPORTUNITY_ENGINE_V1";
    private static final String MARKETPLACE_SHARE_MARKER = "MARKETPLACE_SHARE_IN_V1";
    private static final String SHARED_KEY = "h38_reseller_shared_opportunities_v1";
    private static final String WATCH_KEY = "h38_reseller_watch_terms_v1";

    private static final String OPPORTUNITY_JS = """
            (function(){
              'use strict';
              if(window.__H38OpportunityEngineV1){
                if(window.H38OpportunityRefresh)window.H38OpportunityRefresh();
                return;
              }
              window.__H38OpportunityEngineV1=true;
              var WATCH_KEY='h38_reseller_watch_terms_v1',SHARED_KEY='h38_reseller_shared_opportunities_v1';
              function esc(v){return String(v||'').replace(/[&<>\"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'})[c]})}
              function load(key){try{var x=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(x)?x:[]}catch(e){return[]}}
              function save(key,x){try{localStorage.setItem(key,JSON.stringify(x))}catch(e){}}
              function currentQuery(){var e=document.getElementById('itemSearch');return e?String(e.value||'').trim():''}
              function openUrl(url){window.location.href=url}
              function sourceUrl(kind,q){q=encodeURIComponent(q||'tools');if(kind==='marketplace')return 'https://www.facebook.com/marketplace/search/?query='+q;if(kind==='hibid')return 'https://hibid.com/lots?q='+q;if(kind==='craigslist')return 'https://www.craigslist.org/search/sss?query='+q;return 'https://www.google.com/search?q='+q}
              function firstUrl(text){var m=String(text||'').match(/https?:\/\/[^\s]+/i);return m?m[0]:''}
              function sourceFrom(text){var s=String(text||'').toLowerCase();if(s.indexOf('facebook.com')>=0||s.indexOf('marketplace')>=0)return 'Facebook Marketplace';if(s.indexOf('hibid')>=0)return 'HiBid';if(s.indexOf('auction')>=0)return 'Online auction';return 'Shared listing'}
              function style(){if(document.getElementById('h38OpportunityStyle'))return;var s=document.createElement('style');s.id='h38OpportunityStyle';s.textContent='.h38-opportunity-deck{margin:10px 0;padding:10px;border:1px solid #cbd7df;border-radius:12px;background:#f8fbfd}.h38-opportunity-deck h3{margin:0 0 7px;font-size:14px}.h38-opportunity-actions{display:flex;gap:7px;flex-wrap:wrap}.h38-opportunity-actions button{padding:8px 10px}.h38-watch-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.h38-watch-chip{font-size:11px;padding:4px 7px;border-radius:999px;background:#e7eef3}.h38-source-note{margin:8px 12px 12px;padding:9px;border-radius:9px;background:#f4f7f9;font-size:12px}.h38-rank{display:inline-block;margin-left:5px;padding:3px 6px;border-radius:999px;font-size:10px;font-weight:800;background:#e7eef3}.h38-shared-card{padding:9px;border:1px solid #d6e0e7;border-radius:9px;margin-top:7px;background:white}.h38-shared-card a{word-break:break-all}';document.head.appendChild(s)}
              function renderWatches(){var h=document.getElementById('h38WatchChips');if(!h)return;var xs=load(WATCH_KEY);h.innerHTML=xs.length?xs.map(function(x){return '<span class=\"h38-watch-chip\">'+esc(x)+'</span>'}).join(''):'<span class=\"muted small\">No watch terms yet.</span>'}
              function addWatch(){var q=currentQuery();if(!q)return;var xs=load(WATCH_KEY);if(!xs.some(function(v){return String(v).toLowerCase()===q.toLowerCase()})){xs.unshift(q);save(WATCH_KEY,xs.slice(0,20))}renderWatches()}
              function renderShared(){var h=document.getElementById('h38SharedList');if(!h)return;var rows=load(SHARED_KEY).slice(0,12);if(!rows.length){h.innerHTML='<div class=\"muted small\">Share a Marketplace or auction listing to H38 Reseller Scout and it will be kept here for review.</div>';return}h.innerHTML=rows.map(function(x){return '<div class=\"h38-shared-card\"><strong>'+esc(x.source)+'</strong><div class=\"small\">'+esc(x.text).slice(0,500)+'</div>'+(x.url?'<div class=\"actions\"><button data-shared-open=\"'+esc(x.url)+'\">Open source</button></div>':'')+'</div>'}).join('');h.querySelectorAll('[data-shared-open]').forEach(function(b){b.onclick=function(){openUrl(b.dataset.sharedOpen)}})}
              function installDeck(){style();if(document.getElementById('h38OpportunityDeck')){renderWatches();renderShared();return true}var list=document.getElementById('storeList');if(!list||!list.parentNode)return false;var d=document.createElement('section');d.id='h38OpportunityDeck';d.className='card h38-opportunity-deck';d.innerHTML='<h3>Opportunity sources</h3><div class=\"muted small\">Retail leads stay inside Scout. External sources open in their own site/app; H38 does not pretend external listings are verified local inventory.</div><div class=\"h38-opportunity-actions\"><button id=\"h38AddWatch\">Watch current search</button><button data-h38-source=\"hibid\">Search auctions</button><button data-h38-source=\"marketplace\">Search Marketplace</button><button data-h38-source=\"craigslist\">Search Craigslist</button></div><div id=\"h38WatchChips\" class=\"h38-watch-chips\"></div><h3 style=\"margin-top:10px\">Shared opportunities</h3><div id=\"h38SharedList\"></div>';list.parentNode.insertBefore(d,list);document.getElementById('h38AddWatch').onclick=addWatch;d.querySelectorAll('[data-h38-source]').forEach(function(b){b.onclick=function(){openUrl(sourceUrl(b.dataset.h38Source,currentQuery()))}});renderWatches();renderShared();return true}
              function rankLead(lead){if(!lead||lead.querySelector('[data-h38-rank]'))return;var text=(lead.textContent||'').toLowerCase(),label='VERIFY';if(lead.querySelector('[data-h38-local-penny]'))label='BUY NOW';else if(text.indexOf('deep ')>=0&&text.indexOf('% off')>=0)label='GOOD BUY';else if(lead.querySelector('.pill.penny'))label='VERIFY STORE';var title=lead.querySelector('.lead-title');if(title){var s=document.createElement('span');s.className='h38-rank';s.setAttribute('data-h38-rank','1');s.textContent=label;title.appendChild(s)}}
              function decorateStores(){document.querySelectorAll('details[data-store-key]').forEach(function(d){d.querySelectorAll('.lead').forEach(rankLead);var hasLead=!!d.querySelector('.lead'),note=d.querySelector('[data-h38-source-note]');if(!hasLead&&!note){note=document.createElement('div');note.className='h38-source-note';note.setAttribute('data-h38-source-note','1');note.innerHTML='<strong>Store found.</strong> No automatic deal feed is connected for this store right now. Use <b>Add my find</b>/barcode scan, or search auctions and Marketplace above.';var summary=d.querySelector('summary');if(summary)summary.insertAdjacentElement('afterend',note)}else if(hasLead&&note)note.remove()})}
              window.H38SharedOpportunity=function(text){text=String(text||'').trim();if(!text)return false;var rows=load(SHARED_KEY),url=firstUrl(text),now=Date.now();if(!rows.some(function(x){return x.text===text&&now-Number(x.atMs||0)<600000})){rows.unshift({id:now,source:sourceFrom(text),text:text,url:url,atMs:now,at:new Date(now).toISOString()});save(SHARED_KEY,rows.slice(0,50))}installDeck();renderShared();return true};
              window.H38OpportunityRefresh=function(){installDeck();decorateStores()};
              var list=document.getElementById('storeList');installDeck();decorateStores();if(list){var obs=new MutationObserver(function(){installDeck();decorateStores()});obs.observe(list,{childList:true})}
              var marker='OPPORTUNITY_ENGINE_V1',shareMarker='MARKETPLACE_SHARE_IN_V1';
            })();
            """;

    @Override
    public void onCreate() {
        super.onCreate();
        registerActivityLifecycleCallbacks(this);
    }

    private WebView findWebView(Activity activity) {
        try {
            Field field = activity.getClass().getDeclaredField("webView");
            field.setAccessible(true);
            Object value = field.get(activity);
            return value instanceof WebView ? (WebView) value : null;
        } catch (Exception ignored) {
            return null;
        }
    }

    private String sharedText(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return null;
        String type = intent.getType();
        if (type != null && !type.startsWith("text/")) return null;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.trim().isEmpty()) text = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        return text == null || text.trim().isEmpty() ? null : text.trim();
    }

    private void install(Activity activity, long delayMs) {
        WebView webView = findWebView(activity);
        if (webView == null) return;
        String shared = sharedText(activity.getIntent());
        String suffix = shared == null ? "" : "\nwindow.H38SharedOpportunity&&window.H38SharedOpportunity(" + JSONObject.quote(shared) + ");";
        webView.postDelayed(() -> webView.evaluateJavascript(OPPORTUNITY_JS + suffix, null), delayMs);
        if (shared != null) activity.getIntent().setAction(null);
    }

    @Override
    public void onActivityResumed(Activity activity) {
        if (!(activity instanceof MainActivity)) return;
        install(activity, 250);
        install(activity, 1100);
        install(activity, 2600);
    }

    @Override public void onActivityCreated(Activity activity, Bundle state) {}
    @Override public void onActivityStarted(Activity activity) {}
    @Override public void onActivityPaused(Activity activity) {}
    @Override public void onActivityStopped(Activity activity) {}
    @Override public void onActivitySaveInstanceState(Activity activity, Bundle outState) {}
    @Override public void onActivityDestroyed(Activity activity) {}
}
