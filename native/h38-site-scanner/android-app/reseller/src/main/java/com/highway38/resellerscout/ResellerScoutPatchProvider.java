package com.highway38.resellerscout;

import android.app.Activity;
import android.app.Application;
import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

public final class ResellerScoutPatchProvider extends ContentProvider implements Application.ActivityLifecycleCallbacks {
    private static final String SOURCE_MARKER = "H38_RESALE_OPPORTUNITY_ENGINE_V1";
    private static final String FACEBOOK_MARKER = "H38_FACEBOOK_NOTIFICATION_INGEST_V1";
    private static final String LOCATION_MARKER = "H38_PHONE_OR_ZIP_LOCATION_V2";
    private final Handler main = new Handler(Looper.getMainLooper());

    private static final String PATCH_JS = """
            (function(){
              'use strict';
              if(window.__H38ResaleOpportunityEngineV1){if(window.__H38OpportunityRefreshV1)window.__H38OpportunityRefreshV1();return}
              window.__H38ResaleOpportunityEngineV1=true;
              window.__H38AutomaticOpportunityV4=true;
              window.__H38StrictAutoSourceScanV2=true;

              var ENDPOINT='https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/reseller-opportunity-scan';
              var SBKEY='sb_publishable_XrF41kGmTC2SmSTgPvo5OQ_vqcBd0N1';
              var DEFAULT_TERMS=['tools','Milwaukee','DeWalt','Snap-on','generator','welder','toolbox','zero turn','pressure washer'];
              var WATCH_KEY='h38_reseller_watch_terms_v2',SHARED_KEY='h38_reseller_shared_opportunities_v1';
              var ZIP_KEY='h38_reseller_zip_search_v1',LOCATION_MODE_KEY='h38_reseller_location_mode_v1';
              var scanBusy=false,lastScanAt=0,lastRequested='all';
              var FLYERS={
                'home depot':'https://www.homedepot.com/SpecialBuy/SpecialBuyOfTheDay',
                "lowe's":'https://www.lowes.com/l/savings','lowes':'https://www.lowes.com/l/savings',
                'walmart':'https://www.walmart.com/shop/deals','target':'https://www.target.com/c/weekly-ad/-/N-4ykuc',
                'menards':'https://www.menards.com/main/flyer.html','fleet farm':'https://www.fleetfarm.com/sitewide/weekly-ad',
                'l&m fleet supply':'https://www.landmsupply.com/weekly-ad','harbor freight':'https://www.harborfreight.com/coupons-deals.html',
                'tractor supply':'https://www.tractorsupply.com/tsc/cms/weekly-ad','dollar general':'https://www.dollargeneral.com/weekly-ad',
                'dollar tree':'https://www.dollartree.com/weekly-ads','family dollar':'https://www.familydollar.com/weekly-ads',
                'northern tool':'https://www.northerntool.com/sale','ace hardware':'https://www.acehardware.com/ace-rewards-instant-savings',
                'autozone':'https://www.autozone.com/lp/deals',"o'reilly auto parts":'https://www.oreillyauto.com/specials',
                'napa auto parts':'https://www.napaonline.com/en/deals','advance auto parts':'https://shop.advanceautoparts.com/o/special-offers',
                'best buy':'https://www.bestbuy.com/site/top-deals/pcmcat1563299784494.c','walgreens':'https://www.walgreens.com/topic/promotion/weeklyad.jsp',
                'cvs':'https://www.cvs.com/weeklyad',"kohl's":'https://www.kohls.com/sale-event/coupons-deals.jsp','jcpenney':'https://www.jcpenney.com/m/deals'
              };

              function esc(v){return String(v==null?'':v).replace(/[&<>\"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'})[c]})}
              function loadArray(key){try{var x=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(x)?x:[]}catch(e){return[]}}
              function money(v){var n=Number(v);return Number.isFinite(n)&&n>0?'$'+n.toFixed(2):'—'}
              function pct(v){var n=Number(v);return Number.isFinite(n)?Math.round(n)+'%':'—'}
              function terms(){var x=loadArray(WATCH_KEY);return x.length?x.slice(0,12):DEFAULT_TERMS.slice()}
              function token(){try{var raw=localStorage.getItem('sb-jqukmwtsgcsaruucnqja-auth-token');var p=raw?JSON.parse(raw):null;return p&&p.access_token?String(p.access_token):''}catch(e){return''}}
              function headers(){var t=token(),h={'content-type':'application/json','apikey':SBKEY};if(t)h.authorization='Bearer '+t;return h}
              function zipState(){try{var z=JSON.parse(localStorage.getItem(ZIP_KEY)||'null');return z&&/^\\d{5}$/.test(String(z.zip||''))&&Number.isFinite(Number(z.lat))&&Number.isFinite(Number(z.lon))?z:null}catch(e){return null}}
              function mode(){try{return localStorage.getItem(LOCATION_MODE_KEY)==='zip'?'zip':'phone'}catch(e){return 'phone'}}
              function cachedPoint(){try{var raw=JSON.parse(localStorage.getItem('h38_reseller_last_store_response_v1')||'null');var q=raw&&JSON.parse(String(raw.requestBody||'{}'));var lat=Number(q&&q.lat),lon=Number(q&&q.lon);return Number.isFinite(lat)&&Number.isFinite(lon)?{lat:lat,lon:lon}:null}catch(e){return null}}
              function locationContext(){var z=zipState(),p=(mode()==='zip'&&z)?z:(window.__H38OpportunityLocationV1||cachedPoint()||{}),r=Number((document.getElementById('radius')||{}).value||50);if(![25,50,100,150].includes(r))r=50;return {lat:Number(p.lat),lon:Number(p.lon),postal:(mode()==='zip'&&z)?String(z.zip):'',radiusMiles:r}}
              function setLocationStatus(text,bad){var s=document.getElementById('status');if(!s)return;s.className='notice '+(bad?'bad':'');s.textContent=text}
              function labelZip(z){var l=document.getElementById('locationLabel');if(!l||!z)return;var place=[z.place,z.state].filter(Boolean).join(', ');l.textContent='ZIP '+z.zip+(place?' · '+place:'')}
              function reloadScout(){try{if(window.AndroidH38LocationPatch&&typeof window.AndroidH38LocationPatch.reloadScout==='function'){window.AndroidH38LocationPatch.reloadScout();return}}catch(e){}location.reload()}

              function style(){if(document.getElementById('h38OpportunityStyleV1'))return;var s=document.createElement('style');s.id='h38OpportunityStyleV1';s.textContent='.h38-auto-deck{margin:10px 0;padding:11px;border:1px solid #cbd7df;border-radius:12px;background:#f8fbfd}.h38-auto-deck h3{margin:0 0 5px;font-size:15px}.h38-source-buttons{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.h38-source-buttons button{padding:7px 9px;font-size:12px}.h38-auto-status{font-size:11px;margin-top:5px}.h38-watch-chips{display:flex;gap:5px;flex-wrap:wrap;margin:7px 0}.h38-watch-chip{font-size:11px;padding:4px 7px;border-radius:999px;background:#e7eef3}.h38-opportunity{display:grid;grid-template-columns:80px 1fr;gap:9px;padding:10px;border:1px solid #d6e0e7;border-radius:10px;margin-top:8px;background:#fff}.h38-opportunity img{width:80px;height:80px;object-fit:cover;border-radius:8px;background:#eef3f7}.h38-opportunity.noimg{grid-template-columns:1fr}.h38-opp-title{font-weight:850}.h38-opp-grade{display:inline-block;padding:3px 7px;border-radius:999px;background:#e9eef2;font-size:10px;font-weight:900}.h38-opp-grade.good{background:#dff5e8;color:#126132}.h38-opp-grade.comp{background:#fff0d6;color:#7a4c00}.h38-opp-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin:7px 0}.h38-opp-stat{padding:6px;background:#f4f7f9;border-radius:7px}.h38-opp-stat strong{display:block;font-size:13px}.h38-opp-stat span{font-size:9px;color:#607180}.h38-fb-access{padding:8px;border-radius:9px;background:#eef4f8;margin-top:7px;font-size:12px}.h38-stock-summary{margin-top:8px;padding:8px;border-radius:9px;background:#eef4f8;font-size:12px}.h38-flyer{margin:7px 8px 10px;padding:8px;border:1px dashed #a8bac6;border-radius:9px;background:#f6fafc}.h38-flyer button{font-size:12px;padding:6px 9px}@media(max-width:650px){.h38-opp-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}';document.head.appendChild(s)}
              function renderWatches(){var h=document.getElementById('h38WatchChips');if(!h)return;var xs=terms();h.innerHTML=xs.map(function(x){return '<span class="h38-watch-chip">'+esc(x)+'</span>'}).join('')}
              function fbBridge(){return window.AndroidH38Facebook||null}
              function notificationEnabled(){try{return !!(fbBridge()&&fbBridge().notificationAccessEnabled())}catch(e){return false}}
              function facebookCandidates(){var out=[];try{var raw=fbBridge()&&fbBridge().facebookCandidates();var a=JSON.parse(String(raw||'[]'));if(Array.isArray(a))out=out.concat(a)}catch(e){}var shared=loadArray(SHARED_KEY);shared.forEach(function(x){var text=String(x.text||''),src=String(x.source||'').toLowerCase(),url=String(x.url||'');if(src.indexOf('facebook')<0&&url.indexOf('facebook.com/marketplace')<0&&text.toLowerCase().indexOf('marketplace')<0)return;out.push({id:'shared:'+String(x.at||x.url||text).slice(0,80),source:'Facebook Marketplace',title:text,text:text,url:url,price:null,posted_at:Number(x.at||Date.now()),shared:true,can_open:!!url})});var seen=new Set();return out.filter(function(x){var k=String(x.id||x.url||x.title||x.text);if(!k||seen.has(k))return false;seen.add(k);return true}).slice(0,80)}
              function renderFacebookAccess(){var h=document.getElementById('h38FacebookAccess');if(!h)return;var rows=facebookCandidates();if(notificationEnabled()){h.innerHTML='<strong>Facebook Marketplace:</strong> phone notification access enabled · '+rows.length+' Marketplace alert'+(rows.length===1?'':'s')+' captured.';return}h.innerHTML='<strong>Facebook Marketplace:</strong> enable notification access once so Scout can analyze Marketplace alerts from your logged-in Facebook app. <button id="h38EnableFacebook" type="button">Enable Facebook alerts</button>';var b=document.getElementById('h38EnableFacebook');if(b)b.onclick=function(e){e.preventDefault();try{fbBridge().openNotificationAccessSettings()}catch(x){}}}
              function renderStockSummary(){var h=document.getElementById('h38StockSummary');if(!h)return;var obj={};try{obj=JSON.parse(localStorage.getItem('h38_reseller_stock_results_v1')||'{}')||{}}catch(e){}var vals=Object.keys(obj).map(function(k){return obj[k]||{}}),blocked=0,unavailable=0,qty=0,price=0,usable=0;vals.forEach(function(p){if(p.status==='retailer_blocked')blocked++;else if(p.status==='check_failed'||p.status==='store_not_resolved'||p.status==='unsupported')unavailable++;else if(p.stock_checked)usable++;if(p.stock_count!==null&&p.stock_count!==undefined&&p.stock_count!=='')qty++;if(Number(p.current_price)>0)price++});h.textContent='Price/qty checks: '+vals.length+' attempted · '+price+' prices · '+qty+' exact quantities · '+usable+' usable availability · '+blocked+' blocked · '+unavailable+' unavailable'}
              function retailerName(d){var t=String(d&&d.textContent||'').toLowerCase(),keys=Object.keys(FLYERS);for(var i=0;i<keys.length;i++)if(t.indexOf(keys[i])>=0)return keys[i];return ''}
              function fallbackFlyerUrl(d){var name=String(d&&d.querySelector('summary')&&d.querySelector('summary').textContent||d&&d.textContent||'store').trim().replace(/\\s+/g,' ');return 'https://www.google.com/search?q='+encodeURIComponent(name+' weekly ad flyer deals')}
              function decorateStoreFlyers(){var list=document.getElementById('storeList');if(!list)return;Array.from(list.querySelectorAll('details.store,details[data-store-key]')).forEach(function(d){if(d.querySelector('.h38-flyer'))return;var key=retailerName(d),url=key?FLYERS[key]:fallbackFlyerUrl(d),name=String(d.querySelector('summary')&&d.querySelector('summary').textContent||'Store').trim().replace(/\\s+/g,' ');var box=document.createElement('div');box.className='h38-flyer';box.innerHTML='<div class="small"><strong>Ad / flyer source</strong> · sale source for this store.</div><div class="actions"><button data-flyer-open="'+esc(url)+'">Open '+esc(name)+' ad / deals</button></div>';d.appendChild(box);var b=box.querySelector('[data-flyer-open]');if(b)b.onclick=function(e){e.preventDefault();e.stopPropagation();window.location.href=b.dataset.flyerOpen}})}
              function installDeck(){style();var list=document.getElementById('storeList');if(!list||!list.parentNode)return false;var d=document.getElementById('h38AutomaticDeck');if(!d){d=document.createElement('section');d.id='h38AutomaticDeck';d.className='card h38-auto-deck';list.parentNode.insertBefore(d,list)}if(d.dataset.h38Engine!=='1'){d.dataset.h38Engine='1';d.innerHTML='<h3>Resale opportunity analyzer</h3><div class="muted small">Scout searches near the selected phone/ZIP location, rejects incomplete listings, checks resale comps when available, and ranks estimated profit. Facebook comes from your logged-in phone alerts — not anonymous scraping.</div><div class="h38-source-buttons"><button data-h38-scan="all">Scan all</button><button data-h38-scan="Facebook Marketplace">Facebook alerts</button><button data-h38-scan="HiBid">Auctions</button><button data-h38-scan="Craigslist">Craigslist</button></div><div id="h38FacebookAccess" class="h38-fb-access"></div><div id="h38WatchChips" class="h38-watch-chips"></div><div id="h38AutoStatus" class="h38-auto-status muted">Opportunity engine ready.</div><div id="h38SourceStatus" class="h38-auto-status muted"></div><div id="h38StockSummary" class="h38-stock-summary"></div><div id="h38AutoFinds"></div>';d.querySelectorAll('[data-h38-scan]').forEach(function(b){b.onclick=function(e){e.preventDefault();e.stopPropagation();scan(true,b.dataset.h38Scan||'all')}})}renderWatches();renderFacebookAccess();renderStockSummary();decorateStoreFlyers();return true}
              function grade(x){if(Number(x.net_profit)>0&&Number(x.roi_pct)>=50)return ['GOOD BUY','good'];if(Number(x.net_profit)>0&&Number(x.roi_pct)>=25)return ['POSSIBLE','good'];if(x.needs_comp)return ['NEEDS COMP','comp'];return ['WATCH','']}
              function renderFinds(rows){var h=document.getElementById('h38AutoFinds');if(!h)return;rows=Array.isArray(rows)?rows:[];if(!rows.length){h.innerHTML='<div class="muted small" style="margin-top:8px">No qualified resale opportunities returned. Scout is intentionally hiding incomplete/noise listings.</div>';return}h.innerHTML=rows.slice(0,32).map(function(x){var g=grade(x),img=String(x.image_url||''),dist=Number(x.distance_miles),distText=Number.isFinite(dist)?dist.toFixed(1)+' mi':(x.location_label||'location not verified'),buy=x.estimated_all_in||x.buy_price||x.price,resale=x.resale_estimate,profit=x.net_profit,roi=x.roi_pct,source=String(x.source||'Source'),age=x.age_label||x.closing_label||'',open='';if(x.notification_id)open='<button data-fb-open="'+esc(x.notification_id)+'">Open Facebook notification</button>';else if(x.url)open='<button data-auto-open="'+esc(x.url)+'">Open original listing</button>';var meta=[source,distText,age,x.comp_confidence?('comp '+x.comp_confidence):'',x.buyer_premium_estimated?'auction premium estimated':''].filter(Boolean).join(' · ');return '<div class="h38-opportunity '+(img?'':'noimg')+'">'+(img?'<img src="'+esc(img)+'" alt="">':'')+'<div><div><span class="h38-opp-grade '+g[1]+'">'+g[0]+'</span></div><div class="h38-opp-title">'+esc(x.title||'Listing')+'</div><div class="small muted">'+esc(meta)+'</div><div class="h38-opp-grid"><div class="h38-opp-stat"><strong>'+money(buy)+'</strong><span>EST. COST</span></div><div class="h38-opp-stat"><strong>'+money(resale)+'</strong><span>EST. RESALE</span></div><div class="h38-opp-stat"><strong>'+money(profit)+'</strong><span>EST. NET</span></div><div class="h38-opp-stat"><strong>'+pct(roi)+'</strong><span>ROI</span></div></div>'+(x.needs_comp?'<div class="small muted">No dependable sold comp yet; this candidate is not being called profitable.</div>':'')+(open?'<div class="actions">'+open+'</div>':'')+'</div></div>'}).join('');h.querySelectorAll('[data-auto-open]').forEach(function(b){b.onclick=function(e){e.preventDefault();window.location.href=b.dataset.autoOpen}});h.querySelectorAll('[data-fb-open]').forEach(function(b){b.onclick=function(e){e.preventDefault();try{var ok=fbBridge().openFacebookNotification(String(b.dataset.fbOpen||''));if(!ok){var s=document.getElementById('h38SourceStatus');if(s)s.textContent='That Facebook notification is no longer active. Wait for the next Marketplace alert or share the listing to Scout.'}}catch(x){}}})}
              function sourceStatus(p){var h=document.getElementById('h38SourceStatus');if(!h)return;var s=p&&p.source_summary||{},parts=[];Object.keys(s).forEach(function(k){var x=s[k]||{},m=Number(x.matches||0),f=Number(x.failed||0),q=Number(x.qualified||0);parts.push(k+': '+m+' found · '+q+' qualified'+(f?' · '+f+' blocked/failed':''))});if(lastRequested==='Facebook Marketplace'&&!notificationEnabled())parts.unshift('Facebook: notification access required');h.textContent=parts.join(' | ')||'No source status returned.'}
              async function scan(force,requested){if(!installDeck())return;if(scanBusy)return;var now=Date.now();if(!force&&now-lastScanAt<120000)return;scanBusy=true;lastScanAt=now;lastRequested=requested||'all';var st=document.getElementById('h38AutoStatus'),ctx=locationContext(),fb=facebookCandidates();if(st)st.textContent='Analyzing resale opportunities near '+(mode()==='zip'&&zipState()?('ZIP '+zipState().zip):'phone location')+'…';try{var body={terms:terms(),lat:Number.isFinite(ctx.lat)?ctx.lat:null,lon:Number.isFinite(ctx.lon)?ctx.lon:null,radiusMiles:ctx.radiusMiles,postal:ctx.postal,facebookCandidates:fb};if(lastRequested!=='all')body.sources=[lastRequested];else body.sources=['Craigslist','HiBid','Facebook Marketplace'];var r=await fetch(ENDPOINT,{method:'POST',headers:headers(),body:JSON.stringify(body)}),p=await r.json().catch(function(){return{}});if(!r.ok)throw new Error((p&&p.error)||('HTTP '+r.status));renderFinds(p&&p.opportunities);sourceStatus(p);if(st)st.textContent='Opportunity scan complete · '+Number((p&&p.candidates_checked)||0)+' candidates checked · '+Number((p&&p.opportunities&&p.opportunities.length)||0)+' qualified.'}catch(e){renderFinds([]);if(st)st.textContent='Opportunity scan unavailable.';var ss=document.getElementById('h38SourceStatus');if(ss)ss.textContent=String(e&&e.message||e)}finally{scanBusy=false;renderFacebookAccess();renderStockSummary();decorateStoreFlyers()}}

              function wrapNativeLocation(){if(window.__H38LocationWrappedV2)return true;var original=window.H38NativeLocationResult;if(typeof original!=='function')return false;var originalError=window.H38NativeLocationError;window.__H38LocationWrappedV2=true;window.__H38OriginalNativeLocationResult=original;window.H38NativeLocationResult=function(lat,lon){var z=zipState();if(mode()==='zip'&&z){window.__H38OpportunityLocationV1={lat:Number(z.lat),lon:Number(z.lon)};original(Number(z.lat),Number(z.lon));setTimeout(function(){labelZip(z)},60);return}window.__H38OpportunityLocationV1={lat:Number(lat),lon:Number(lon)};original(lat,lon)};if(typeof originalError==='function')window.H38NativeLocationError=function(text){var z=zipState();if(mode()==='zip'&&z){window.H38NativeLocationResult(Number(z.lat),Number(z.lon));return}originalError(text)};try{var bridge=window.AndroidH38Reseller;if(bridge&&typeof bridge.requestLocation==='function'&&!bridge.__h38ZipWrappedV2){var nativeRequest=bridge.requestLocation.bind(bridge);bridge.requestLocation=function(){var z=zipState();if(mode()==='zip'&&z){window.H38NativeLocationResult(Number(z.lat),Number(z.lon));return}nativeRequest()};bridge.__h38ZipWrappedV2=true}}catch(e){}return true}
              async function searchZip(input,button){var zip=String(input&&input.value||'').replace(/\\D/g,'').slice(0,5);if(input)input.value=zip;if(!/^\\d{5}$/.test(zip)){setLocationStatus('Enter a 5-digit ZIP code.',true);return}if(button)button.disabled=true;setLocationStatus('Finding ZIP '+zip+'…',false);try{var r=await fetch('https://api.zippopotam.us/us/'+encodeURIComponent(zip),{method:'GET'});if(!r.ok)throw new Error('ZIP not found');var p=await r.json(),place=Array.isArray(p.places)&&p.places.length?p.places[0]:null,lat=Number(place&&place.latitude),lon=Number(place&&place.longitude);if(!place||!Number.isFinite(lat)||!Number.isFinite(lon))throw new Error('ZIP location unavailable');var z={zip:zip,lat:lat,lon:lon,place:String(place['place name']||''),state:String(place['state abbreviation']||place.state||'')};localStorage.setItem(ZIP_KEY,JSON.stringify(z));localStorage.setItem(LOCATION_MODE_KEY,'zip');setLocationStatus('Switching Scout to ZIP '+zip+'…',false);reloadScout()}catch(e){setLocationStatus('ZIP search failed: '+String(e&&e.message||e),true);if(button)button.disabled=false}}
              function installLocationControls(){var line=document.querySelector('.location-line'),locate=document.getElementById('locateBtn');if(!line||!locate)return false;locate.textContent='Use phone location';if(!locate.dataset.h38PhoneModeV2){locate.dataset.h38PhoneModeV2='1';locate.addEventListener('click',function(e){if(mode()==='zip'){e.preventDefault();e.stopImmediatePropagation();localStorage.setItem(LOCATION_MODE_KEY,'phone');localStorage.removeItem(ZIP_KEY);setLocationStatus('Switching Scout back to phone location…',false);reloadScout();return}localStorage.setItem(LOCATION_MODE_KEY,'phone');localStorage.removeItem(ZIP_KEY)},true)}if(!document.getElementById('h38ZipInput')){var input=document.createElement('input');input.id='h38ZipInput';input.type='text';input.inputMode='numeric';input.autocomplete='postal-code';input.maxLength=5;input.placeholder='ZIP code';input.setAttribute('aria-label','ZIP code');input.style.width='104px';input.style.padding='10px';input.style.border='1px solid #cbd7df';input.style.borderRadius='9px';input.style.background='#fff';var z=zipState();if(z)input.value=String(z.zip||'');var button=document.createElement('button');button.id='h38ZipBtn';button.type='button';button.textContent='Search ZIP';button.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();searchZip(input,button)});input.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();searchZip(input,button)}});line.appendChild(input);line.appendChild(button)}var z=zipState();if(mode()==='zip'&&z)labelZip(z);return true}
              function startLocationPatch(){wrapNativeLocation();installLocationControls();var z=zipState(),app=document.getElementById('app');if(mode()==='zip'&&z&&app&&!app.classList.contains('hidden')&&!window.__H38ZipBootstrappedV2&&wrapNativeLocation()){window.__H38ZipBootstrappedV2=true;window.H38NativeLocationResult(Number(z.lat),Number(z.lon));labelZip(z)}if(!window.__H38LocationPatchTimerV2)window.__H38LocationPatchTimerV2=setInterval(function(){wrapNativeLocation();installLocationControls()},500)}

              window.__H38OpportunityRefreshV1=function(){installDeck();renderFacebookAccess();renderStockSummary();decorateStoreFlyers()};
              window.H38AutomaticRefresh=window.__H38OpportunityRefreshV1;
              startLocationPatch();
              function boot(){if(!installDeck()){setTimeout(boot,500);return}scan(false,'all');if(!window.__H38OpportunityTimerV1)window.__H38OpportunityTimerV1=setInterval(function(){scan(false,'all');renderFacebookAccess();renderStockSummary();decorateStoreFlyers()},120000)}
              boot();
              var sourceMarker='H38_RESALE_OPPORTUNITY_ENGINE_V1',facebookMarker='H38_FACEBOOK_NOTIFICATION_INGEST_V1',locationMarker='H38_PHONE_OR_ZIP_LOCATION_V2';
            })();
            """;

