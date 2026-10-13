/* ---- H38 Guided Tour (2026-10-12; F4 behavior fix 2026-10-13) ----
 * On-demand step-by-step walkthrough for business owners.
 *
 * F4 fix — why this file no longer auto-launches:
 * The first-run auto-launch landed seconds AFTER Today was already usable,
 * dimmed the working screen, intercepted every tap (the overlay owned
 * pointer events), and kept saying "Step 1 of 5 — Today screen" after the
 * user navigated elsewhere. The tour now:
 * - NEVER auto-launches. It starts only when the user taps
 *   "Take the office tour" (Settings → Business setup & onboarding),
 *   which lazy-loads this file via window.H38GuidedTourLoader in
 *   index.html — so it adds zero startup cost before usable Today.
 * - Is fully NON-MODAL while open: the overlay never takes pointer
 *   events; only the tour card itself is interactive. Any tap outside
 *   the card dismisses the tour and lands on the app underneath.
 * - Yields on independent navigation: if the app renders a page that is
 *   not the current step's page, the tour ends instead of showing a
 *   stale step label over the wrong screen.
 * - Steps navigate first, then verify window.state.page actually matches
 *   the step before showing the card; a step whose page cannot be shown
 *   ends the tour rather than mislabelling another screen.
 * - Skip / Finish are real buttons (>=44px), plus a separate
 *   "Don't show again" button that persists the opt-out per user +
 *   business in localStorage (the tour's existing preference store,
 *   scoped with the signed-in user's id from H38DB.getUserScope()).
 * - Manual mode emphasized: every step works by hand, Hank is optional.
 */
