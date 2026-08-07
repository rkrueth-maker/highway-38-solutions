(function(){
'use strict';
const BUILD='20260806-2145',C=window.H38_FIELD_VISIT_CORE;if(!C)return;const S=C.state,$=C.$;
const native=/H38SiteScannerAndroid/.test(navigator.userAgent),apple=/iPad|iPhone|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
if(native)document.documentElement.classList.add('h38-native-shell');
if(apple)document.documentElement.classList.add('h38-apple-device');
async function open(opts={}){if(!window.state?.snapshot||!C.business()){C.toast('Open the Business Office and active business first.',true);return}const restored=await C.restore(),requested=C.t(opts.quoteId);S.visit=restored&&(!requested||C.t(restored.quoteId)===requested)?restored:C.blank();if(requested)S.visit.quoteId=requested;if(opts.customerId)S.visit.customerId=opts.customerId;S.open=true;S.tab=S.visit.sessionId?'capture':'job';document.body.classList.add('field-visit-open');await C.load();window.H38_FIELD_VISIT_UI.render()}
function close(){S.open=false;document.body.classList.remove('field-visit-open');$('h38FieldVisitApp')?.remove()}
function title(){return C.t($('mainContent')?.querySelector('.page-head h1')?.textContent)}
function moveQuoteTools(tools,more){
  if(!tools||!more)return;
  Array.from(tools.children).forEach(node=>{
    if(node.id==='h38StartFieldVisit'||node.id==='h38SiteScannerButton'||node.tagName==='INPUT')return;
    node.classList.add('field-overflow-tool');
    more.appendChild(node);
  });
}
function focusQuote(){
  const main=$('mainContent'),tools=main?.querySelector('.page-tools');if(!main||!tools)return;
  document.body.classList.add('field-quote-focused');
  let launch=$('h38FieldQuoteLaunch');
  if(!launch){
    launch=document.createElement('section');launch.id='h38FieldQuoteLaunch';launch.className='field-quote-launch';
    launch.innerHTML=`<div><span class="field-kicker">FIELD-FIRST QUOTE</span><h2>Capture the job before building the quote</h2><p>Photos, measurements and notes stay together online or offline.</p></div><button id="h38StartFieldVisit" class="field-primary">📍 Start Site Visit</button><details class="field-quote-more"><summary>More quote tools</summary><div id="h38QuoteOverflow" class="field-quote-overflow"></div></details>`;
    const head=main.querySelector('.page-head');(head?.nextSibling?main.insertBefore(launch,head.nextSibling):main.prepend(launch));
    $('h38StartFieldVisit').onclick=()=>open({quoteId:C.t(window.state?.quote?.quoteId),customerId:C.t(window.state?.quote?.customerId)});
  }
  moveQuoteTools(tools,$('h38QuoteOverflow'));
  tools.classList.add('field-original-tools-hidden');
}
function entries(){
  const main=$('mainContent');if(!main||!window.state?.snapshot||!C.business())return;
  const page=title(),isQuote=/Quote Builder/i.test(page),isLegacy=/Site Measure|H38 Site Scanner/i.test(page),advanced=Number(window.H38_FIELD_VISIT_ADVANCED_UNTIL||0)>Date.now();
  if(isQuote)focusQuote();else document.body.classList.remove('field-quote-focused');
  if(advanced){
    $('h38SiteScannerButton')?.classList.remove('field-hide-legacy-scanner');
    $('h38SiteScannerPanel')?.classList.remove('field-hide-legacy-scanner');
  }else{
    $('h38SiteScannerButton')?.classList.add('field-hide-legacy-scanner');
    $('h38SiteScannerPanel')?.classList.add('field-hide-legacy-scanner');
  }
  if(isLegacy&&!S.open&&!advanced){open({quoteId:C.t(window.state?.quote?.quoteId),customerId:C.t(window.state?.quote?.customerId)});return}
  if(new URLSearchParams(location.search).get('nativeScanner')==='1'&&!S.auto&&!S.open&&!advanced){S.auto=true;setTimeout(()=>open(),120)}
}
function loadGuidance(){
  if(!document.querySelector('link[data-h38-field-guidance]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='./field-visit-guidance.css?build=20260806-2145';link.dataset.h38FieldGuidance='1';document.head.appendChild(link);
  }
  if(window.H38_FIELD_VISIT_GUIDANCE||document.querySelector('script[data-h38-field-guidance]'))return;
  const script=document.createElement('script');script.src='./field-visit-guidance.js?build=20260806-2145';script.dataset.h38FieldGuidance='1';document.head.appendChild(script);
}
function loadRecovery(){
  if(window.H38_FIELD_VISIT_RECOVERY||document.querySelector('script[data-h38-field-recovery]'))return;
  const script=document.createElement('script');script.src='./field-visit-recovery.js?build=20260806-2100';script.dataset.h38FieldRecovery='1';document.head.appendChild(script);
}
function loadPhotoReview(){
  if(window.H38_FIELD_VISIT_PHOTO_REVIEW||document.querySelector('script[data-h38-field-photo-review]'))return;
  const script=document.createElement('script');script.src='./field-visit-photo-review.js?build=20260806-2145';script.dataset.h38FieldPhotoReview='1';document.head.appendChild(script);
}
function start(){loadGuidance();loadRecovery();loadPhotoReview();const main=$('mainContent');if(main)new MutationObserver(()=>requestAnimationFrame(entries)).observe(main,{childList:true,subtree:true});addEventListener('online',()=>{C.status();C.syncSoon()});addEventListener('offline',C.status);addEventListener('h38:native-scanner-ready',()=>{if(S.open)window.H38_FIELD_VISIT_UI.render()});addEventListener('h38:auth-cleared',close);setInterval(()=>C.pending().catch(()=>{}),5000);entries()}
window.H38_FIELD_VISIT={build:BUILD,open,close,ingestNativeResult:C.ingest,refreshPending:C.pending,offlineFirst:true,databaseAuthority:'existing Supabase Business Office',automaticApproval:false,automaticCustomerSending:false,companyCamStyle:true,appleCapture:true,guidedCapture:true,photoReviewBeforeMeasurements:true,queueRecovery:true};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
