/* H38 Training Guides — Interactive in-app walkthrough engine.
 *
 * Instead of videos, guides highlight real UI elements and walk the user
 * through workflows step-by-step. Mobile-first: tooltips position above
 * the highlighted element, large touch targets, dismissable anytime.
 *
 * Usage:
 *   H38TrainingGuides.start('first-quote');  // start a guide by ID
 *   H38TrainingGuides.available();            // list guides for current page
 *
 * Guide definition format:
 *   {
 *     id: 'first-quote',
 *     title: 'Create your first quote',
 *     pages: ['quotes'],           // which app pages this applies to
 *     steps: [
 *       { selector: '#newQuoteButton', title: '...', body: '...', action: 'click' },
 *       { selector: '#quoteCustomer', title: '...', body: '...', action: 'select' },
 *       ...
 *     ]
 *   }
 *
 * Step actions: 'click' (wait for click), 'input' (wait for input), 'info' (just Next button),
 *               'navigate' (auto-navigate to page)
 */

(function(){
'use strict';

var currentGuide = null;
var currentStep = 0;
var overlay = null;
var tooltip = null;
var highlight = null;

// ---------------------------------------------------------------------------
// Guide definitions
// ---------------------------------------------------------------------------

var GUIDES = {
  'first-launch': {
    title: 'Your Office in 3 minutes',
    desc: 'Today view, quotes, and jobs — the core loop.',
    icon: '🚀',
    steps: [
      { selector: 'body', title: 'Welcome to H38 Office', body: 'This is your Today view — what needs attention right now. Let\'s take a quick tour.', action: 'info' },
      { selector: '[data-page="quotes"], #navQuotes', title: 'Quotes', body: 'Build quotes here. Tap it to see the Quote Builder.', action: 'click', fallbackPage: 'quotes' },
      { selector: '[data-page="jobs"], #navJobs', title: 'Jobs', body: 'Active work lives here. Quotes turn into jobs when approved.', action: 'info' },
      { selector: '[data-page="today"], #navToday', title: 'You\'re set', body: 'That\'s the core loop: Today → Quotes → Jobs. Ask Kit anytime with "How do I..."', action: 'info' }
    ]
  },

  'first-quote': {
    title: 'Create your first quote',
    desc: 'Customer, line items, photo, save — start to finish.',
    icon: '📝',
    pages: ['quotes'],
    steps: [
      { selector: '#newQuoteButton', title: 'Start a draft', body: 'Tap "New draft" to begin a fresh quote.', action: 'click' },
      { selector: '#quoteCustomer', title: 'Pick a customer', body: 'Select who this quote is for.', action: 'input' },
      { selector: '#quoteTitle', title: 'Name the project', body: 'Give it a clear title like "Kitchen remodel — Smith".', action: 'input' },
      { selector: '#lineDescription', title: 'Add line items', body: 'Describe the work, set quantity and price, then tap Add.', action: 'info' },
      { selector: '#quotePhotoButton', title: 'Add photos', body: 'Photos help you remember the site — and power the AI quote-from-photos feature.', action: 'info' },
      { selector: '#saveQuoteButton', title: 'Save it', body: 'Save as a draft. Nothing goes to the customer until you send it.', action: 'click' }
    ]
  },

  'photo-to-quote': {
    title: 'Let AI draft from photos',
    desc: 'Take site photos, let Kit suggest the line items.',
    icon: '📸',
    pages: ['quotes'],
    steps: [
      { selector: '#quotePhotoButton', title: 'Add site photos', body: 'Take or upload photos of the work area. More angles = better suggestions.', action: 'info' },
      { selector: '#quoteFromPhotosButton', title: 'Tap "Quote from photos"', body: 'Kit analyzes the photos and drafts line items. This takes about a minute.', action: 'click' },
      { selector: '#quoteLines', title: 'Review suggestions', body: 'Check every line — prices marked "Owner review required" need your eyes before saving.', action: 'info' }
    ]
  },

  'dispatch-basics': {
    title: 'Assign and track crew',
    desc: 'Dispatch board, GPS, and on-my-way texts.',
    icon: '🛰️',
    pages: ['dispatch', 'fleet'],
    steps: [
      { selector: 'body', title: 'Dispatch board', body: 'See all active jobs and crew on one screen.', action: 'info' },
      { selector: 'body', title: 'On-my-way texts', body: 'When you head to a job, the app can text the customer automatically. They\'ll get your ETA.', action: 'info' },
      { selector: 'body', title: 'Crew location', body: 'Crew shares location only while on the clock — and only if they opt in.', action: 'info' }
    ]
  },

  'inventory-basics': {
    title: 'Track materials',
    desc: 'Receive stock, get low-stock alerts.',
    icon: '📦',
    pages: ['inventory'],
    steps: [
      { selector: '#inventoryForm', title: 'Receive or issue', body: 'Log materials coming in or going out to a job.', action: 'info' },
      { selector: 'body', title: 'Low-stock alerts', body: 'Set a reorder point on any item. You\'ll get alerted before you run out.', action: 'info' }
    ]
  },

  'sms-basics': {
    title: 'Text customers through Kit',
    desc: 'Templates, approvals, and stop rules.',
    icon: '💬',
    pages: ['messages'],
    steps: [
      { selector: '#smsForm', title: 'Draft a text', body: 'Write your message. Nothing sends until you approve it.', action: 'info' },
      { selector: '#smsRequestSendButton', title: 'Request send', body: 'This queues it for owner approval — required before any customer text goes out.', action: 'info' },
      { selector: 'body', title: 'Kit drafts for you', body: 'Kit can draft reminders and follow-ups automatically. You always approve before they send.', action: 'info' }
    ]
  },

  'offline-basics': {
    title: 'Work without signal',
    desc: 'Sync before you go, work offline, sync when back.',
    icon: '📴',
    pages: ['today'],
    steps: [
      { selector: '#offlineReadinessCard', title: 'Check readiness', body: 'Before heading out, check this card — it shows what\'s cached for offline use.', action: 'info' },
      { selector: 'body', title: 'Work normally', body: 'Everything queues locally. Quotes, photos, notes — it all works offline.', action: 'info' },
      { selector: 'body', title: 'Sync when back', body: 'When you\'re back online, everything syncs automatically.', action: 'info' }
    ]
  }
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

function isEnabled(){
  try{
    var oc = window.H38OwnerControls;
    if(!oc || !oc.isEnabled) return true; // default on if no controls
    return oc.isEnabled('training_guides') !== false;
  }catch(e){ return true; }
}

function registerToggle(){
  try{
    var oc = window.H38OwnerControls;
    if(!oc || !Array.isArray(oc.FEATURES)) return;
    if(!oc.FEATURES.some(function(f){ return f && f.id === 'training_guides'; })){
      oc.FEATURES.push({
        id: 'training_guides',
        title: 'Training guides',
        desc: 'Interactive in-app walkthroughs for new users. Replaces long training videos.',
        icon: '🎓',
        default: true,
        category: 'General'
      });
    }
  }catch(e){}
}

function createOverlay(){
  if(overlay) return;
  overlay = document.createElement('div');
  overlay.id = 'h38-guide-overlay';
  overlay.innerHTML = '<div id="h38-guide-highlight"></div>' +
    '<div id="h38-guide-tooltip" role="dialog" aria-live="polite">' +
    '<div id="h38-guide-progress"></div>' +
    '<h3 id="h38-guide-title"></h3>' +
    '<p id="h38-guide-body"></p>' +
    '<div id="h38-guide-actions">' +
    '<button id="h38-guide-skip" class="secondary">Skip tour</button>' +
    '<button id="h38-guide-next">Next</button>' +
    '</div></div>';
  document.body.appendChild(overlay);
  highlight = overlay.querySelector('#h38-guide-highlight');
  tooltip = overlay.querySelector('#h38-guide-tooltip');

  overlay.querySelector('#h38-guide-skip').onclick = end;
  overlay.querySelector('#h38-guide-next').onclick = next;
  overlay.onclick = function(e){ if(e.target === overlay) end(); };
}

function positionTooltip(target){
  if(!target || target === document.body){
    tooltip.style.top = '20%';
    tooltip.style.left = '50%';
    tooltip.style.transform = 'translateX(-50%)';
    return;
  }
  var r = target.getBoundingClientRect();
  // Highlight
  highlight.style.top = (r.top - 4 + window.scrollY) + 'px';
  highlight.style.left = (r.left - 4) + 'px';
  highlight.style.width = (r.width + 8) + 'px';
  highlight.style.height = (r.height + 8) + 'px';
  highlight.style.display = 'block';
  // Tooltip above the element (mobile-friendly)
  tooltip.style.transform = 'none';
  var top = r.top - tooltip.offsetHeight - 16;
  if(top < 8) top = r.bottom + 16; // flip below if no room above
  tooltip.style.top = Math.max(8, top) + 'px';
  tooltip.style.left = Math.max(8, Math.min(window.innerWidth - tooltip.offsetWidth - 8, r.left)) + 'px';
}

function showStep(){
  var guide = GUIDES[currentGuide];
  var step = guide.steps[currentStep];
  if(!step){ end(); return; }

  createOverlay();
  overlay.style.display = 'block';

  // Progress
  overlay.querySelector('#h38-guide-progress').textContent =
    guide.title + ' — ' + (currentStep + 1) + ' of ' + guide.steps.length;
  overlay.querySelector('#h38-guide-title').textContent = step.title;
  overlay.querySelector('#h38-guide-body').textContent = step.body;

  var nextBtn = overlay.querySelector('#h38-guide-next');
  nextBtn.textContent = (currentStep === guide.steps.length - 1) ? 'Finish' : 'Next';

  // Find target
  var target = null;
  try{ target = step.selector ? document.querySelector(step.selector) : document.body; }catch(e){}
  if(!target && step.fallbackPage && window.openPage){
    // Target not on this page — offer to navigate
    nextBtn.textContent = 'Go there';
    nextBtn.onclick = function(){ window.openPage(step.fallbackPage); setTimeout(next, 500); };
    tooltip.style.top = '20%';
    tooltip.style.left = '50%';
    tooltip.style.transform = 'translateX(-50%)';
    highlight.style.display = 'none';
    return;
  }
  nextBtn.onclick = next;

  // Wire the expected action
  if(target && step.action === 'click'){
    var orig = target.onclick;
    nextBtn.textContent = 'Tap the highlighted button';
    nextBtn.disabled = true;
    var handler = function(){
      target.removeEventListener('click', handler);
      nextBtn.disabled = false;
      next();
    };
    target.addEventListener('click', handler);
    // Also allow Next to skip waiting
    nextBtn.disabled = false;
    nextBtn.textContent = 'Next';
  }

  positionTooltip(target || document.body);
  // Reposition on scroll/resize
  setTimeout(function(){ positionTooltip(target || document.body); }, 100);
}

function next(){
  var guide = GUIDES[currentGuide];
  currentStep++;
  if(currentStep >= guide.steps.length){
    complete();
  } else {
    showStep();
  }
}

function complete(){
  markComplete(currentGuide);
  end();
  if(window.toast) window.toast('Guide complete! Ask Kit anytime with "How do I..."');
}

function end(){
  currentGuide = null;
  currentStep = 0;
  if(overlay) overlay.style.display = 'none';
  if(highlight) highlight.style.display = 'none';
}

function markComplete(guideId){
  try{
    var key = 'h38_guide_done_' + guideId;
    localStorage.setItem(key, new Date().toISOString());
    // Also record server-side for cross-device
    if(window.queueOperation){
      window.queueOperation('SAVE_ENTITY', 'Guide Completion', key, {
        entity: 'guideCompletions',
        record: { 'Guide ID': guideId, 'Completed At': new Date().toISOString(), 'Business ID': window.state && window.state.businessId }
      });
    }
  }catch(e){}
}

function isComplete(guideId){
  try{ return !!localStorage.getItem('h38_guide_done_' + guideId); }catch(e){ return false; }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

window.H38TrainingGuides = {
  start: function(guideId){
    if(!GUIDES[guideId]){ if(window.toast) window.toast('Guide not found.', true); return; }
    if(!isEnabled()){ if(window.toast) window.toast('Training guides are off in Owner Controls.', true); return; }
    currentGuide = guideId;
    currentStep = 0;
    showStep();
  },
  available: function(){
    return Object.keys(GUIDES).map(function(id){
      return { id: id, title: GUIDES[id].title, desc: GUIDES[id].desc, icon: GUIDES[id].icon, done: isComplete(id) };
    });
  },
  isComplete: isComplete,
  end: end
};

// Self-register toggle
registerToggle();
// Re-register after Owner Controls loads (it may load after us)
setTimeout(registerToggle, 2000);

})();
