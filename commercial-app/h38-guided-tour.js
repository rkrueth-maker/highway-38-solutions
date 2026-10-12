/* ---- H38 Guided Tour (2026-10-12) ----
 * First-run step-by-step walkthrough for new business owners.
 *
 * Rules:
 * - Never blocks: Skip is always one tap away, Escape also exits.
 * - Manual mode emphasized: every step works by hand, Hank is optional.
 * - First-run auto-launch via localStorage; "Replay tour" in Settings.
 * - Spotlight highlights the real UI element; tooltip explains in plain language.
 */
(function(){
'use strict';

var BUILD = '20261012-guided-tour-1';
var STORE_KEY = 'h38_guided_tour_done';

function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function $(id){ return document.getElementById(id); }
function businessKey(){
  try{ return String((window.state&&window.state.businessId)||'default'); }catch(e){ return 'default'; }
}
function storeKey(){ return STORE_KEY+'_'+businessKey(); }
function isDone(){
  try{ return localStorage.getItem(storeKey())==='1'; }catch(e){ return true; }
}
function markDone(){
  try{ localStorage.setItem(storeKey(),'1'); }catch(e){}
}
function clearDone(){
  try{ localStorage.removeItem(storeKey()); }catch(e){}
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
    body:'That\u2019s the whole loop: customers \u2192 quotes \u2192 jobs \u2192 money. Find everything in the menu \u2014 Quotes, Customers, Schedule, Money. You can replay this tour anytime from Settings.'
  }
];

var current = -1;
var overlay = null;

function ensureOverlay(){
  if(overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'h38TourOverlay';
  overlay.innerHTML =
    '<div class="h38-tour-dim" data-tour-skip></div>'+
    '<div class="h38-tour-spot" id="h38TourSpot"></div>'+
    '<div class="h38-tour-card" id="h38TourCard" role="dialog" aria-modal="true" aria-labelledby="h38TourTitle">'+
      '<div class="h38-tour-progress" id="h38TourProgress"></div>'+
      '<h2 id="h38TourTitle"></h2>'+
      '<p id="h38TourBody"></p>'+
      '<p class="h38-tour-manual">Every step works by hand \u2014 Hank is optional.</p>'+
      '<div class="h38-tour-actions">'+
        '<button type="button" class="h38-tour-skip" data-tour-skip>Skip tour</button>'+
        '<span class="h38-tour-nav">'+
          '<button type="button" class="secondary" id="h38TourBack">Back</button>'+
          '<button type="button" class="primary" id="h38TourNext">Next</button>'+
        '</span>'+
      '</div>'+
    '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click',function(e){
    if(e.target.closest('[data-tour-skip]')){ endTour(); return; }
  });
  $('h38TourBack').addEventListener('click',function(){ goTo(current-1); });
  $('h38TourNext').addEventListener('click',function(){ goTo(current+1); });
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape' && overlay && overlay.classList.contains('open')) endTour();
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
    // Position card below the spotlight, or centered if no room
    var cardTop = top + h + 16;
    if(cardTop + 280 > window.innerHeight + window.scrollY){
      cardTop = Math.max(16, top - 300);
    }
    card.style.top = cardTop+'px';
    card.style.left = '50%';
    card.style.transform = 'translateX(-50%)';
  }catch(e){
    spot.style.display='none';
    positionCardCenter(card);
  }
}

function positionCardCenter(card){
  card.style.top = '50%';
  card.style.left = '50%';
  card.style.transform = 'translate(-50%,-50%)';
}

function renderStep(){
  var step = STEPS[current];
  if(!step){ endTour(); return; }
  ensureOverlay();
  $('h38TourTitle').textContent = step.title;
  $('h38TourBody').textContent = step.body;
  $('h38TourProgress').textContent = 'Step '+(current+1)+' of '+STEPS.length;
  $('h38TourBack').style.visibility = current===0 ? 'hidden' : 'visible';
  $('h38TourNext').textContent = current===STEPS.length-1 ? 'Finish' : 'Next';
  overlay.classList.add('open');
  // Give the page a beat to render, then position
  setTimeout(function(){ positionSpotlight(step); }, 350);
  // Reposition on resize/scroll during tour
  window.addEventListener('resize', reposition);
  window.addEventListener('scroll', reposition, {passive:true});
}

function reposition(){
  if(current<0||!overlay||!overlay.classList.contains('open')) return;
  positionSpotlight(STEPS[current]);
}

function goTo(n){
  if(n<0){ return; }
  if(n>=STEPS.length){ endTour(); return; }
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
  if(overlay && overlay.classList.contains('open')) return;
  clearDone(); // starting manually clears the done flag only for replay bookkeeping
  current = -1;
  goTo(0);
}

function endTour(){
  markDone();
  current = -1;
  if(overlay) overlay.classList.remove('open');
  window.removeEventListener('resize', reposition);
  window.removeEventListener('scroll', reposition);
}

/* ---- First-run auto-launch ---- */
function maybeAutoStart(){
  if(isDone()) return;
  // Only auto-start for signed-in owners/admins on the today page, once per load
  try{
    if(!window.state || !window.state.snapshot) return;
    var role = String(window.state.role||'').toLowerCase();
    if(role && role!=='owner' && role!=='administrator' && role!=='admin') return;
  }catch(e){}
  // Small delay so the app finishes rendering
  setTimeout(function(){
    if(isDone()) return;
    if(overlay && overlay.classList.contains('open')) return;
    startTour();
  }, 2500);
}

/* ---- Public API ---- */
window.H38GuidedTour = {
  start: startTour,
  end: endTour,
  isDone: isDone,
  reset: clearDone,
  BUILD: BUILD
};

/* ---- Wire up ---- */
document.addEventListener('click',function(e){
  var b = e.target.closest('[data-h38-tour]');
  if(b){ e.preventDefault(); startTour(); }
});

// Auto-launch check after app boots
if(document.readyState==='complete'){ maybeAutoStart(); }
else{ window.addEventListener('load',function(){ setTimeout(maybeAutoStart, 1000); }); }
// Also check when auth state settles (event from app boot)
window.addEventListener('h38:office-page-rendered',function(){
  if(!window.__h38TourAutoChecked){ window.__h38TourAutoChecked=true; maybeAutoStart(); }
});

})();
