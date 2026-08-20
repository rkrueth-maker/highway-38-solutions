package com.highway38.resellerscout;

import android.app.Activity;
import android.app.Application;
import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

public final class ResellerScoutPatchProvider extends ContentProvider implements Application.ActivityLifecycleCallbacks {
    private static final String MARKER = "H38_STRICT_IN_APP_SOURCE_SCAN_V1";
    private final Handler main = new Handler(Looper.getMainLooper());

    private static final String PATCH_JS = """
            (function(){
              'use strict';
              if(window.__H38StrictInAppSourceScanV1){window.__H38StrictInAppSourceScanV1();return;}
              var ENDPOINT='https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/reseller-opportunity-scan';
              var SBKEY='sb_publishable_XrF41kGmTC2SmSTgPvo5OQ_vqcBd0N1';
              var DEFAULT_TERMS=['tools','Milwaukee','DeWalt','Snap-on','generator','welder','toolbox','zero turn','pressure washer'];
              function esc(v){return String(v||'').replace(/[&<>\"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'})[c]})}
              function token(){try{var raw=localStorage.getItem('sb-jqukmwtsgcsaruucnqja-auth-token');var p=raw?JSON.parse(raw):null;return p&&p.access_token?String(p.access_token):''}catch(e){return''}}
              function headers(){var t=token(),h={'content-type':'application/json','apikey':SBKEY};if(t)h.authorization='Bearer '+t;return h}
              function terms(){try{var x=JSON.parse(localStorage.getItem('h38_reseller_watch_terms_v2')||'[]');return Array.isArray(x)&&x.length?x.slice(0,12):DEFAULT_TERMS.slice()}catch(e){return DEFAULT_TERMS.slice()}}
              function label(src){if(src==='Facebook Marketplace')return 'Facebook';if(src==='HiBid')return 'Auctions';return src||'Source'}
              function render(rows){var h=document.getElementById('h38AutoFinds');if(!h)return;rows=Array.isArray(rows)?rows:[];if(!rows.length){h.innerHTML='<div class="muted small" style="margin-top:8px">No resale listings returned by this scan.</div>';return}h.innerHTML=rows.slice(0,48).map(function(x){var pr=(x.price!==null&&x.price!==undefined&&x.price!=='')?' · <b>$'+esc(x.price)+'</b>':'';var where=x.location||x.area||x.store||'';return '<div class="h38-auto-card"><strong>'+esc(x.title||x.name||'Listing')+'</strong><div class="small">'+esc(label(x.source))+pr+(where?' · '+esc(where):'')+' · in-app result</div></div>'}).join('')}
              function summarize(p,requested){var s=p&&p.source_summary||{},parts=[];Object.keys(s).forEach(function(k){var x=s[k]||{},m=Number(x.matches||0),f=Number(x.failed||0);parts.push(label(k)+': '+m+' matches'+(f>0?' · blocked/failed '+f:''))});if(parts.length)return parts.join(' | ');return label(requested)+': source returned no usable listings.'}
              async function scan(requested){var st=document.getElementById('h38AutoStatus'),ss=document.getElementById('h38SourceStatus');if(st)st.textContent='Searching '+(requested==='all'?'Facebook, auctions and Craigslist':label(requested))+' inside Scout…';if(ss)ss.textContent='';render([]);try{var body={terms:terms()};if(requested!=='all')body.sources=[requested];var r=await fetch(ENDPOINT,{method:'POST',headers:headers(),body:JSON.stringify(body)});var p=await r.json().catch(function(){return{}});if(!r.ok)throw new Error((p&&p.error)||('HTTP '+r.status));var rows=Array.isArray(p&&p.opportunities)?p.opportunities:[];render(rows);if(st)st.textContent=rows.length?('Scan complete · '+rows.length+' in-app results.'):'Scan complete · no usable listings returned.';if(ss)ss.textContent=summarize(p,requested)}catch(e){render([]);if(st)st.textContent='Scan unavailable.';if(ss)ss.textContent=label(requested)+': blocked/unavailable · '+String(e&&e.message||e)}}
              function wire(){var deck=document.getElementById('h38AutomaticDeck');if(!deck)return false;var note=deck.querySelector('.muted.small');if(note)note.textContent='Scout scans resale sources itself. Results and blocked/unavailable status stay inside Scout; no manual-search fallback links.';deck.querySelectorAll('[data-h38-scan]').forEach(function(old){if(old.dataset.h38Strict==='1')return;var b=old.cloneNode(true);b.dataset.h38Strict='1';old.parentNode.replaceChild(b,old);b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();scan(b.dataset.h38Scan||'all')})});var finds=document.getElementById('h38AutoFinds');if(finds&&!finds.__h38StrictObserver){finds.__h38StrictObserver=true;new MutationObserver(function(){Array.from(finds.querySelectorAll('.h38-auto-card')).forEach(function(c){var t=String(c.textContent||'').toLowerCase();if(t.indexOf('source search')>=0||t.indexOf('marketplace search')>=0||t.indexOf('auction search')>=0||t.indexOf('local search')>=0)c.remove()})}).observe(finds,{childList:true,subtree:true})}return true}
              window.__H38StrictInAppSourceScanV1=function(){wire()};
              wire();
            })();
            """;

    @Override public boolean onCreate() {
        Application app = (Application) getContext().getApplicationContext();
        app.registerActivityLifecycleCallbacks(this);
        return true;
    }

    private static WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                WebView found = findWebView(group.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }

    private void inject(Activity activity) {
        if (!(activity instanceof MainActivity)) return;
        WebView webView = findWebView(activity.getWindow().getDecorView());
        if (webView != null) webView.evaluateJavascript(PATCH_JS, null);
    }

    @Override public void onActivityResumed(Activity activity) {
        inject(activity);
        main.postDelayed(() -> inject(activity), 700);
        main.postDelayed(() -> inject(activity), 1800);
        main.postDelayed(() -> inject(activity), 3500);
    }

    @Override public void onActivityCreated(Activity activity, Bundle state) {}
    @Override public void onActivityStarted(Activity activity) {}
    @Override public void onActivityPaused(Activity activity) {}
    @Override public void onActivityStopped(Activity activity) {}
    @Override public void onActivitySaveInstanceState(Activity activity, Bundle state) {}
    @Override public void onActivityDestroyed(Activity activity) {}

    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) { return null; }
    @Override public String getType(Uri uri) { return null; }
    @Override public Uri insert(Uri uri, ContentValues values) { return null; }
    @Override public int delete(Uri uri, String selection, String[] selectionArgs) { return 0; }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { return 0; }
}
