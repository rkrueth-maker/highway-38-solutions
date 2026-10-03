(function(){
'use strict';
// H38 Owner Controls: feature toggles and module visibility.
// Owner can turn features on/off and hide modules they don't use.
const BUILD='20261003-owner-controls-1';
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
];

// Module visibility - show/hide entire sections
const MODULES=[
  {id:'today',title:'Today',icon:'📊',desc:'Daily dashboard and overview'},
  {id:'customers',title:'Customers',icon:'👥',desc:'Customer list and details'},
  {id:'quotes',title:'Quotes',icon:'📝',desc:'Quote builder and management'},
  {id:'jobs',title:'Jobs',icon:'🔧',desc:'Job tracking and management'},
  {id:'schedule',title:'Schedule',icon:'📅',desc:'Calendar and appointments'},
  {id:'money',title:'Money',icon:'💰',desc:'Invoices, payments, expenses'},
  {id:'fleet',title:'Fleet',icon:'🚛',desc:'Vehicle tracking and management'},
  {id:'inventory',title:'Inventory',icon:'📦',desc:'Parts and materials inventory'},
  {id:'documents',title:'Documents',icon:'📄',desc:'File storage and documents'},
  {id:'reports',title:'Reports',icon:'📈',desc:'Business reports and analytics'},
  {id:'team',title:'Team',icon:'👷',desc:'Staff management'},
  {id:'messages',title:'Messages',icon:'💬',desc:'Customer communications'},
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
                <input type="checkbox" data-toggle="${f.id}" ${toggles[f.id]?'checked':''}>
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
      <div class="grid">
        ${MODULES.map(m=>`
          <div class="row">
            <div class="row-top">
              <strong>${m.icon} ${esc(m.title)}</strong>
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
        <h2>Owner Controls</h2>
        <p class="muted">Turn features on/off and control which modules appear in your Office. Changes apply immediately.</p>
      </section>
      ${toggleSections}
      ${moduleSection}
    </div>
  `;
}

function bindOwnerControls(){
  document.querySelectorAll('[data-toggle]').forEach(checkbox=>{
    checkbox.onchange=()=>{
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
  isModuleVisible:isModuleVisible,
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
