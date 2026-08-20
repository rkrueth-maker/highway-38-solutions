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
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

public final class ResellerScoutPatchProvider extends ContentProvider implements Application.ActivityLifecycleCallbacks {
    private static final String SOURCE_MARKER = "H38_STRICT_IN_APP_SOURCE_SCAN_V2";
    private static final String LOCATION_MARKER = "H38_PHONE_OR_ZIP_LOCATION_V1";
    private final Handler main = new Handler(Looper.getMainLooper());

    private static final String PATCH_JS = """
            (function(){
              'use strict';
              var ENDPOINT='https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/reseller-opportunity-scan';
              var SBKEY='sb_publishable_XrF41kGmTC2SmSTgPvo5OQ_vqcBd0N1';
              var DEFAULT_TERMS=['tools','Milwaukee','DeWalt','Snap-on','generator','welder','toolbox','zero turn','pressure washer'];
              var ZIP_KEY='h38_reseller_zip_search_v1',LOCATION_MODE_KEY='h38_reseller_location_mode_v1';
              function esc(v){return String(v||'').replace(/[&<>\"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'})[c]})}
              function token(){try{var raw=localStorage.getItem('sb-jqukmwtsgcsaruucnqja-auth-token');var p=raw?JSON.parse(raw):null;return p&&p.access_token?String(p.access_token):''}catch(e){return''}}
              function headers(){var t=token(),h={'content-type':'application/json','apikey':SBKEY};if(t)h.authorization='Bearer '+t;return h}
              function terms(){try{var x=JSON.parse(localStorage.getItem('h38_reseller_watch_terms_v2')||'[]');return Array.isArray(x)&&x.length?x.slice(0,12):DEFAULT_TERMS.slice()}catch(e){return DEFAULT_TERMS.slice()}}
              function label(src){if(src==='Facebook Marketplace')return 'Facebook';if(src==='HiBid')return 'Auctions';return src||'Source'}
              function blockedFallbackUrl(url){var u=String(url||'').toLowerCase();return u.indexOf('facebook.com/marketplace/search')>=0||u.indexOf('hibid.com/lots?search')>=0||u.indexOf('geo.craigslist.org')>=0}
              function fallbackCard(card){var t=String(card&&card.textContent||'').toLowerCase();return t.indexOf('source search')>=0||t.indexOf('marketplace search')>=0||t.indexOf('auction search')>=0||t.indexOf('local search')>=0}
              function purgeFallbacks(){var finds=document.getElementById('h38AutoFinds');if(!finds)return;Array.from(finds.querySelectorAll('.h38-auto-card')).forEach(function(card){var b=card.querySelector('[data-auto-open]');if(fallbackCard(card)||(b&&blockedFallbackUrl(b.dataset.autoOpen)))card.remove()})}
              function render(rows){var h=document.getElementById('h38AutoFinds');if(!h)return;rows=Array.isArray(rows)?rows:[];if(!rows.length){h.innerHTML='<div class="muted small" style="margin-top:8px">No resale listings returned by this scan.</div>';return}h.innerHTML=rows.slice(0,48).map(function(x){var pr=(x.price!==null&&x.price!==undefined&&x.price!=='')?' · <b>$'+esc(x.price)+'</b>':'';var where=x.location||x.area||x.store||'';return '<div class="h38-auto-card"><strong>'+esc(x.title||x.name||'Listing')+'</strong><div class="small">'+esc(label(x.source))+pr+(where?' · '+esc(where):'')+' · in-app result</div></div>'}).join('')}
              function summarize(p,requested){var s=p&&p.source_summary||{},parts=[];Object.keys(s).forEach(function(k){var x=s[k]||{},m=Number(x.matches||0),f=Number(x.failed||0);parts.push(label(k)+': '+m+' matches'+(f>0?' · blocked/failed '+f:''))});if(parts.length)return parts.join(' | ');return label(requested)+': source returned no usable listings.'}
              async function scan(requested){var st=document.getElementById('h38AutoStatus'),ss=document.getElementById('h38SourceStatus');if(st)st.textContent='Searching '+(requested==='all'?'Facebook, auctions and Craigslist':label(requested))+' inside Scout…';if(ss)ss.textContent='';render([]);try{var body={terms:terms()};if(requested!=='all')body.sources=[requested];var r=await fetch(ENDPOINT,{method:'POST',headers:headers(),body:JSON.stringify(body)});var p=await r.json().catch(function(){return{}});if(!r.ok)throw new Error((p&&p.error)||('HTTP '+r.status));var rows=Array.isArray(p&&p.opportunities)?p.opportunities:[];render(rows);if(st)st.textContent=rows.length?('Scan complete · '+rows.length+' in-app results.'):'Scan complete · no usable listings returned.';if(ss)ss.textContent=summarize(p,requested)}catch(e){render([]);if(st)st.textContent='Scan unavailable.';if(ss)ss.textContent=label(requested)+': blocked/unavailable · '+String(e&&e.message||e)}}
              function wireSources(){var deck=document.getElementById('h38AutomaticDeck');if(!deck)return false;var note=deck.querySelector('.muted.small');if(note)note.textContent='Scout scans resale sources itself. Results and blocked/unavailable status stay inside Scout; no manual-search fallback links.';deck.querySelectorAll('[data-h38-scan]').forEach(function(old){if(old.dataset.h38Strict==='2')return;var b=old.cloneNode(true);b.dataset.h38Strict='2';old.parentNode.replaceChild(b,old);b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();scan(b.dataset.h38Scan||'all')})});var finds=document.getElementById('h38AutoFinds');if(finds&&!finds.__h38StrictObserverV2){finds.__h38StrictObserverV2=true;new MutationObserver(purgeFallbacks).observe(finds,{childList:true,subtree:true})}purgeFallbacks();return true}
              if(!window.__H38BlockManualSourceFallbackV2){window.__H38BlockManualSourceFallbackV2=true;document.addEventListener('click',function(e){var n=e.target;if(!(n instanceof Element))return;var b=n.closest('[data-auto-open]');if(!b||!blockedFallbackUrl(b.dataset.autoOpen))return;e.preventDefault();e.stopImmediatePropagation();var card=b.closest('.h38-auto-card');if(card)card.remove();var st=document.getElementById('h38AutoStatus');if(st)st.textContent='Manual source fallback suppressed. Scout only shows in-app scan results.'},true)}
              window.__H38StrictInAppSourceScanV2=function(){wireSources()};
              function startAutomatic(){if(window.__H38StrictAutoSourceScanV2)return;if(!wireSources()){setTimeout(startAutomatic,500);return}window.__H38StrictAutoSourceScanV2=true;scan('all');setInterval(function(){if(wireSources())scan('all')},120000)}

              function zipState(){try{var z=JSON.parse(localStorage.getItem(ZIP_KEY)||'null');return z&&/^\\d{5}$/.test(String(z.zip||''))&&Number.isFinite(Number(z.lat))&&Number.isFinite(Number(z.lon))?z:null}catch(e){return null}}
              function mode(){try{return localStorage.getItem(LOCATION_MODE_KEY)==='zip'?'zip':'phone'}catch(e){return 'phone'}}
              function setLocationStatus(text,bad){var s=document.getElementById('status');if(!s)return;s.className='notice '+(bad?'bad':'');s.textContent=text}
              function labelZip(z){var l=document.getElementById('locationLabel');if(!l||!z)return;var place=[z.place,z.state].filter(Boolean).join(', ');l.textContent='ZIP '+z.zip+(place?' · '+place:'')}
              function reloadScout(){try{if(window.AndroidH38LocationPatch&&typeof window.AndroidH38LocationPatch.reloadScout==='function'){window.AndroidH38LocationPatch.reloadScout();return}}catch(e){}location.reload()}
              function wrapNativeLocation(){
                if(window.__H38LocationWrappedV1)return true;
                var original=window.H38NativeLocationResult;if(typeof original!=='function')return false;
                var originalError=window.H38NativeLocationError;
                window.__H38LocationWrappedV1=true;
                window.__H38OriginalNativeLocationResult=original;
                window.H38NativeLocationResult=function(lat,lon){var z=zipState();if(mode()==='zip'&&z){original(Number(z.lat),Number(z.lon));setTimeout(function(){labelZip(z)},60);return}original(lat,lon)};
                if(typeof originalError==='function')window.H38NativeLocationError=function(text){var z=zipState();if(mode()==='zip'&&z){window.H38NativeLocationResult(Number(z.lat),Number(z.lon));return}originalError(text)};
                try{var bridge=window.AndroidH38Reseller;if(bridge&&typeof bridge.requestLocation==='function'&&!bridge.__h38ZipWrapped){var nativeRequest=bridge.requestLocation.bind(bridge);bridge.requestLocation=function(){var z=zipState();if(mode()==='zip'&&z){window.H38NativeLocationResult(Number(z.lat),Number(z.lon));return}nativeRequest()};bridge.__h38ZipWrapped=true}}catch(e){}
                return true;
              }
              async function searchZip(input,button){
                var zip=String(input&&input.value||'').replace(/\\D/g,'').slice(0,5);if(input)input.value=zip;
                if(!/^\\d{5}$/.test(zip)){setLocationStatus('Enter a 5-digit ZIP code.','bad');return}
                if(button)button.disabled=true;setLocationStatus('Finding ZIP '+zip+'…',false);
                try{
                  var r=await fetch('https://api.zippopotam.us/us/'+encodeURIComponent(zip),{method:'GET'});if(!r.ok)throw new Error('ZIP not found');
                  var p=await r.json(),place=Array.isArray(p.places)&&p.places.length?p.places[0]:null,lat=Number(place&&place.latitude),lon=Number(place&&place.longitude);if(!place||!Number.isFinite(lat)||!Number.isFinite(lon))throw new Error('ZIP location unavailable');
                  var z={zip:zip,lat:lat,lon:lon,place:String(place['place name']||''),state:String(place['state abbreviation']||place.state||'')};
                  localStorage.setItem(ZIP_KEY,JSON.stringify(z));localStorage.setItem(LOCATION_MODE_KEY,'zip');
                  setLocationStatus('Switching Scout to ZIP '+zip+'…',false);reloadScout();
                }catch(e){setLocationStatus('ZIP search failed: '+String(e&&e.message||e),'bad');if(button)button.disabled=false}
              }
              function installLocationControls(){
                var line=document.querySelector('.location-line'),locate=document.getElementById('locateBtn');if(!line||!locate)return false;
                locate.textContent='Use phone location';
                if(!locate.dataset.h38PhoneMode){locate.dataset.h38PhoneMode='1';locate.addEventListener('click',function(e){if(mode()==='zip'){e.preventDefault();e.stopImmediatePropagation();localStorage.setItem(LOCATION_MODE_KEY,'phone');localStorage.removeItem(ZIP_KEY);setLocationStatus('Switching Scout back to phone location…',false);reloadScout();return}localStorage.setItem(LOCATION_MODE_KEY,'phone');localStorage.removeItem(ZIP_KEY)},true)}
                if(!document.getElementById('h38ZipInput')){
                  var input=document.createElement('input');input.id='h38ZipInput';input.type='text';input.inputMode='numeric';input.autocomplete='postal-code';input.maxLength=5;input.placeholder='ZIP code';input.setAttribute('aria-label','ZIP code');input.style.width='104px';input.style.padding='10px';input.style.border='1px solid #cbd7df';input.style.borderRadius='9px';input.style.background='#fff';
                  var z=zipState();if(z)input.value=String(z.zip||'');
                  var button=document.createElement('button');button.id='h38ZipBtn';button.type='button';button.textContent='Search ZIP';
                  button.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();searchZip(input,button)});
                  input.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();searchZip(input,button)}});
                  line.appendChild(input);line.appendChild(button);
                }
                var z=zipState();if(mode()==='zip'&&z)labelZip(z);
                return true;
              }
              function startLocationPatch(){
                wrapNativeLocation();installLocationControls();
                var z=zipState(),app=document.getElementById('app');
                if(mode()==='zip'&&z&&app&&!app.classList.contains('hidden')&&!window.__H38ZipBootstrappedV1&&wrapNativeLocation()){
                  window.__H38ZipBootstrappedV1=true;window.H38NativeLocationResult(Number(z.lat),Number(z.lon));labelZip(z)
                }
                if(!window.__H38LocationPatchTimerV1)window.__H38LocationPatchTimerV1=setInterval(function(){wrapNativeLocation();installLocationControls()},500);
              }

              wireSources();startAutomatic();startLocationPatch();
              var sourceMarker='H38_STRICT_IN_APP_SOURCE_SCAN_V2',locationMarker='H38_PHONE_OR_ZIP_LOCATION_V1';
            })();
            """;

    private static final class LocationPatchBridge {
        private final Activity activity;
        LocationPatchBridge(Activity activity) { this.activity = activity; }
        @JavascriptInterface public void reloadScout() { activity.runOnUiThread(activity::recreate); }
    }

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
        if (webView != null) {
            webView.addJavascriptInterface(new LocationPatchBridge(activity), "AndroidH38LocationPatch");
            webView.evaluateJavascript(PATCH_JS, null);
        }
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
