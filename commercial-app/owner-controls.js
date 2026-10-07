(function(){
'use strict';
// H38 Owner Controls: feature toggles and module visibility.
// Owner can turn features on/off and hide modules they don't use.
const BUILD='20261004-machine-shop-1';
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
  {id:'gps_tracking',title:'GPS location tracking',desc:'Track staff location during work hours.',icon:'📍',default:false,category:'Fleet'},
  {id:'ai_suggestions',title:'AI suggestions',desc:'Show AI-powered suggestions throughout the app.',icon:'🤖',default:true,category:'AI'},
  {id:'repair_guide_enabled',title:'Repair Guide integration',desc:'Connect the standalone Repair Guide app: send diagnoses to Office jobs and quote drafts, link garage vehicles to customers, deep links both ways. Off by default — the Repair Guide keeps working standalone.',icon:'🔧',default:false,category:'Modules'},
  {id:'auto_review_requests',title:'Auto-ask for reviews',desc:'When a job is marked complete, prompt to send the customer a review request text. Rotates across your Google, Facebook, and Yelp review links from Settings, with one polite follow-up nudge after a few days.',icon:'⭐',default:false,category:'Customers'},
  {id:'on_my_way_texts',title:'"On My Way" texts',desc:'Show a "Text: On My Way" button on scheduled jobs so techs can text customers their ETA. Queued for owner approval — nothing sends automatically.',icon:'🚗',default:false,category:'Customers'},
  {id:'card_on_file',title:'Card on file + card charges',desc:'Save customer cards as processor tokens and charge invoices with one tap. Test mode moves no real money. Auto-charge always needs owner approval — never silent.',icon:'',default:false,category:'Money'},
  {id:'online_payments_enabled',title:'Online payments (cards & bank debit)',desc:'Let customers pay invoices online through YOUR OWN Stripe account — money settles straight to your bank; the Office never holds it. Stripe charges 2.9% + 30¢ per card payment, or 0.8% (max $5) for bank debit; no other fees. Connect Stripe below first, then turn this on. Off by default; manual payments keep working either way.',icon:'💳',default:false,category:'Money'},
  {id:'recurring_jobs_enabled',title:'Recurring jobs & service plans',desc:'Set repeat visits (lawn, snow, maintenance plans) on a customer once, then generate the upcoming jobs from Today. You tap to generate — nothing is created or charged automatically. Off by default.',icon:'🔁',default:false,category:'Jobs'},
  {id:'ai_lead_responder',title:'AI lead responder',desc:'When a new online booking comes in, Kit queues a personal follow-up draft for your one-tap review and send — after hours too, so no lead sits cold. You approve every message; nothing sends itself. Needs Online Booking on. Off by default.',icon:'📞',default:false,category:'AI'},
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

function getToggles(){
  try{
    const raw=localStorage.getItem('h38-feature-toggles-'+businessId());
    if(raw) return JSON.parse(raw);
  }catch(e){}
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
  localStorage.setItem('h38-feature-toggles-'+businessId(),JSON.stringify(toggles));
  // Queue for sync
  if(typeof queueOperation==='function'){
    queueOperation('SAVE_FEATURE_TOGGLES','FeatureToggles',businessId(),{toggles,updatedAt:new Date().toISOString()}).catch(()=>{});
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
  // Hide nav items for disabled modules
  MODULES.forEach(m=>{
    const navItem=document.querySelector(`[data-nav="${m.id}"]`);
    if(navItem){
      navItem.style.display=visibility[m.id]===false?'none':'';
    }
  });
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
  box.innerHTML=`<label style="display:block;margin-top:8px"><small>Your instant-reply wording (Kit drafts the follow-up from it):</small><textarea data-lead-template-text rows="2" style="width:100%" placeholder="Thanks for reaching out! We got your request and will confirm shortly. — the team">${esc(leadResponderTemplate())}</textarea></label><button type="button" class="secondary" data-lead-template-save>Save wording</button>`;
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
  
  const categories={};
  FEATURE_TOGGLES.forEach(f=>{
    if(!categories[f.category]) categories[f.category]=[];
    categories[f.category].push(f);
  });

  const toggleSections=Object.entries(categories).map(([cat,features])=>`
    <section class="card span6">
      <h2>${esc(cat)}</h2>
      <div class="list">
        ${features.map(f=>`
          <div class="row">
            <div class="row-top">
              <strong>${f.icon} ${esc(f.title)}</strong>
              <label class="switch">
                <input type="checkbox" data-toggle="${f.id}" ${(f.id==='repair_guide_enabled'?isRepairGuideEnabled():f.id==='online_payments_enabled'?isOnlinePaymentsEnabled():f.id==='ai_lead_responder'?isLeadResponderEnabled():toggles[f.id])?'checked':''}>
                <span class="slider"></span>
              </label>
            </div>
            <small>${esc(f.desc)}</small>
          </div>
        `).join('')}
      </div>
    </section>
  `).join('');

  const moduleSection=`
    <section class="card span12">
      <h2>Module Visibility</h2>
      <p class="muted small">Turn off modules you don't use. Hidden modules won't appear in navigation.</p>
      <div class="list">
        ${MODULES.map(m=>`
          <div class="row owner-controls-module-row">
            <div class="row-top">
              <strong>${m.icon?m.icon+' ':''}${esc(m.title)}</strong>
              <label class="switch">
                <input type="checkbox" data-module="${m.id}" ${visibility[m.id]!==false?'checked':''}>
                <span class="slider"></span>
              </label>
            </div>
            <small>${esc(m.desc)}</small>
          </div>
        `).join('')}
      </div>
    </section>
  `;

  return `
    <div class="grid">
      <section class="card span12">
        <p class="muted">Turn features on/off and control which modules appear in your Office. Changes apply immediately.</p>
      </section>
      ${renderMachineShopCard()}
      ${renderCustomerPortalCard()}
      ${renderOnlinePaymentsCard()}
      ${renderRepairWarningsCard()}
      ${toggleSections}
      ${moduleSection}
    </div>
  `;
}

function bindOwnerControls(){
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
      // AI Lead Responder is server-backed too (the booking function reads
      // the mirrored row). Revert locally if the write fails.
      if(id==='ai_lead_responder'){
        const want=checkbox.checked;
        if(want){
          const ok=window.confirm('Turn ON the AI lead responder? Every new online booking will queue a follow-up draft from Kit for your one-tap review and send. Nothing is ever sent to a customer without your tap.');
          if(!ok){checkbox.checked=false;return;}
        }
        checkbox.disabled=true;
        try{
          await setLeadResponderEnabled(want,leadResponderTemplate());
          if(typeof toast==='function') toast('AI lead responder '+(want?'turned ON. Kit will draft follow-ups for new bookings.':'turned OFF.'));
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
  setLeadResponderEnabled:setLeadResponderEnabled,
  isLeadResponderEnabled:isLeadResponderEnabled,
  isModuleVisible:isModuleVisible,
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

// Auto-apply on load
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',()=>window.H38OwnerControls.applyVisibility());
}else{
  setTimeout(()=>window.H38OwnerControls.applyVisibility(),100);
}
})();