    private static final class PatchBridge {
        private final Activity activity;
        PatchBridge(Activity activity) { this.activity = activity; }

        @JavascriptInterface public void reloadScout() {
            activity.runOnUiThread(activity::recreate);
        }

        @JavascriptInterface public boolean notificationAccessEnabled() {
            try {
                String enabled = Settings.Secure.getString(activity.getContentResolver(), "enabled_notification_listeners");
                return enabled != null && enabled.contains(activity.getPackageName());
            } catch (Exception ignored) { return false; }
        }

        @JavascriptInterface public void openNotificationAccessSettings() {
            activity.runOnUiThread(() -> {
                try {
                    Intent i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
                    activity.startActivity(i);
                } catch (Exception ignored) {}
            });
        }

        @JavascriptInterface public String facebookCandidates() {
            return FacebookMarketplaceNotificationListener.rowsJson(activity);
        }

        @JavascriptInterface public boolean openFacebookNotification(String id) {
            return FacebookMarketplaceNotificationListener.open(id);
        }
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
            PatchBridge bridge = new PatchBridge(activity);
            webView.addJavascriptInterface(bridge, "AndroidH38LocationPatch");
            webView.addJavascriptInterface(bridge, "AndroidH38Facebook");
            webView.evaluateJavascript(PATCH_JS, null);
        }
    }

    @Override public void onActivityResumed(Activity activity) {
        inject(activity);
        main.postDelayed(() -> inject(activity), 500);
        main.postDelayed(() -> inject(activity), 1500);
        main.postDelayed(() -> inject(activity), 3200);
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