(function(){
'use strict';

var BUILD = '20261013-guided-tour-f4-1';
var STORE_KEY = 'h38_guided_tour_done';

function $(id){ return document.getElementById(id); }
function businessKey(){
  try{ return String((window.state&&window.state.businessId)||'default'); }catch(e){ return 'default'; }
}
function userKey(){
  try{
    if(window.H38DB && typeof window.H38DB.getUserScope==='function'){
      var u = window.H38DB.getUserScope();
      if(u) return String(u);
    }
  }catch(e){}
  try{
    var raw = localStorage.getItem('sb-jqukmwtsgcsaruucnqja-auth-token');
    var s = raw ? JSON.parse(raw) : null;
    if(s && s.user && s.user.id) return String(s.user.id);
  }catch(e){}
  return 'anon';
}
function storeKey(){ return STORE_KEY+'_'+userKey()+'_'+businessKey(); }
function legacyStoreKey(){ return STORE_KEY+'_'+businessKey(); }
function isDone(){
  try{
    return localStorage.getItem(storeKey())==='1' || localStorage.getItem(legacyStoreKey())==='1';
  }catch(e){ return true; }
}
function markDone(){
  try{ localStorage.setItem(storeKey(),'1'); }catch(e){}
}
function clearDone(){
  try{ localStorage.removeItem(storeKey()); localStorage.removeItem(legacyStoreKey()); }catch(e){}
}

/* ---- Tour step definitions ----
 * page: which Office page to navigate to (via window.openPage)
 * target: CSS selector for the element to spotlight (resolved after page render)
 * title, body: plain-language copy
 */
var STEPS = [
  {
    page:'today',
    target:'#mainContent .page-head, #mainContent',
    title:'This is your Today screen',
    body:'Your whole day at a glance — what needs attention, what\u2019s next, and quick actions. Start here every morning. Everything on this screen also works by hand; Hank just helps.'
  },
  {
    page:'customers',
    target:'#mainContent',
    title:'Add your first customer',
    body:'It takes 30 seconds. Tap \u201cAdd\u201d, type the name and phone, done. You can also paste a whole customer list and check off each one before anything saves.'
  },
  {
    page:'quotes',
    target:'#mainContent',
    title:'Build your first quote',
    body:'Hank can draft a quote from a photo or your price book \u2014 or build it by hand, line by line. You always review before anything goes to the customer. Nothing sends itself.'
  },
  {
    page:'money',
    target:'#mainContent',
    title:'See your money',
    body:'Invoices, payments, and what customers still owe \u2014 all in one place. When a quote is accepted it becomes a job, and the job becomes the invoice. One record follows the work.'
  },
  {
    page:'today',
    target:null,
    title:'You\u2019re set',
    body:'That\u2019s the whole loop: customers \u2192 quotes \u2192 jobs \u2192 money. Find everything in the menu \u2014 Quotes, Customers, Schedule, Money. You can replay this tour anytime from Settings \u2192 Business setup & onboarding \u2192 \u201cTake the office tour\u201d.'
  }
];

var current = -1;
var overlay = null;

function ensureOverlay(){
  if(overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'h38TourOverlay';
  overlay.innerHTML =
    '<div class="h38-tour-spot" id="h38TourSpot"></div>'+
    '<div class="h38-tour-card" id="h38TourCard" role="dialog" aria-modal="false" aria-labelledby="h38TourTitle">'+
      '<div class="h38-tour-progress" id="h38TourProgress"></div>'+
      '<h2 id="h38TourTitle"></h2>'+
      '<p id="h38TourBody"></p>'+
      '<p class="h38-tour-manual">Every step works by hand \u2014 Hank is optional. Tap anywhere outside this card to leave the tour and use the app.</p>'+
      '<div class="h38-tour-actions">'+
        '<button type="button" class="h38-tour-skip" id="h38TourSkip">Skip tour</button>'+
        '<button type="button" class="h38-tour-never" id="h38TourNever">Don\u2019t show again</button>'+
        '<span class="h38-tour-nav">'+
          '<button type="button" class="secondary" id="h38TourBack">Back</button>'+
          '<button type="button" class="primary" id="h38TourNext">Next</button>'+
        '</span>'+
      '</div>'+
    '</div>';
  document.body.appendChild(overlay);
  $('h38TourSkip').addEventListener('click',function(){ endTour(false); });
  $('h38TourNever').addEventListener('click',function(){ endTour(true); });
  $('h38TourBack').addEventListener('click',function(){ goTo(current-1); });
  $('h38TourNext').addEventListener('click',function(){
    if(current===STEPS.length-1){ endTour(true); return; }
    goTo(current+1);
  });
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape' && overlay && overlay.classList.contains('open')) endTour(false);
  });
  // Non-modal yield: any real interaction outside the card dismisses the
  // tour and is NOT swallowed — the listener is observe-only (capture
  // phase, no preventDefault/stopPropagation), so the tap still lands
  // on the app control underneath.
  document.addEventListener('pointerdown',function(e){
    if(!overlay || !overlay.classList.contains('open')) return;
    var card = $('h38TourCard');
    if(card && !card.contains(e.target)) endTour(false);
  },true);
  // Yield on independent navigation: a rendered page that is not the
  // current step's page means the user (or the app) moved on — end the
  // tour instead of leaving a stale step label over the new screen.
  window.addEventListener('h38:office-page-rendered',function(e){
    if(!overlay || !overlay.classList.contains('open') || current<0) return;
    var page = (e && e.detail && e.detail.page) || (window.state && window.state.page);
    if(page && page!==STEPS[current].page) endTour(false);
  });
  return overlay;
}

function positionSpotlight(step){
  var spot = $('h38TourSpot');
  var card = $('h38TourCard');
  if(!spot||!card) return;
  var el = step.target ? document.querySelector(step.target) : null;
  // Fallback: if target missing, spotlight the main content area
  if(!el) el = $('mainContent');
  if(!el){ spot.style.display='none'; positionCardCenter(card); return; }
  try{
    var r = el.getBoundingClientRect();
    var pad = 8;
    var top = Math.max(0, r.top - pad + window.scrollY);
    var left = Math.max(0, r.left - pad);
    var w = Math.min(r.width + pad*2, window.innerWidth - left - 8);
    var h = Math.min(r.height + pad*2, 320);
    // Don't spotlight the entire page — cap height and center on top portion
    spot.style.display='block';
    spot.style.top = top+'px';
    spot.style.left = left+'px';
    spot.style.width = w+'px';
    spot.style.height = h+'px';
    // Position card below the spotlight, or centered if no room.
    // On phone, CSS makes it a bottom sheet — skip JS positioning.
    if(window.innerWidth > 640){
      var cardTop = top + h + 16;
      if(cardTop + 280 > window.innerHeight + window.scrollY){
        cardTop = Math.max(16, top - 300);
      }
      card.style.top = cardTop+'px';
      card.style.left = '50%';
      card.style.transform = 'translateX(-50%)';
    } else {
      // Clear any inline positioning so the bottom-sheet CSS takes over
      card.style.top=''; card.style.left=''; card.style.transform='';
    }
  }catch(e){
    spot.style.display='none';
    positionCardCenter(card);
  }
}

function positionCardCenter(card){
  if(window.innerWidth <= 640){ card.style.top=''; card.style.left=''; card.style.transform=''; return; }
  card.style.top = '50%';
  card.style.left = '50%';
  card.style.transform = 'translate(-50%,-50%)';
}

function renderStep(){
  var step = STEPS[current];
  if(!step){ endTour(false); return; }
  ensureOverlay();
  $('h38TourTitle').textContent = step.title;
  $('h38TourBody').textContent = step.body;
  $('h38TourProgress').textContent = 'Step '+(current+1)+' of '+STEPS.length;
  $('h38TourBack').style.visibility = current===0 ? 'hidden' : 'visible';
  $('h38TourNext').textContent = current===STEPS.length-1 ? 'Finish' : 'Next';
  overlay.classList.add('open');
  // Give the page a beat to render, then position — and verify the app
  // really is on this step's page. If navigation landed elsewhere (page
  // not allowed for this role/business), never show a stale label: end.
  var shownStep = current;
  setTimeout(function(){
    if(current!==shownStep || !overlay.classList.contains('open')) return;
    try{
      if(window.state && window.state.page && window.state.page!==STEPS[shownStep].page){
        endTour(false);
        return;
      }
    }catch(e){}
    positionSpotlight(STEPS[shownStep]);
  }, 350);
  // Reposition on resize/scroll during tour
  window.addEventListener('resize', reposition);
  window.addEventListener('scroll', reposition, {passive:true});
}

function reposition(){
  if(current<0||!overlay||!overlay.classList.contains('open')) return;
  try{
    if(window.state && window.state.page && window.state.page!==STEPS[current].page){
      endTour(false);
      return;
    }
  }catch(e){}
  positionSpotlight(STEPS[current]);
}

function goTo(n){
  if(n<0){ return; }
  if(n>=STEPS.length){ endTour(true); return; }
  current = n;
  var step = STEPS[n];
  // Navigate to the step's page, then render
  try{
    if(typeof window.openPage==='function' && (!window.state || window.state.page!==step.page)){
      window.openPage(step.page);
    }
  }catch(e){}
  renderStep();
}

function startTour(){
  // On-demand only. There is deliberately no auto-launch path in this
  // file: nothing in the app may call start() except the explicit
  // "Take the office tour" entry (window.H38GuidedTourLoader in
  // index.html wires [data-h38-tour] clicks to it).
  if(overlay && overlay.classList.contains('open')) return;
  current = -1;
  goTo(0);
}

function endTour(persistDone){
  if(persistDone) markDone();
  current = -1;
  if(overlay) overlay.classList.remove('open');
  window.removeEventListener('resize', reposition);
  window.removeEventListener('scroll', reposition);
}

/* ---- Public API ---- */
window.H38GuidedTour = {
  start: startTour,
  end: function(){ endTour(false); },
  dismissForever: function(){ endTour(true); },
  isDone: isDone,
  reset: clearDone,
  BUILD: BUILD
};

})();

