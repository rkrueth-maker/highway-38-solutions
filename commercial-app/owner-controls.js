(function(){
'use strict';
// H38 Owner Controls: feature toggles and module visibility.
// Owner can turn features on/off and hide modules they don't use.
const BUILD='20261025-toggles-server-1';
const text=v=>String(v==null?'':v).trim();
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const businessId=()=>text(window.state?.businessId);

// Feature toggles - granular on/off controls
const FEATURE_TOGGLES=[
  {id:'clockout_photos',title:'Photos for clock out',desc:'Require photos when staff clock out of a job.',icon:'📸',default:true,category:'Time Tracking'},
  {id:'clockout_notes',title:'Notes for clock out',desc:'Require notes when staff clock out.',icon:'📝',default:false,category:'Time Tracking'},
  {id:'job_photos',title:'Job photos required',desc:'Require photos to be attached to jobs.',icon:'📷',default:false,category:'Jobs'},
  {id:'customer_signatures',title:'Customer signatures',desc:'Require customer signature on completed work.',icon:'✍️',default:false,category:'Jobs'},
  {id:'quote_approval',title:'Quote approval workflow',desc:'Require owner approval before quotes can be sent.',icon:'✅',default:true,category:'Quotes'},
  {id:'auto_reminders',title:'Auto payment reminders',desc:'Automatically send payment reminders for overdue invoices.',icon:'🔔',default:false,category:'Money'},
  {id:'payroll_check_printing',title:'Payroll check printing',desc:'Print paychecks on check stock from your own bank, straight from a finalized pay run. The Office prints the date, employee, amounts and pay stub only — the MICR line and account numbers stay on your bank stock. Off by default.',icon:'🖨️',default:false,category:'Money'},
  {id:'gps_tracking',title:'GPS location tracking',desc:'Track staff location during work hours.',icon:'📍',default:false,category:'Fleet'},
  {id:'ai_suggestions',title:'AI suggestions',desc:'Show AI-powered suggestions throughout the app.',icon:'🤖',default:true,category:'AI'},
  {id:'repair_guide_enabled',title:'Repair Guide integration',desc:'Connect the standalone Repair Guide app: send diagnoses to Office jobs and quote drafts, link garage vehicles to customers, deep links both ways. Off by default — the Repair Guide keeps working standalone.',icon:'🔧',default:false,category:'Modules'},
  {id:'recommended_vendors_enabled',title:'Recommended Vendors',desc:'Show the Recommended Vendors directory: local suppliers and services approved by Highway 38, plus the optional "Recommended local pros" block on your website. Every partner is reviewed by Highway 38 before listing, and paid placement is always labeled. Off by default.',icon:'🤝',default:false,category:'Modules'},
  {id:'inventory_enabled',title:'Inventory & Materials',desc:'Track stock you buy, sell and rent: on-hand counts, reorder points with a low-stock list, items that drop onto quotes and invoices (stock leaves when the invoice is paid), and an advertised-stock list showing name + availability only. Nothing auto-orders and nothing auto-sends. Off by default.',icon:'📦',default:false,category:'Modules'},
  {id:'auto_review_requests',title:'Auto-ask for reviews',desc:'When a job is marked complete, prompt to send the customer a review request text. Rotates across your Google, Facebook, and Yelp review links from Settings, with one polite follow-up nudge after a few days.',icon:'⭐',default:false,category:'Customers'},
  {id:'auto_send_review_requests',title:'Auto-send review requests',desc:'When a job is marked complete, automatically text the customer a review request — no per-job prompt. Uses your message template, send delay, and review links from Settings. Respects quiet hours (no texts 9pm–8am), customer consent and STOP. Turning this on pre-approves this one message type; turn it off anytime to go back to prompts.',icon:'⭐',default:false,category:'Customers'},
  {id:'on_my_way_texts',title:'"On My Way" texts',desc:'Show a "Text: On My Way" button on scheduled jobs so techs can text customers their ETA. Queued for owner approval — nothing sends automatically.',icon:'🚗',default:false,category:'Customers'},
  {id:'card_on_file',title:'Card on file + card charges',desc:'Save customer cards as processor tokens and charge invoices with one tap. Test mode moves no real money. Auto-charge always needs owner approval — never silent.',icon:'',default:false,category:'Money'},
  {id:'online_payments_enabled',title:'Online payments (cards & bank debit)',desc:'Let customers pay invoices online through YOUR OWN Stripe account — money settles straight to your bank; the Office never holds it. Stripe charges 2.9% + 30¢ per card payment, or 0.8% (max $5) for bank debit; no other fees. Connect Stripe below first, then turn this on. Off by default; manual payments keep working either way.',icon:'💳',default:false,category:'Money'},
  {id:'recurring_jobs_enabled',title:'Recurring jobs & service plans',desc:'Set repeat visits (lawn, snow, maintenance plans) on a customer once, then generate the upcoming jobs from Today. You tap to generate — nothing is created or charged automatically. Off by default.',icon:'🔁',default:false,category:'Jobs'},
  {id:'ai_lead_responder',title:'AI lead responder',desc:'When a new online booking comes in, Hank queues a personal follow-up draft for your one-tap review and send — after hours too, so no lead sits cold. You approve every message; nothing sends itself. Needs Online Booking on. Off by default.',icon:'📞',default:false,category:'AI'},
  {id:'owner_notify_customer',title:'Customer activity alerts',desc:'The bell in the top bar (and a card on Today) tells owners and admins when customers do something: new booking or service requests, portal messages, quote approvals and declines, payments recorded, files uploaded. On by default.',icon:'🔔',default:true,category:'Notifications'},
  {id:'owner_notify_review',title:'Needs-review alerts',desc:'The same bell flags work waiting on you: pending approvals, queued actions, AI tasks Hank could not finish alone, quotes and prices that need your review. On by default.',icon:'🔔',default:true,category:'Notifications'},
  {id:'owner_notify_push',title:'Push alerts to my devices',desc:'Also send the alerts above as phone push notifications (one batched push, never a storm). Needs a device subscribed through the shared push service; the in-app bell works either way. Off by default.',icon:'📲',default:false,category:'Notifications'},
  {id:'health_error_monitoring',title:'Health monitoring & auto-fix',desc:'Hank watches for app errors, blank screens, and stuck loading states — and fixes them automatically. Error reports never include names, emails, phone numbers, or addresses. On by default; turning it off disables self-healing.',icon:'❤️',default:true,category:'App Health'},
  {id:'health_usage_analytics',title:'Usage analytics',desc:'Anonymous counts of which features get used and how fast pages load, so the app keeps getting better. No keystrokes, no form contents, no personal data. On by default.',icon:'📊',default:true,category:'App Health'},
];

// Repair Guide module setting (server-side mirror).
// The standalone Repair Guide app verifies this row server-side before it
// activates its Office features, so the owner's intent here is enforced even
// when the Guide is opened on another device or by another user.
const REPAIR_GUIDE_MODULE_KEY='repair_guide';
function repairGuideSettingRow(){
  const list=(window.state&&window.state.snapshot&&window.state.snapshot.moduleSettings)||[];
  return list.find(r=>text(r.moduleKey||r.module_key)===REPAIR_GUIDE_MODULE_KEY)||null;
}
// Server snapshot wins when present; otherwise fall back to the local toggle.
function isRepairGuideEnabled(){
  const row=repairGuideSettingRow();
  if(row) return row.enabled===true;
  return isFeatureEnabled('repair_guide_enabled');
}
// Owner/admin only. Mirrors the toggle to business_module_settings and keeps
// the local toggle in sync. Throws when the server write fails.
async function setRepairGuideEnabled(enabled){
  const role=text((window.state&&window.state.snapshot&&window.state.snapshot.user&&window.state.snapshot.user.roleName)||'').toLowerCase();
  if(!['owner','administrator'].includes(role)) throw new Error('Only a business owner or administrator can turn the Repair Guide integration on or off.');
  const bid=businessId();
  if(!bid) throw new Error('Open a business first.');
  const api=window.H38_SUPABASE_SHARED_CLIENT&&window.H38_SUPABASE_SHARED_CLIENT.ensure?window.H38_SUPABASE_SHARED_CLIENT.ensure():null;
  if(!api) throw new Error('Secure settings connection is unavailable.');
  const row={business_id:bid,module_key:REPAIR_GUIDE_MODULE_KEY,enabled:!!enabled,config:{},updated_at:new Date().toISOString()};
  const res=await api.from('business_module_settings').upsert(row,{onConflict:'business_id,module_key'});
  if(res&&res.error) throw new Error(res.error.message||res.error);
  if(window.state&&window.state.snapshot){
    const list=window.state.snapshot.moduleSettings||(window.state.snapshot.moduleSettings=[]);
    const i=list.findIndex(r=>text(r.moduleKey||r.module_key)===REPAIR_GUIDE_MODULE_KEY);
    const snap={moduleKey:REPAIR_GUIDE_MODULE_KEY,module_key:REPAIR_GUIDE_MODULE_KEY,enabled:!!enabled,config:{}};
    if(i>=0) list[i]=snap; else list.push(snap);
  }
  const toggles=getToggles();
  toggles['repair_guide_enabled']=!!enabled;
  saveToggles(toggles);
}

// Module visibility - show/hide entire sections
const MODULES=[
  {id:'today',title:'Today',icon:'',desc:'Daily dashboard and overview'},
  {id:'customers',title:'Customers',icon:'',desc:'Customer list and details'},
  {id:'quotes',title:'Quotes',icon:'',desc:'Quote builder and management'},
  {id:'jobs',title:'Jobs',icon:'',desc:'Job tracking and management'},
  {id:'schedule',title:'Schedule',icon:'',desc:'Calendar and appointments'},
  {id:'money',title:'Money',icon:'',desc:'Invoices, payments, expenses'},
  {id:'fleet',title:'Fleet',icon:'',desc:'Vehicle tracking and management'},
  {id:'inventory',title:'Inventory',icon:'',desc:'Parts and materials inventory'},
  {id:'documents',title:'Documents',icon:'',desc:'File storage and documents'},
  {id:'reports',title:'Reports',icon:'',desc:'Business reports and analytics'},
  {id:'team',title:'Team',icon:'',desc:'Staff management'},
  {id:'messages',title:'Messages',icon:'',desc:'Customer communications'},
];

function serverToggles(){
  // The server-side FeatureToggles record (business_records) for this
  // business — the copy that follows the business across devices.
  try{
    const rows=(window.state&&window.state.snapshot&&window.state.snapshot.FeatureToggles)||[];
    const mine=rows.filter(r=>text(r['Business ID']||r.businessId)===businessId());
    const row=mine.sort((a,b)=>text(b['Updated Time']||b.updatedAt).localeCompare(text(a['Updated Time']||a.updatedAt)))[0];
    if(row){
      const t=row.Toggles||row.toggles;
      if(t&&typeof t==='object') return t;
    }
  }catch(e){}
  return null;
}

function getToggles(){
  let local=null;
  try{
    const raw=localStorage.getItem('h38-feature-toggles-'+businessId());
    if(raw) local=JSON.parse(raw);
  }catch(e){}
  const server=serverToggles();
  if(local||server){
    // Server wins per key: an owner's choice saved on any device is the
    // business's setting everywhere. Local values remain as the fallback
    // for keys the server record has never carried.
    const out={};
    if(local) Object.assign(out,local);
    if(server) Object.assign(out,server);
    return out;
  }
  const defaults={};
  FEATURE_TOGGLES.forEach(f=>defaults[f.id]=f.default);
  return defaults;
}

function getModuleVisibility(){
  try{
    const raw=localStorage.getItem('h38-module-visibility-'+businessId());
    if(raw) return JSON.parse(raw);
  }catch(e){}
  const defaults={};
  MODULES.forEach(m=>defaults[m.id]=true);
  // Business-level curation (e.g. the demo tenant hides back-office modules
  // so prospects see the money workflows, not the factory). A per-browser
  // localStorage value above still wins when present.
  try{
    const mc=window.state&&window.state.snapshot&&window.state.snapshot.business&&window.state.snapshot.business.moduleConfig;
    const hidden=mc&&Array.isArray(mc.hiddenModules)?mc.hiddenModules:[];
    hidden.forEach(id=>{if(defaults.hasOwnProperty(id))defaults[id]=false;});
  }catch(e){}
  return defaults;
}

function saveToggles(toggles){
  try{localStorage.setItem('h38-feature-toggles-'+businessId(),JSON.stringify(toggles));}catch(e){}
  // Persist server-side per business (business_records FeatureToggles) so
  // the setting follows the business across devices and browsers. The
  // optimistic record is what the sync layer actually writes; without it
  // this op never mapped to a server record and the toggles lived and
  // died in one device's localStorage — the root cause of the Oct 2026
  // mileage-arming failure (the phone toggle never reached the server,
  // so the native runner never armed).
  if(typeof queueOperation==='function'){
    const stamp=new Date().toISOString();
    queueOperation('SAVE_FEATURE_TOGGLES','FeatureToggles',businessId(),{toggles,updatedAt:stamp},
      {collection:'FeatureToggles',record:{'Business ID':businessId(),'Toggles':toggles,'Updated Time':stamp,'Record Version':1},idKeys:['Business ID']}).catch(()=>{});
  }
}

function saveModuleVisibility(visibility){
  localStorage.setItem('h38-module-visibility-'+businessId(),JSON.stringify(visibility));
  if(typeof queueOperation==='function'){
    queueOperation('SAVE_MODULE_VISIBILITY','ModuleVisibility',businessId(),{visibility,updatedAt:new Date().toISOString()}).catch(()=>{});
  }
  // Apply immediately to nav
  applyModuleVisibility(visibility);
}

function applyModuleVisibility(visibility){
  /* WS4 B12 (spec §7.2 R1/R2): retired. Nav items for OFF modules are
   * not rendered at all — both nav authorities filter with
   * window.H38ModuleVisible — so there is nothing to hide after the fact.
   * Applying visibility now means asking the nav to re-render. */
  try{if(typeof window.renderNav==='function')window.renderNav();}catch(e){}
}

function isFeatureEnabled(featureId){
  const toggles=getToggles();
  const feature=FEATURE_TOGGLES.find(f=>f.id===featureId);
  return toggles[featureId]!==undefined?toggles[featureId]:(feature?feature.default:true);
}

function isModuleVisible(moduleId){
  const visibility=getModuleVisibility();
  return visibility[moduleId]!==false;
}

/* WS4 nav-scaling predicate (spec §7.2 R1, helper only — the nav
 * authorities wire it in a later phase). A page is module-visible unless
 * (a) Owner Controls module visibility hides it, or (b) a server
 * business_module_settings row for it exists and is not enabled.
 * Capabilities stay with allowedPages() in the nav renderers; this
 * predicate covers the moduleSettings + visibility inputs only. */
const PAGE_SERVER_MODULE_KEYS={inventory:'inventory_enabled',machineShop:'machine_shop',machine_shop:'machine_shop',repairGuide:'repair_guide',vendors:'recommended_vendors',ownerChat:'owner_chat'};
function h38ModuleVisible(pageKey){
  const key=text(pageKey);
  if(!key) return true;
  const visibilityId={work:'jobs',people:'team'}[key]||key;
  if(MODULES.some(m=>m.id===visibilityId)&&!isModuleVisible(visibilityId)) return false;
  const serverKey=PAGE_SERVER_MODULE_KEYS[key]||key;
  const candidates=[serverKey,serverKey+'_enabled'];
  try{
    const list=(window.state&&window.state.snapshot&&window.state.snapshot.moduleSettings)||[];
    for(const candidate of candidates){
      const row=list.find(r=>text(r.moduleKey||r.module_key)===candidate);
      if(row) return row.enabled===true;
    }
  }catch(e){}
  return true;
}
window.H38ModuleVisible=h38ModuleVisible;

// ---- Machine Shop: server-backed tenant setting ----
// Stored in business_module_settings (module_key='machine_shop', enabled).
// Missing row or enabled!==true means OFF. The entire shop module — nav entry,
// RFQ workflow, and shop pricing templates — is hidden unless this is ON.
// Server-backed (not localStorage) so the setting follows the business across
// the owner's devices.
const MACHINE_SHOP_KEY='machine_shop';

function machineShopSettingRow(){
  const list=(window.state&&window.state.snapshot&&window.state.snapshot.moduleSettings)||[];
  return list.find(r=>text(r.moduleKey||r.module_key)===MACHINE_SHOP_KEY)||null;
}

function isMachineShopEnabled(){
  const row=machineShopSettingRow();
  return row!==null?row.enabled===true:false;
}

function canManageModules(){
  const user=window.state&&(window.state.snapshot&&window.state.snapshot.user||window.state.user);
  const role=text(user&&(user.roleName||user.role)).toLowerCase();
  return role==='owner'||role==='administrator';
}

async function setMachineShop(enabled){
  if(!canManageModules()) throw new Error('Only a business owner or administrator can change module settings.');
  const api=window.H38_SUPABASE_SHARED_CLIENT&&window.H38_SUPABASE_SHARED_CLIENT.ensure?window.H38_SUPABASE_SHARED_CLIENT.ensure():null;
  if(!api) throw new Error('Secure settings connection is unavailable.');
  const bid=businessId();
  if(!bid) throw new Error('Open a business first.');
  const sess=await api.auth.getSession();
  const user=sess&&sess.data&&sess.data.session&&sess.data.session.user;
  if(!user) throw new Error('Sign in again before changing this setting.');
  const nowTs=new Date().toISOString();
  const row={business_id:bid,module_key:MACHINE_SHOP_KEY,enabled:!!enabled,
    config:{updatedBy:user.id,updatedAt:nowTs},updated_at:nowTs};
  const res=await api.from('business_module_settings').upsert(row,{onConflict:'business_id,module_key'});
  if(res.error) throw res.error;
  // Keep the in-memory snapshot in sync so nav gating and this card agree.
  if(window.state&&window.state.snapshot){
    if(!Array.isArray(window.state.snapshot.moduleSettings)) window.state.snapshot.moduleSettings=[];
    const list=window.state.snapshot.moduleSettings;
    const i=list.findIndex(r=>text(r.moduleKey||r.module_key)===MACHINE_SHOP_KEY);
    const snapRow={module_key:MACHINE_SHOP_KEY,enabled:!!enabled,config:row.config};
    if(i>=0) list[i]=Object.assign({},list[i],snapRow); else list.push(snapRow);
  }
  // Refresh navigation so the Machine Shop entry appears/disappears immediately.
  try{if(typeof window.renderNav==='function')window.renderNav();}catch(e){}
  try{if(window.H38_DESKTOP_NAVIGATION_CORE&&typeof window.H38_DESKTOP_NAVIGATION_CORE.reconcile==='function')window.H38_DESKTOP_NAVIGATION_CORE.reconcile();}catch(e){}
  return !!enabled;
}

// AI lead responder (server-side mirror).
// The public booking edge function reads this row, so the owner's intent is
// enforced even for bookings that arrive while the Office is closed.
const LEAD_RESPONDER_KEY='ai_lead_responder';
function leadResponderSettingRow(){
  const list=(window.state&&window.state.snapshot&&window.state.snapshot.moduleSettings)||[];
  return list.find(r=>text(r.moduleKey||r.module_key)===LEAD_RESPONDER_KEY)||null;
}
function isLeadResponderEnabled(){
  const row=leadResponderSettingRow();
  if(row) return row.enabled===true;
  return isFeatureEnabled('ai_lead_responder');
}
function leadResponderTemplate(){
  const row=leadResponderSettingRow();
  return text(row&&row.config&&row.config.template)||'';
}
async function setLeadResponderEnabled(enabled,template){
  const role=text((window.state&&window.state.snapshot&&window.state.snapshot.user&&window.state.snapshot.user.roleName)||'').toLowerCase();
  if(!['owner','administrator'].includes(role)) throw new Error('Only a business owner or administrator can change this setting.');
  const bid=businessId();
  if(!bid) throw new Error('Open a business first.');
  const api=window.H38_SUPABASE_SHARED_CLIENT&&window.H38_SUPABASE_SHARED_CLIENT.ensure?window.H38_SUPABASE_SHARED_CLIENT.ensure():null;
  if(!api) throw new Error('Secure settings connection is unavailable.');
  const cfg={template:text(template||'').slice(0,500),updatedAt:new Date().toISOString()};
  const row={business_id:bid,module_key:LEAD_RESPONDER_KEY,enabled:!!enabled,config:cfg,updated_at:new Date().toISOString()};
  const res=await api.from('business_module_settings').upsert(row,{onConflict:'business_id,module_key'});
  if(res&&res.error) throw new Error(res.error.message||res.error);
  if(window.state&&window.state.snapshot){
    const list=window.state.snapshot.moduleSettings||(window.state.snapshot.moduleSettings=[]);
    const i=list.findIndex(r=>text(r.moduleKey||r.module_key)===LEAD_RESPONDER_KEY);
    const snap={moduleKey:LEAD_RESPONDER_KEY,module_key:LEAD_RESPONDER_KEY,enabled:!!enabled,config:cfg};
    if(i>=0) list[i]=snap; else list.push(snap);
  }
  const toggles=getToggles();
  toggles['ai_lead_responder']=!!enabled;
  saveToggles(toggles);
}
// Template editor rendered under the AI lead responder toggle row.
function bindLeadResponder(){
  const checkbox=document.querySelector('[data-toggle="ai_lead_responder"]');
  if(!checkbox) return;
  const rowEl=checkbox.closest('.row');
  if(!rowEl||rowEl.querySelector('[data-lead-template]')) return;
  const box=document.createElement('div');
  box.dataset.leadTemplate='1';
  box.innerHTML=`<label style="display:block;margin-top:8px"><small>Your instant-reply wording (Hank drafts the follow-up from it):</small><textarea data-lead-template-text rows="2" style="width:100%" placeholder="Thanks for reaching out! We got your request and will confirm shortly. — the team">${esc(leadResponderTemplate())}</textarea></label><button type="button" class="secondary" data-lead-template-save>Save wording</button>`;
  rowEl.appendChild(box);
  box.querySelector('[data-lead-template-save]').onclick=async()=>{
    try{
      await setLeadResponderEnabled(isLeadResponderEnabled(),box.querySelector('[data-lead-template-text]').value);
      if(typeof toast==='function') toast('Lead responder wording saved.');
    }catch(e){
      if(typeof toast==='function') toast('Could not save: '+(e&&e.message?e.message:e),true);
    }
  };
}

// Auto-send review requests (server-side mirror — CANONICAL toggle shape).
// Stored in business_module_settings (module_key='auto_send_review_requests',
// enabled boolean) — the same shape as the other server-enforced toggles.
// The h38-review-scheduler edge function (pg_cron, every 10 minutes) reads
// THIS row and nothing else before it claims a due review request, so the
// owner's intent is enforced even when the Office is closed. Missing row or
// enabled!==true means OFF. The local feature toggle is kept in sync only
// as a display fallback for a browser that has not loaded the snapshot yet.
const AUTO_SEND_REVIEW_KEY='auto_send_review_requests';
function autoSendReviewSettingRow(){
  const list=(window.state&&window.state.snapshot&&window.state.snapshot.moduleSettings)||[];
  return list.find(r=>text(r.moduleKey||r.module_key)===AUTO_SEND_REVIEW_KEY)||null;
}
// Server snapshot wins when present; otherwise fall back to the local toggle.
function isAutoSendReviewEnabled(){
  const row=autoSendReviewSettingRow();
  if(row) return row.enabled===true;
  return isFeatureEnabled('auto_send_review_requests');
}
// Owner/admin only. Mirrors the toggle to business_module_settings and keeps
// the local toggle in sync. Throws when the server write fails.
async function setAutoSendReviewEnabled(enabled){
  const role=text((window.state&&window.state.snapshot&&window.state.snapshot.user&&window.state.snapshot.user.roleName)||'').toLowerCase();
  if(!['owner','administrator'].includes(role)) throw new Error('Only a business owner or administrator can turn Auto-send review requests on or off.');
  const bid=businessId();
  if(!bid) throw new Error('Open a business first.');
  const api=window.H38_SUPABASE_SHARED_CLIENT&&window.H38_SUPABASE_SHARED_CLIENT.ensure?window.H38_SUPABASE_SHARED_CLIENT.ensure():null;
  if(!api) throw new Error('Secure settings connection is unavailable.');
  const cfg={updatedAt:new Date().toISOString()};
  const row={business_id:bid,module_key:AUTO_SEND_REVIEW_KEY,enabled:!!enabled,config:cfg,updated_at:new Date().toISOString()};
  const res=await api.from('business_module_settings').upsert(row,{onConflict:'business_id,module_key'});
  if(res&&res.error) throw new Error(res.error.message||res.error);
  if(window.state&&window.state.snapshot){
    const list=window.state.snapshot.moduleSettings||(window.state.snapshot.moduleSettings=[]);
    const i=list.findIndex(r=>text(r.moduleKey||r.module_key)===AUTO_SEND_REVIEW_KEY);
    const snap={moduleKey:AUTO_SEND_REVIEW_KEY,module_key:AUTO_SEND_REVIEW_KEY,enabled:!!enabled,config:cfg};
    if(i>=0) list[i]=snap; else list.push(snap);
  }
  const toggles=getToggles();
  toggles['auto_send_review_requests']=!!enabled;
  saveToggles(toggles);
}

// Owner notifications (server-side mirror — CANONICAL toggle shape).
// Three switches, ONE business_module_settings row: module_key
// 'owner_notifications', enabled = (customer || review), config
// {customer, review, push}. The h38-owner-notify edge function (pg_cron,
// every 5 minutes) reads THIS row before producing notification rows, so
// the owner's intent holds even while the Office is closed. No row means
// the defaults: customer + review ON, push OFF. Server snapshot wins when
// present; the local toggles are the display fallback.
const OWNER_NOTIFY_KEY='owner_notifications';
const OWNER_NOTIFY_KINDS={owner_notify_customer:'customer',owner_notify_review:'review',owner_notify_push:'push'};
const OWNER_NOTIFY_DEFAULTS={customer:true,review:true,push:false};
function ownerNotifySettingRow(){
  const list=(window.state&&window.state.snapshot&&window.state.snapshot.moduleSettings)||[];
  return list.find(r=>text(r.moduleKey||r.module_key)===OWNER_NOTIFY_KEY)||null;
}
function ownerNotifyResolved(){
  const row=ownerNotifySettingRow();
  const cfg=(row&&row.config)||{};
  const out={};
  ['customer','review','push'].forEach(kind=>{
    if(row&&row.enabled===false) out[kind]=false;
    else if(cfg&&cfg[kind]!==undefined) out[kind]=cfg[kind]===true;
    else out[kind]=OWNER_NOTIFY_DEFAULTS[kind];
  });
  return out;
}
function isOwnerNotifyEnabled(kind){
  const row=ownerNotifySettingRow();
  if(row) return ownerNotifyResolved()[kind]===true;
  const toggleId=Object.keys(OWNER_NOTIFY_KINDS).find(id=>OWNER_NOTIFY_KINDS[id]===kind);
  return isFeatureEnabled(toggleId);
}
// Owner/admin only. Mirrors the full resolved config to
// business_module_settings and keeps the local toggles in sync.
async function setOwnerNotifyEnabled(kind,enabled){
  const role=text((window.state&&window.state.snapshot&&window.state.snapshot.user&&window.state.snapshot.user.roleName)||'').toLowerCase();
  if(!['owner','administrator'].includes(role)) throw new Error('Only a business owner or administrator can change notification settings.');
  const bid=businessId();
  if(!bid) throw new Error('Open a business first.');
  const api=window.H38_SUPABASE_SHARED_CLIENT&&window.H38_SUPABASE_SHARED_CLIENT.ensure?window.H38_SUPABASE_SHARED_CLIENT.ensure():null;
  if(!api) throw new Error('Secure settings connection is unavailable.');
  const next=ownerNotifyResolved();
  next[kind]=!!enabled;
  const cfg={customer:next.customer===true,review:next.review===true,push:next.push===true,updatedAt:new Date().toISOString()};
  const row={business_id:bid,module_key:OWNER_NOTIFY_KEY,enabled:(cfg.customer||cfg.review),config:cfg,updated_at:new Date().toISOString()};
  const res=await api.from('business_module_settings').upsert(row,{onConflict:'business_id,module_key'});
  if(res&&res.error) throw new Error(res.error.message||res.error);
  if(window.state&&window.state.snapshot){
    const list=window.state.snapshot.moduleSettings||(window.state.snapshot.moduleSettings=[]);
    const i=list.findIndex(r=>text(r.moduleKey||r.module_key)===OWNER_NOTIFY_KEY);
    const snap={moduleKey:OWNER_NOTIFY_KEY,module_key:OWNER_NOTIFY_KEY,enabled:row.enabled,config:cfg};
    if(i>=0) list[i]=snap; else list.push(snap);
  }
  const toggles=getToggles();
  toggles['owner_notify_customer']=cfg.customer;
  toggles['owner_notify_review']=cfg.review;
  toggles['owner_notify_push']=cfg.push;
  saveToggles(toggles);
}

// Recommended Vendors (server-side mirror).
// The vendor directory edge function reads this row before it returns the
// curated partner list or lights up the tenant-website block, so the owner's
// intent is enforced even when the request comes from outside the Office.
const RECOMMENDED_VENDORS_KEY='recommended_vendors';
function recommendedVendorsSettingRow(){
  const list=(window.state&&window.state.snapshot&&window.state.snapshot.moduleSettings)||[];
  return list.find(r=>text(r.moduleKey||r.module_key)===RECOMMENDED_VENDORS_KEY)||null;
}
// Server snapshot wins when present; otherwise fall back to the local toggle.
function isRecommendedVendorsEnabled(){
  const row=recommendedVendorsSettingRow();
  if(row) return row.enabled===true;
  return isFeatureEnabled('recommended_vendors_enabled');
}
// Owner/admin only. Mirrors the toggle to business_module_settings and keeps
// the local toggle in sync. Throws when the server write fails.
async function setRecommendedVendorsEnabled(enabled){
  const role=text((window.state&&window.state.snapshot&&window.state.snapshot.user&&window.state.snapshot.user.roleName)||'').toLowerCase();
  if(!['owner','administrator'].includes(role)) throw new Error('Only a business owner or administrator can turn Recommended Vendors on or off.');
  const bid=businessId();
  if(!bid) throw new Error('Open a business first.');
  const api=window.H38_SUPABASE_SHARED_CLIENT&&window.H38_SUPABASE_SHARED_CLIENT.ensure?window.H38_SUPABASE_SHARED_CLIENT.ensure():null;
  if(!api) throw new Error('Secure settings connection is unavailable.');
  const row={business_id:bid,module_key:RECOMMENDED_VENDORS_KEY,enabled:!!enabled,config:{},updated_at:new Date().toISOString()};
  const res=await api.from('business_module_settings').upsert(row,{onConflict:'business_id,module_key'});
  if(res&&res.error) throw new Error(res.error.message||res.error);
  if(window.state&&window.state.snapshot){
    const list=window.state.snapshot.moduleSettings||(window.state.snapshot.moduleSettings=[]);
    const i=list.findIndex(r=>text(r.moduleKey||r.module_key)===RECOMMENDED_VENDORS_KEY);
    const snap={moduleKey:RECOMMENDED_VENDORS_KEY,module_key:RECOMMENDED_VENDORS_KEY,enabled:!!enabled,config:{}};
    if(i>=0) list[i]=snap; else list.push(snap);
  }
  const toggles=getToggles();
  toggles['recommended_vendors_enabled']=!!enabled;
  saveToggles(toggles);
  try{if(typeof window.renderNav==='function')window.renderNav();}catch(e){}
}

// Inventory & Materials (server-side mirror).
// The Inventory page, the quote/invoice stock-item pickers, the advertised
// stock list and the payment-time stock decrement all read this row, so the
// owner's intent holds from every entry point. Off by default — nothing
// inventory appears until the owner turns it on here.
const INVENTORY_MODULE_KEY='inventory_enabled';
function inventorySettingRow(){
  const list=(window.state&&window.state.snapshot&&window.state.snapshot.moduleSettings)||[];
  return list.find(r=>text(r.moduleKey||r.module_key)===INVENTORY_MODULE_KEY)||null;
}
// Server snapshot wins when present; otherwise fall back to the local toggle.
function isInventoryEnabled(){
  const row=inventorySettingRow();
  if(row) return row.enabled===true;
  return isFeatureEnabled('inventory_enabled');
}
// Owner/admin only. Mirrors the toggle to business_module_settings and keeps
// the local toggle in sync. Throws when the server write fails.
async function setInventoryEnabled(enabled){
  const role=text((window.state&&window.state.snapshot&&window.state.snapshot.user&&window.state.snapshot.user.roleName)||'').toLowerCase();
  if(!['owner','administrator'].includes(role)) throw new Error('Only a business owner or administrator can turn Inventory on or off.');
  const bid=businessId();
  if(!bid) throw new Error('Open a business first.');
  const api=window.H38_SUPABASE_SHARED_CLIENT&&window.H38_SUPABASE_SHARED_CLIENT.ensure?window.H38_SUPABASE_SHARED_CLIENT.ensure():null;
  if(!api) throw new Error('Secure settings connection is unavailable.');
  const row={business_id:bid,module_key:INVENTORY_MODULE_KEY,enabled:!!enabled,config:{},updated_at:new Date().toISOString()};
  const res=await api.from('business_module_settings').upsert(row,{onConflict:'business_id,module_key'});
  if(res&&res.error) throw new Error(res.error.message||res.error);
  if(window.state&&window.state.snapshot){
    const list=window.state.snapshot.moduleSettings||(window.state.snapshot.moduleSettings=[]);
    const i=list.findIndex(r=>text(r.moduleKey||r.module_key)===INVENTORY_MODULE_KEY);
    const snap={moduleKey:INVENTORY_MODULE_KEY,module_key:INVENTORY_MODULE_KEY,enabled:!!enabled,config:{}};
    if(i>=0) list[i]=snap; else list.push(snap);
  }
  const toggles=getToggles();
  toggles['inventory_enabled']=!!enabled;
  saveToggles(toggles);
  try{if(typeof window.renderNav==='function')window.renderNav();}catch(e){}
}

function renderMachineShopCard(){
  const enabled=isMachineShopEnabled();
  const can=canManageModules();
  return `
    <section class="card span12" id="machineShopCard">
      <h2>🏭 Machine Shop</h2>
      <p class="muted small">Adds the Machine Shop workspace: RFQ intake, supplier quote comparison, markup into quotes, purchase orders, QC checks, shipping and reorder tracking. <strong>Stays off until you turn it on</strong> — contractors who are not shops never see it.</p>
      <div class="row">
        <div class="row-top">
          <strong>Machine Shop module ${enabled?'is ON':'is OFF'}</strong>
          <label class="switch">
            <input type="checkbox" data-machine-shop ${enabled?'checked':''} ${can?'':'disabled'}>
            <span class="slider"></span>
          </label>
        </div>
        <small>${can?'Flip the switch to show the Machine Shop workspace in navigation.':'Only an owner or administrator can change this.'}</small>
        ${enabled?'<small>Price-book templates and the RFQ workflow live under 🏭 Machine Shop in the nav.</small>':'<small>While off, the shop nav entry, RFQ workflow and shop pricing templates are hidden.</small>'}
      </div>
    </section>
  `;
}

function bindMachineShop(){
  const checkbox=document.querySelector('[data-machine-shop]');
  if(!checkbox||checkbox.dataset.h38Bound) return;
  checkbox.dataset.h38Bound='1';
  checkbox.onchange=async()=>{
    const want=checkbox.checked;
    if(want){
      const ok=window.confirm('Turn ON the Machine Shop module? The 🏭 Machine Shop workspace (RFQ intake, supplier quotes, purchase orders, QC, shipping, reorder tracking) will appear in navigation.');
      if(!ok){checkbox.checked=false;return;}
    }
    checkbox.disabled=true;
    try{
      const enabled=await setMachineShop(want);
      const card=document.getElementById('machineShopCard');
      if(card){
        const tmp=document.createElement('div');
        tmp.innerHTML=renderMachineShopCard();
        const fresh=tmp.firstElementChild;
        if(fresh){card.replaceWith(fresh);bindMachineShop();}
      }
      if(typeof toast==='function') toast('Machine Shop module '+(enabled?'turned ON.':'turned OFF.'));
    }catch(e){
      checkbox.checked=!want;
      if(typeof toast==='function') toast('Could not save: '+(e&&e.message?e.message:e),true);
    }finally{
      checkbox.disabled=false;
    }
  };
}

// ---- Customer Portal: server-backed tenant setting ----
// Stored in business_module_settings (module_key='customer_portal', enabled).
// Missing row or enabled!==true means OFF. The public portal endpoint
// (h38-customer-portal) checks this row server-side and refuses every action
// while it is OFF — the owner's intent is enforced even when the portal page
// is opened on another device. Default OFF: nothing customer-facing goes
// live until the owner flips this switch.
const CUSTOMER_PORTAL_KEY='customer_portal';

function customerPortalSettingRow(){
  const list=(window.state&&window.state.snapshot&&window.state.snapshot.moduleSettings)||[];
  return list.find(r=>text(r.moduleKey||r.module_key)===CUSTOMER_PORTAL_KEY)||null;
}

function isCustomerPortalEnabled(){
  const row=customerPortalSettingRow();
  return row!==null?row.enabled===true:false;
}

async function setCustomerPortal(enabled){
  if(!canManageModules()) throw new Error('Only a business owner or administrator can change module settings.');
  const api=window.H38_SUPABASE_SHARED_CLIENT&&window.H38_SUPABASE_SHARED_CLIENT.ensure?window.H38_SUPABASE_SHARED_CLIENT.ensure():null;
  if(!api) throw new Error('Secure settings connection is unavailable.');
  const bid=businessId();
  if(!bid) throw new Error('Open a business first.');
  const sess=await api.auth.getSession();
  const user=sess&&sess.data&&sess.data.session&&sess.data.session.user;
  if(!user) throw new Error('Sign in again before changing this setting.');
  const nowTs=new Date().toISOString();
  const row={business_id:bid,module_key:CUSTOMER_PORTAL_KEY,enabled:!!enabled,
    config:{updatedBy:user.id,updatedAt:nowTs},updated_at:nowTs};
  const res=await api.from('business_module_settings').upsert(row,{onConflict:'business_id,module_key'});
  if(res.error) throw res.error;
  if(window.state&&window.state.snapshot){
    if(!Array.isArray(window.state.snapshot.moduleSettings)) window.state.snapshot.moduleSettings=[];
    const list=window.state.snapshot.moduleSettings;
    const i=list.findIndex(r=>text(r.moduleKey||r.module_key)===CUSTOMER_PORTAL_KEY);
    const snapRow={module_key:CUSTOMER_PORTAL_KEY,enabled:!!enabled,config:row.config};
    if(i>=0) list[i]=Object.assign({},list[i],snapRow); else list.push(snapRow);
  }
  return !!enabled;
}

// ---- Online Payments (Stripe Connect): server-backed tenant setting ----
// Stored in business_module_settings (module_key='online_payments').
// enabled = the owner's master switch (mirrors the online_payments_enabled
// feature toggle); config holds ONLY connection facts (stripeAccountId,
// chargesEnabled, payoutsEnabled, detailsSubmitted) — never secrets.
// Missing row or enabled!==true means OFF: no customer sees a pay option,
// and the edge functions refuse checkout links server-side too. Each
// business connects its OWN Stripe account; money settles to that
// business's bank. H38 never holds or routes customer funds.
const ONLINE_PAYMENTS_KEY='online_payments';

function onlinePaymentsSettingRow(){
  const list=(window.state&&window.state.snapshot&&window.state.snapshot.moduleSettings)||[];
  return list.find(r=>text(r.moduleKey||r.module_key)===ONLINE_PAYMENTS_KEY)||null;
}

function getOnlinePaymentsSetting(){
  const row=onlinePaymentsSettingRow();
  const config=(row&&(row.config||row.Config))||{};
  return {
    enabled:row?row.enabled===true:false,
    connected:!!text(config.stripeAccountId),
    chargesEnabled:config.chargesEnabled===true,
    payoutsEnabled:config.payoutsEnabled===true,
    detailsSubmitted:config.detailsSubmitted===true,
    config
  };
}

function isOnlinePaymentsEnabled(){
  const s=getOnlinePaymentsSetting();
  return s.enabled===true;
}

// Payments are actually usable by customers only when the switch is ON
// and Stripe says the connected account can take charges.
function isOnlinePaymentsReady(){
  const s=getOnlinePaymentsSetting();
  return s.enabled&&s.connected&&s.chargesEnabled;
}

async function setOnlinePaymentsEnabled(enabled){
  if(!canManageModules()) throw new Error('Only a business owner or administrator can change module settings.');
  const api=window.H38_SUPABASE_SHARED_CLIENT&&window.H38_SUPABASE_SHARED_CLIENT.ensure?window.H38_SUPABASE_SHARED_CLIENT.ensure():null;
  if(!api) throw new Error('Secure settings connection is unavailable.');
  const bid=businessId();
  if(!bid) throw new Error('Open a business first.');
  const sess=await api.auth.getSession();
  const user=sess&&sess.data&&sess.data.session&&sess.data.session.user;
  if(!user) throw new Error('Sign in again before changing this setting.');
  const current=getOnlinePaymentsSetting();
  const nowTs=new Date().toISOString();
  // Preserve the Stripe connection facts; only the switch + audit change.
  const config=Object.assign({},current.config,{updatedBy:user.id,updatedAt:nowTs});
  const row={business_id:bid,module_key:ONLINE_PAYMENTS_KEY,enabled:!!enabled,config,updated_at:nowTs};
  const res=await api.from('business_module_settings').upsert(row,{onConflict:'business_id,module_key'});
  if(res.error) throw res.error;
  if(window.state&&window.state.snapshot){
    if(!Array.isArray(window.state.snapshot.moduleSettings)) window.state.snapshot.moduleSettings=[];
    const list=window.state.snapshot.moduleSettings;
    const i=list.findIndex(r=>text(r.moduleKey||r.module_key)===ONLINE_PAYMENTS_KEY);
    const snapRow={module_key:ONLINE_PAYMENTS_KEY,enabled:!!enabled,config};
    if(i>=0) list[i]=Object.assign({},list[i],snapRow); else list.push(snapRow);
  }
  const toggles=getToggles();
  toggles['online_payments_enabled']=!!enabled;
  saveToggles(toggles);
  return !!enabled;
}

async function invokeStripeConnect(action,extra){
  const api=window.H38_SUPABASE_SHARED_CLIENT&&window.H38_SUPABASE_SHARED_CLIENT.ensure?window.H38_SUPABASE_SHARED_CLIENT.ensure():null;
  if(!api) throw new Error('Secure connection is unavailable.');
  const bid=businessId();
  if(!bid) throw new Error('Open a business first.');
  const res=await api.functions.invoke('h38-stripe-connect',{body:Object.assign({action,businessId:bid},extra||{})});
  if(res.error) throw new Error(res.error.message||String(res.error));
  const data=res.data||{};
  if(data.status&&data.status!=='PASS') throw new Error(data.error||'Stripe request failed.');
  return data;
}

function renderOnlinePaymentsCard(){
  const s=getOnlinePaymentsSetting();
  const can=canManageModules();
  let stateLine, detail;
  if(!s.connected){
    stateLine='Stripe is not connected yet';
    detail='Connect your own Stripe account so customers can pay invoices online. Money settles straight to your bank account — the Office never holds it. Stripe fees: 2.9% + 30¢ per card payment, or 0.8% (max $5) for bank debit. No setup or monthly fee from Stripe, and nothing to pay until a customer pays.';
  } else if(!s.chargesEnabled){
    stateLine='Stripe connected — onboarding not finished';
    detail='Stripe still needs a few details before it can take charges. Tap "Continue Stripe setup", then "Refresh status". Fees: 2.9% + 30¢ per card payment, or 0.8% (max $5) for bank debit — no surprises.';
  } else {
    stateLine='Stripe connected and ready'+(s.enabled?' — online payments are ON':' — online payments are OFF');
    detail=s.enabled
      ? 'Customers see a "Pay online" button on their invoices. Payments mark invoices paid automatically and email the customer a receipt. Refunds are issued by you, from the invoice, with a confirmation — nothing refunds itself.'
      : 'Turn on "Online payments" in the Money toggles above to let customers pay. Until then no pay option appears anywhere.';
  }
  return `
    <section class="card span12" id="onlinePaymentsCard">
      <h2>💳 Online Payments (Stripe)</h2>
      <p class="muted small">Let customers pay invoices online with a card or bank debit. <strong>Your</strong> Stripe account, <strong>your</strong> bank — the Office only keeps the records. Stays off until you turn it on below.</p>
      <div class="row">
        <div class="row-top"><strong>${esc(stateLine)}</strong></div>
        <small>${esc(detail)}</small>
        <div class="actions">
          ${s.connected
            ? `<button type="button" class="secondary" data-stripe-refresh ${can?'':'disabled'}>Refresh status</button>
               ${s.chargesEnabled?'':`<button type="button" data-stripe-connect ${can?'':'disabled'}>Continue Stripe setup</button>`}`
            : `<button type="button" data-stripe-connect ${can?'':'disabled'}>Connect Stripe</button>`}
        </div>
        ${can?'<small>Connecting opens Stripe\'s own secure onboarding page. Your bank and tax details go to Stripe, never into the Office.</small>':'<small>Only an owner or administrator can connect Stripe.</small>'}
      </div>
    </section>
  `;
}

function bindOnlinePayments(){
  const connectBtn=document.querySelector('[data-stripe-connect]');
  if(connectBtn&&!connectBtn.dataset.h38Bound){
    connectBtn.dataset.h38Bound='1';
    connectBtn.onclick=async()=>{
      connectBtn.disabled=true;
      try{
        const data=await invokeStripeConnect('account_link');
        if(data.url){window.location.href=data.url;return;}
        throw new Error('Stripe did not return a setup link.');
      }catch(e){
        if(typeof toast==='function') toast('Could not start Stripe setup: '+(e&&e.message?e.message:e),true);
        connectBtn.disabled=false;
      }
    };
  }
  const refreshBtn=document.querySelector('[data-stripe-refresh]');
  if(refreshBtn&&!refreshBtn.dataset.h38Bound){
    refreshBtn.dataset.h38Bound='1';
    refreshBtn.onclick=async()=>{
      refreshBtn.disabled=true;
      try{
        const data=await invokeStripeConnect('account_status');
        // The edge function already saved the fresh facts server-side;
        // mirror them into the in-memory snapshot so this card agrees.
        if(window.state&&window.state.snapshot){
          if(!Array.isArray(window.state.snapshot.moduleSettings)) window.state.snapshot.moduleSettings=[];
          const cur=getOnlinePaymentsSetting();
          const list=window.state.snapshot.moduleSettings;
          const i=list.findIndex(r=>text(r.moduleKey||r.module_key)===ONLINE_PAYMENTS_KEY);
          const snapRow={module_key:ONLINE_PAYMENTS_KEY,enabled:cur.enabled,config:Object.assign({},cur.config,{
            stripeAccountId:cur.config.stripeAccountId||'',
            chargesEnabled:data.chargesEnabled===true,
            payoutsEnabled:data.payoutsEnabled===true,
            detailsSubmitted:data.detailsSubmitted===true
          })};
          if(i>=0) list[i]=Object.assign({},list[i],snapRow); else list.push(snapRow);
        }
        const card=document.getElementById('onlinePaymentsCard');
        if(card){
          const tmp=document.createElement('div');
          tmp.innerHTML=renderOnlinePaymentsCard();
          const fresh=tmp.firstElementChild;
          if(fresh){card.replaceWith(fresh);bindOnlinePayments();}
        }
        if(typeof toast==='function') toast(data.chargesEnabled?'Stripe is ready to take charges.':'Stripe status refreshed — onboarding not finished yet.');
      }catch(e){
        if(typeof toast==='function') toast('Could not refresh Stripe status: '+(e&&e.message?e.message:e),true);
      }finally{
        refreshBtn.disabled=false;
      }
    };
  }
}

function renderRepairWarningsCard(){
  try{
    if(window.H38FailureChains&&typeof window.H38FailureChains.ownerCard==='function')
      return window.H38FailureChains.ownerCard();
  }catch(e){}
  return '';
}
function renderCustomerPortalCard(){
  const enabled=isCustomerPortalEnabled();
  const can=canManageModules();
  return `
    <section class="card span12" id="customerPortalCard">
      <h2>Customer Self-Service Portal</h2>
      <p class="muted small">Customers sign in with a one-time secure link (no passwords) to review and approve quotes, see invoices, request payments, and book service. <strong>Stays off until you turn it on</strong> — the public portal page refuses every request while this is off.</p>
      <div class="row">
        <div class="row-top">
          <strong>Customer portal ${enabled?'is ON':'is OFF'}</strong>
          <label class="switch">
            <input type="checkbox" data-customer-portal ${enabled?'checked':''} ${can?'':'disabled'}>
            <span class="slider"></span>
          </label>
        </div>
        <small>${can?'Flip the switch to let customers use the self-service portal.':'Only an owner or administrator can change this.'}</small>
        ${enabled?'<small>Send customers their sign-in link from the customer record, or let them request one on the portal page. Quote approvals notify you to convert the quote to a job — nothing schedules itself.</small>':'<small>While off, portal links and sign-in requests are rejected. Quote approval and online payment stay owner-only in the Office.</small>'}
      </div>
    </section>
  `;
}

function bindCustomerPortal(){
  const checkbox=document.querySelector('[data-customer-portal]');
  if(!checkbox||checkbox.dataset.h38Bound) return;
  checkbox.dataset.h38Bound='1';
  checkbox.onchange=async()=>{
    const want=checkbox.checked;
    if(want){
      const ok=window.confirm('Turn ON the customer self-service portal? Customers will be able to sign in with a secure one-time link, review and approve quotes, see invoices, and request service online. Quote approvals and payment requests come to you for review — nothing schedules or charges itself.');
      if(!ok){checkbox.checked=false;return;}
    }
    checkbox.disabled=true;
    try{
      const enabled=await setCustomerPortal(want);
      const card=document.getElementById('customerPortalCard');
      if(card){
        const tmp=document.createElement('div');
        tmp.innerHTML=renderCustomerPortalCard();
        const fresh=tmp.firstElementChild;
        if(fresh){card.replaceWith(fresh);bindCustomerPortal();}
      }
      if(typeof toast==='function') toast('Customer portal '+(enabled?'turned ON.':'turned OFF.'));
    }catch(e){
      checkbox.checked=!want;
      if(typeof toast==='function') toast('Could not save: '+(e&&e.message?e.message:e),true);
    }finally{
      checkbox.disabled=false;
    }
  };
}

function renderOwnerControls(){
  const toggles=getToggles();
  const visibility=getModuleVisibility();
  /* WS4 B10: rendering change only. The checked state, data-toggle /
   * data-module ids, storage keys, defaults and server writes below are
   * byte-identical in behavior to the previous list rendering — the same
   * inputs are emitted, now as cards in the .h38-addon-grid. */
  const featureOn=f=>(f.id==='repair_guide_enabled'?isRepairGuideEnabled():f.id==='recommended_vendors_enabled'?isRecommendedVendorsEnabled():f.id==='inventory_enabled'?isInventoryEnabled():f.id==='online_payments_enabled'?isOnlinePaymentsEnabled():f.id==='ai_lead_responder'?isLeadResponderEnabled():f.id==='auto_send_review_requests'?isAutoSendReviewEnabled():f.id==='owner_notify_customer'?isOwnerNotifyEnabled('customer'):f.id==='owner_notify_review'?isOwnerNotifyEnabled('review'):f.id==='owner_notify_push'?isOwnerNotifyEnabled('push'):isFeatureEnabled(f.id));
  const categories={};
  FEATURE_TOGGLES.forEach(f=>{
    if(!categories[f.category]) categories[f.category]=[];
    categories[f.category].push(f);
  });

  const toggleSections=Object.entries(categories).map(([cat,features])=>`
    <section class="card span12">
      <h2>${esc(cat)}</h2>
      <div class="h38-addon-grid">
        ${features.map(f=>{const on=!!featureOn(f);return `
          <article class="card h38-addon-card">
            <div class="row-top">
              <strong>${f.icon} ${esc(f.title)}</strong>
              <span class="pill ${on?'good':''}">${on?'On':'Off'}</span>
            </div>
            <p class="muted small">${esc(f.desc)}</p>
            <label class="switch">
              <input type="checkbox" data-toggle="${f.id}" ${on?'checked':''}>
              <span class="slider"></span>
            </label>
          </article>
        `;}).join('')}
      </div>
    </section>
  `).join('');

  const moduleSection=`
    <section class="card span12">
      <h2>Module Visibility</h2>
      <p class="muted small">Turn off modules you don't use. Hidden modules won't appear in navigation.</p>
      <div class="h38-addon-grid">
        ${MODULES.map(m=>`
          <article class="card h38-addon-card owner-controls-module-row">
            <div class="row-top">
              <strong>${m.icon?m.icon+' ':''}${esc(m.title)}</strong>
              <span class="pill ${visibility[m.id]!==false?'good':''}">${visibility[m.id]!==false?'On':'Off'}</span>
            </div>
            <p class="muted small">${esc(m.desc)}</p>
            <label class="switch">
              <input type="checkbox" data-module="${m.id}" ${visibility[m.id]!==false?'checked':''}>
              <span class="slider"></span>
            </label>
          </article>
        `).join('')}
      </div>
    </section>
  `;

  const setupDetails=(html,label)=>html?`<details class="h38-addon-setup"><summary>Set up — ${esc(label)}</summary>${html}</details>`:'';
  const serverModuleOn=key=>{try{const row=((window.state&&window.state.snapshot&&window.state.snapshot.moduleSettings)||[]).find(r=>text(r.moduleKey||r.module_key)===key);return row?row.enabled===true:false;}catch(e){return false;}};
  const integrationCards=`
    <section class="card span12">
      <h2>Integrations</h2>
      <div class="h38-addon-grid">
        <article class="card h38-addon-card">
          <div class="row-top"><strong>QuickBooks (tax)</strong><span class="pill">Set up in Accounting</span></div>
          <p class="muted small">Connect QuickBooks for tax time. Your books stay in the Office.</p>
          <details class="h38-addon-setup"><summary>Set up</summary><p class="muted small">The QuickBooks card lives in Accounting, beside your bills, with its connection state.</p><div class="actions"><button type="button" class="secondary" data-h38-addon-open="accounting">Open Accounting</button></div></details>
        </article>
        <article class="card h38-addon-card">
          <div class="row-top"><strong>AI receptionist</strong><span class="pill ${serverModuleOn('ai_receptionist')?'good':''}">${serverModuleOn('ai_receptionist')?'On':'Off'}</span></div>
          <p class="muted small">Hank answers and drafts follow-ups for review. Nothing sends without your approval.</p>
          <details class="h38-addon-setup"><summary>Set up</summary><p class="muted small">Receptionist setup and testing live in Messages, on the Receptionist tab.</p><div class="actions"><button type="button" class="secondary" data-h38-addon-open="messages">Open Messages</button></div></details>
        </article>
        <article class="card h38-addon-card">
          <div class="row-top"><strong>Phone &amp; texting</strong><span class="pill ${serverModuleOn('sms_sender')?'good':''}">${serverModuleOn('sms_sender')?'On':'Off'}</span></div>
          <p class="muted small">Your own carrier account and number for customer texts. Setup is $99 one-time, free for the founding 10.</p>
          <details class="h38-addon-setup"><summary>Set up</summary><p class="muted small">Texting setup lives in Messages, on the Customer texts tab, with consent and STOP rules.</p><div class="actions"><button type="button" class="secondary" data-h38-addon-open="messages">Open Messages</button></div></details>
        </article>
        <article class="card h38-addon-card">
          <div class="row-top"><strong>Online booking</strong></div>
          <p class="muted small">Customers request service online; requests land on Today and in Customers as new work.</p>
          <details class="h38-addon-setup"><summary>Set up</summary><p class="muted small">Booking requests arrive as intake — review them on Today or in Customers. The AI lead responder toggle above drafts follow-ups when booking is on.</p><div class="actions"><button type="button" class="secondary" data-h38-addon-open="today">Open Today</button></div></details>
        </article>
      </div>
    </section>
  `;

  const comingSoonCards=`
    <section class="card span12">
      <h2>Coming soon</h2>
      <div class="h38-addon-grid">
        <article class="card h38-addon-card">
          <div class="row-top"><strong>Tap to Pay</strong><span class="pill">Coming soon</span></div>
          <p class="muted small">Take a card payment by tapping a card to your phone.</p>
          <p class="muted small">Customers can pay online through your Stripe account, or record a manual payment.</p>
        </article>
        <article class="card h38-addon-card">
          <div class="row-top"><strong>Bill pay</strong><span class="pill">Coming soon</span></div>
          <p class="muted small">Pay vendor bills from the Office.</p>
          <p class="muted small">Prepare and approve bills in Accounting today.</p>
        </article>
        <article class="card h38-addon-card">
          <div class="row-top"><strong>Rentals</strong><span class="pill">Coming soon</span></div>
          <p class="muted small">Rent equipment by the day or week, take deposits, and sell — all in the same books.</p>
        </article>
        <article class="card h38-addon-card">
          <div class="row-top"><strong>Crew phone tracking</strong><span class="pill">Coming soon</span></div>
          <p class="muted small">See crew phones on the map without a separate vehicle device.</p>
          <p class="muted small">Connect Bouncie for live vehicle positions today.</p>
        </article>
      </div>
    </section>
  `;

  return `
    <div class="grid">
      ${setupDetails(renderMachineShopCard(),'Machine Shop')}
      ${setupDetails(renderCustomerPortalCard(),'Customer portal')}
      ${setupDetails(renderOnlinePaymentsCard(),'Online payments (Stripe)')}
      ${renderRepairWarningsCard()}
      ${toggleSections}
      ${moduleSection}
      ${integrationCards}
      ${comingSoonCards}
    </div>
  `;
}


function bindOwnerControls(){
  document.querySelectorAll('[data-h38-addon-open]').forEach(btn=>{if(btn.dataset.h38Bound)return;btn.dataset.h38Bound='1';btn.onclick=()=>{if(typeof window.openPage==='function')window.openPage(btn.dataset.h38AddonOpen);};});
  bindLeadResponder();
  bindMachineShop();
  bindCustomerPortal();
  bindOnlinePayments();
  try{if(window.H38FailureChains&&typeof window.H38FailureChains.bindOwnerCard==='function')window.H38FailureChains.bindOwnerCard();}catch(e){}
  document.querySelectorAll('[data-toggle]').forEach(checkbox=>{
    checkbox.onchange=async()=>{
      const id=checkbox.dataset.toggle;
      // The Repair Guide toggle is mirrored to the server so the standalone
      // app can verify the owner's intent. Revert locally if the write fails.
      if(id==='repair_guide_enabled'){
        const want=checkbox.checked;
        if(want){
          const ok=window.confirm('Turn ON the Repair Guide integration? The standalone Repair Guide app can then send diagnoses to this Office as job and quote drafts (owner review required, nothing is sent to customers). The Repair Guide keeps working on its own either way.');
          if(!ok){checkbox.checked=false;return;}
        }
        checkbox.disabled=true;
        try{
          await setRepairGuideEnabled(want);
          if(typeof toast==='function') toast('Repair Guide integration '+(want?'turned ON.':'turned OFF.'));
          if(window.renderNav) try{window.renderNav();}catch(e){}
        }catch(e){
          checkbox.checked=!want;
          if(typeof toast==='function') toast('Could not save: '+(e&&e.message?e.message:e),true);
        }finally{
          checkbox.disabled=false;
        }
        return;
      }
      // Recommended Vendors is mirrored to the server: the directory edge
      // function enforces it before returning partners or lighting up the
      // tenant website block. Revert locally if the write fails.
      if(id==='recommended_vendors_enabled'){
        const want=checkbox.checked;
        if(want){
          const ok=window.confirm('Turn ON Recommended Vendors? Your Office gets the Vendors directory (suppliers and services approved by Highway 38) and, if your website uses the "Recommended local pros" block, it lights up there too. Nothing is listed without Highway 38 review.');
          if(!ok){checkbox.checked=false;return;}
        }
        checkbox.disabled=true;
        try{
          await setRecommendedVendorsEnabled(want);
          if(typeof toast==='function') toast('Recommended Vendors '+(want?'turned ON.':'turned OFF.'));
          if(window.renderNav) try{window.renderNav();}catch(e){}
        }catch(e){
          checkbox.checked=!want;
          if(typeof toast==='function') toast('Could not save: '+(e&&e.message?e.message:e),true);
        }finally{
          checkbox.disabled=false;
        }
        return;
      }
      // Inventory is mirrored to the server: the Inventory page, quote and
      // invoice item pickers and the payment-time stock decrement all check
      // it. Revert locally if the write fails.
      if(id==='inventory_enabled'){
        const want=checkbox.checked;
        if(want){
          const ok=window.confirm('Turn ON Inventory & Materials? The Inventory page appears in navigation with stock counts, a reorder list, items you can sell on quotes and invoices, rentals and an advertised-stock list. Stock only moves when you receive, issue, or record a payment — nothing auto-orders.');
          if(!ok){checkbox.checked=false;return;}
        }
        checkbox.disabled=true;
        try{
          await setInventoryEnabled(want);
          if(typeof toast==='function') toast('Inventory & Materials '+(want?'turned ON.':'turned OFF.'));
          if(window.renderNav) try{window.renderNav();}catch(e){}
        }catch(e){
          checkbox.checked=!want;
          if(typeof toast==='function') toast('Could not save: '+(e&&e.message?e.message:e),true);
        }finally{
          checkbox.disabled=false;
        }
        return;
      }
      // Auto-send review requests is server-backed: the h38-review-scheduler
      // edge function reads ONLY the mirrored business_module_settings row
      // before claiming due review texts. Revert locally if the write fails.
      if(id==='auto_send_review_requests'){
        const want=checkbox.checked;
        if(want){
          const ok=window.confirm('Turn ON auto-send review requests? When a job is marked complete, the Office will automatically text the customer your review-request message — no per-job prompt. It uses your template, send delay and review links from Settings, and still respects quiet hours (9pm–8am), consent and STOP.');
          if(!ok){checkbox.checked=false;return;}
        }
        checkbox.disabled=true;
        try{
          await setAutoSendReviewEnabled(want);
          if(typeof toast==='function') toast('Auto-send review requests '+(want?'turned ON.':'turned OFF.'));
        }catch(e){
          checkbox.checked=!want;
          if(typeof toast==='function') toast('Could not save: '+(e&&e.message?e.message:e),true);
        }finally{
          checkbox.disabled=false;
        }
        return;
      }
      // Owner notification switches are server-backed: the h38-owner-notify
      // edge function reads ONLY the mirrored business_module_settings row
      // (module_key 'owner_notifications') before producing alerts.
      // Revert locally if the write fails.
      if(OWNER_NOTIFY_KINDS[id]){
        const want=checkbox.checked;
        checkbox.disabled=true;
        try{
          await setOwnerNotifyEnabled(OWNER_NOTIFY_KINDS[id],want);
          if(typeof toast==='function') toast('Notification setting saved.');
          if(window.H38OwnerNotify&&typeof window.H38OwnerNotify.refresh==='function') window.H38OwnerNotify.refresh();
        }catch(e){
          checkbox.checked=!want;
          if(typeof toast==='function') toast('Could not save: '+(e&&e.message?e.message:e),true);
        }finally{
          checkbox.disabled=false;
        }
        return;
      }
      // AI Lead Responder is server-backed too (the booking function reads
      // the mirrored row). Revert locally if the write fails.
      if(id==='ai_lead_responder'){
        const want=checkbox.checked;
        if(want){
          const ok=window.confirm('Turn ON the AI lead responder? Every new online booking will queue a follow-up draft from Hank for your one-tap review and send. Nothing is ever sent to a customer without your tap.');
          if(!ok){checkbox.checked=false;return;}
        }
        checkbox.disabled=true;
        try{
          await setLeadResponderEnabled(want,leadResponderTemplate());
          if(typeof toast==='function') toast('AI lead responder '+(want?'turned ON. Hank will draft follow-ups for new bookings.':'turned OFF.'));
        }catch(e){
          checkbox.checked=!want;
          if(typeof toast==='function') toast('Could not save: '+(e&&e.message?e.message:e),true);
        }finally{
          checkbox.disabled=false;
        }
        return;
      }
      // Online Payments is server-backed (portal + edge functions enforce
      // it). Turning ON requires a connected Stripe account with charges
      // enabled, so customers never see a pay option that cannot work.
      if(id==='online_payments_enabled'){
        const want=checkbox.checked;
        if(want){
          const s=getOnlinePaymentsSetting();
          if(!s.connected||!s.chargesEnabled){
            checkbox.checked=false;
            if(typeof toast==='function') toast('Connect Stripe first (card above) and finish setup, then turn online payments on.',true);
            return;
          }
          const ok=window.confirm('Turn ON online payments? Customers will see a "Pay online" button on invoices in their portal and on pay links you send. Card payments cost 2.9% + 30¢ and bank debit 0.8% (max $5), charged by Stripe against the payment. Money goes straight to your bank. Manual payments keep working.');
          if(!ok){checkbox.checked=false;return;}
        }
        checkbox.disabled=true;
        try{
          await setOnlinePaymentsEnabled(want);
          if(typeof toast==='function') toast('Online payments '+(want?'turned ON.':'turned OFF.'));
        }catch(e){
          checkbox.checked=!want;
          if(typeof toast==='function') toast('Could not save: '+(e&&e.message?e.message:e),true);
        }finally{
          checkbox.disabled=false;
        }
        return;
      }
      const toggles=getToggles();
      toggles[checkbox.dataset.toggle]=checkbox.checked;
      saveToggles(toggles);
      if(typeof toast==='function') toast('Feature '+(checkbox.checked?'enabled':'disabled')+'.');
    };
  });
  
  document.querySelectorAll('[data-module]').forEach(checkbox=>{
    checkbox.onchange=()=>{
      const visibility=getModuleVisibility();
      visibility[checkbox.dataset.module]=checkbox.checked;
      saveModuleVisibility(visibility);
      if(typeof toast==='function') toast('Module '+(checkbox.checked?'shown':'hidden')+'.');
    };
  });
}

// Expose globally
window.H38OwnerControls={
  render:renderOwnerControls,
  bind:bindOwnerControls,
  isEnabled:isFeatureEnabled,
  isRepairGuideEnabled:isRepairGuideEnabled,
  setRepairGuideEnabled:setRepairGuideEnabled,
  isRecommendedVendorsEnabled:isRecommendedVendorsEnabled,
  setRecommendedVendorsEnabled:setRecommendedVendorsEnabled,
  isInventoryEnabled:isInventoryEnabled,
  setInventoryEnabled:setInventoryEnabled,
  setLeadResponderEnabled:setLeadResponderEnabled,
  isLeadResponderEnabled:isLeadResponderEnabled,
  isAutoSendReviewEnabled:isAutoSendReviewEnabled,
  setAutoSendReviewEnabled:setAutoSendReviewEnabled,
  isOwnerNotifyEnabled:isOwnerNotifyEnabled,
  setOwnerNotifyEnabled:setOwnerNotifyEnabled,
  ownerNotifyResolved:ownerNotifyResolved,
  isModuleVisible:isModuleVisible,
  H38ModuleVisible:h38ModuleVisible,
  isMachineShopEnabled:isMachineShopEnabled,
  setMachineShop:setMachineShop,
  isCustomerPortalEnabled:isCustomerPortalEnabled,
  setCustomerPortal:setCustomerPortal,
  isOnlinePaymentsEnabled:isOnlinePaymentsEnabled,
  isOnlinePaymentsReady:isOnlinePaymentsReady,
  setOnlinePaymentsEnabled:setOnlinePaymentsEnabled,
  getOnlinePaymentsSetting:getOnlinePaymentsSetting,
  applyVisibility:()=>applyModuleVisibility(getModuleVisibility()),
  FEATURES:FEATURE_TOGGLES,
  MODULES:MODULES,
  BUILD
};

// One-shot migration (2026-10-25): if this business has toggles saved in
// this device's localStorage but no server FeatureToggles record yet,
// push the local values up — owner/admin only, once per page load, and
// only after the snapshot has hydrated (moduleSettings present), so an
// existing server record is never overwritten by a stale local copy.
let featureToggleSeedDone=false;
function seedFeatureTogglesToServer(){
  if(featureToggleSeedDone)return;
  const bid=businessId();
  if(!bid)return;
  const snapshot=window.state&&window.state.snapshot;
  if(!snapshot||!Array.isArray(snapshot.moduleSettings))return;
  const user=snapshot.user;
  const role=text(user&&(user.roleName||user.role)).toLowerCase();
  if(role!=='owner'&&role!=='administrator')return;
  if(serverToggles()){featureToggleSeedDone=true;return;}
  let raw=null;
  try{raw=localStorage.getItem('h38-feature-toggles-'+bid);}catch(e){}
  if(!raw)return;
  featureToggleSeedDone=true;
  saveToggles(getToggles());
}
window.addEventListener('h38:business-snapshot-updated',()=>{try{seedFeatureTogglesToServer();}catch(e){}});
setTimeout(()=>{try{seedFeatureTogglesToServer();}catch(e){}},4000);

// Auto-apply on load
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',()=>window.H38OwnerControls.applyVisibility());
}else{
  setTimeout(()=>window.H38OwnerControls.applyVisibility(),100);
}
})();
