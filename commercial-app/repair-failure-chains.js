(function(){
'use strict';
// H38 Repair — curated "often leads to bigger work" failure chains.
//
// Toggle-gated: inherits the Repair Guide Owner Control (default OFF) — no
// separate toggle. The Diagnose step matches entered symptoms + equipment
// against this table and pops a warning card. Works fully offline.
//
// Seed entries are curated from common mechanical knowledge. Owners can
// disable any seed entry and add their own shop-specific patterns under
// Owner Controls; custom entries sync like other owner settings.
const BUILD='20261005-failure-chains-1';
const text=v=>String(v==null?'':v).trim();
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const businessId=()=>text(window.state&&window.state.businessId);

// severity: 'watch' (mention it), 'likely' (commonly becomes the bigger job — quote accordingly),
// 'critical' (safety — do not let it leave / stop work)
const SEED=[
{id:'chain-coolant-head-gasket',equipmentTypes:['Vehicle','Machinery / Industrial','ATV / UTV'],symptomKeywords:['coolant','overheat','overheating','white smoke','milky','losing coolant'],severity:'likely',
 warning:'Coolant loss with overheating often ends at a failed head gasket or warped head — a far bigger job than a hose or thermostat. Pressure-test the system and check the oil for milkiness before quoting small.'},
{id:'chain-belt-tensioner',equipmentTypes:['Vehicle','Machinery / Industrial','Small engine'],symptomKeywords:['squeal','squeak','squealing','belt noise','belt wobble'],severity:'likely',
 warning:'A squealing belt with any wobble or play usually means the tensioner or an idler pulley bearing is failing. When it seizes it takes the belt with it — quote the tensioner/pulleys, not just a belt.'},
{id:'chain-small-engine-surge',equipmentTypes:['Small engine'],symptomKeywords:['surge','surging','hunting','runs rough','choke','only runs on choke'],severity:'likely',
 warning:'Surging or hunting on a small engine is the carburetor most of the time — usually a clogged jet from old fuel. Quote the carburetor service, not just a tune-up.'},
{id:'chain-appliance-error-board',equipmentTypes:['Appliance'],symptomKeywords:['error code','fault code','f1','e1','e2','display code','code '],severity:'watch',
 warning:'Repeated or shifting error codes usually point at the main control board rather than whatever sensor the code names. Boards are expensive — confirm the board before ordering parts.'},
{id:'chain-brake-grind',equipmentTypes:['Vehicle','ATV / UTV'],symptomKeywords:['grind','grinding','brake'],severity:'likely',
 warning:'Grinding brakes have usually eaten the rotors. Check the caliper slides too — seized slides cause the uneven wear that started it. Quote pads plus rotors and inspect the calipers.'},
{id:'chain-transmission-slip',equipmentTypes:['Vehicle','Machinery / Industrial'],symptomKeywords:['slip','slipping','flare','flaring','transmission'],severity:'likely',
 warning:'Slipping or flaring shifts rarely end with a fluid change. Have the rebuild-versus-replace conversation with the customer before touching it.'},
{id:'chain-water-heater-tank',equipmentTypes:['Appliance'],symptomKeywords:['no hot water','rumbling','popping','water heater','leak'],severity:'likely',
 warning:'An aging water heater that rumbles, pops, or leaks at the base is usually a tank replacement, not an element. Check the serial date — past about 10 years, quote the tank.'},
{id:'chain-mower-no-start-storage',equipmentTypes:['Small engine'],symptomKeywords:["won't start",'no start','storage','sat all winter','last year','old gas'],severity:'watch',
 warning:'A no-start after storage is stale fuel and a gummed carburetor far more often than spark or compression. Start with fresh fuel and a carburetor clean.'},
{id:'chain-dryer-no-heat',equipmentTypes:['Appliance'],symptomKeywords:['dryer','no heat','not heating','takes forever to dry'],severity:'likely',
 warning:'A dryer that runs but does not heat usually blew the thermal fuse — but the fuse blows because the vent is restricted. Clear the vent or the new fuse blows too.'},
{id:'chain-tire-wear-front-end',equipmentTypes:['Vehicle','ATV / UTV'],symptomKeywords:['pull','pulls','uneven wear','tire wear','cupping','feathering'],severity:'watch',
 warning:'Uneven tire wear means something is worn or bent in the front end. An alignment alone will not hold until the worn part (tie rod, ball joint, bushing) is replaced.'},
{id:'chain-ac-low-leak',equipmentTypes:['Vehicle','Appliance'],symptomKeywords:['a/c','a/c ','air conditioning','warm air','not cooling','ac not cold'],severity:'watch',
 warning:'A system that is low on refrigerant got that way through a leak. A recharge without leak detection is a comeback — quote the dye/UV leak check with the recharge.'},
{id:'chain-fridge-defrost',equipmentTypes:['Appliance'],symptomKeywords:['fridge warm','warm fridge','freezer cold','frost','frosting up'],severity:'likely',
 warning:'Warm fresh-food section with a cold freezer is the defrost system (heater, thermostat, or timer) — not low refrigerant. Check for frost-choked evaporator coils first.'},
{id:'chain-oil-leak-dye',equipmentTypes:['Vehicle','Machinery / Industrial'],symptomKeywords:['oil leak','leaking oil','oil spots','oil puddle'],severity:'watch',
 warning:'Oil leaks travel. Clean it and dye-test before quoting — a rear main seal is a labor-heavy job and valve cover gaskets are not. Know which one before the estimate.'},
{id:'chain-fuel-smell',equipmentTypes:['Vehicle','Small engine','ATV / UTV','Machinery / Industrial'],symptomKeywords:['fuel smell','gas smell','smells like gas','gasoline smell'],severity:'critical',
 warning:'Any fuel smell is a fire risk. Find the source (lines, injector seals, tank, carburetor) before the equipment leaves. Do not let the customer drive or run it.'},
{id:'chain-washer-no-spin',equipmentTypes:['Appliance'],symptomKeywords:["won't spin",'will not spin',"won't drain",'will not drain','washer'],severity:'watch',
 warning:'A washer that fills and agitates but will not spin or drain is usually the lid switch or the drain pump — both cheap. Do not quote a transmission.'},
{id:'chain-battery-draw',equipmentTypes:['Vehicle','Machinery / Industrial','ATV / UTV'],symptomKeywords:['battery dead','dead battery','drains','parasitic','won\u2019t hold charge','wont hold charge'],severity:'watch',
 warning:'A new battery that dies again has a parasitic draw or a failing alternator diode. Test the draw and the charging system before selling another battery.'}
];
const SEVERITY_LABEL={watch:'Watch',likely:'Likely bigger job',critical:'Safety — stop'};
const SEVERITY_ORDER={critical:0,likely:1,watch:2};

// ---- owner store (local-first, queued for sync like other owner settings) ----
function storeKey(){return 'h38-failure-chains-'+(businessId()||'default');}
function loadStore(){
  try{const raw=localStorage.getItem(storeKey());if(raw){const s=JSON.parse(raw);if(s&&typeof s==='object')return s;}}catch(e){}
  return {disabled:[],custom:[]};
}
function saveStore(s){
  try{localStorage.setItem(storeKey(),JSON.stringify(s));}catch(e){}
  try{
    if(typeof window.queueOperation==='function'&&businessId())
      window.queueOperation('SAVE_FAILURE_CHAINS','FailureChains',businessId(),{chains:s,updatedAt:new Date().toISOString()}).catch(()=>{});
  }catch(e){}
}
function getChains(){
  const s=loadStore();
  const disabled=new Set(Array.isArray(s.disabled)?s.disabled:[]);
  const list=SEED.filter(e=>!disabled.has(e.id)).map(e=>Object.assign({source:'seed'},e));
  (Array.isArray(s.custom)?s.custom:[]).forEach(c=>{
    if(c&&c.id&&!disabled.has(c.id))list.push(Object.assign({source:'custom'},c));
  });
  return list;
}
function match(opts){
  const o=opts||{};
  const eq=text(o.equipType);
  const hay=(text(o.text)).toLowerCase();
  if(!hay)return [];
  return getChains()
    .filter(e=>!e.equipmentTypes||!e.equipmentTypes.length||e.equipmentTypes.indexOf(eq)>=0)
    .filter(e=>(e.symptomKeywords||[]).some(k=>k&&hay.indexOf(String(k).toLowerCase())>=0))
    .sort((a,b)=>(SEVERITY_ORDER[a.severity]-SEVERITY_ORDER[b.severity]));
}
function setEnabled(id,on){
  const s=loadStore();s.disabled=Array.isArray(s.disabled)?s.disabled:[];
  const i=s.disabled.indexOf(id);
  if(on&&i>=0)s.disabled.splice(i,1);
  if(!on&&i<0)s.disabled.push(id);
  saveStore(s);
}
function addCustom(entry){
  const s=loadStore();s.custom=Array.isArray(s.custom)?s.custom:[];
  const id='custom-'+Date.now().toString(36);
  s.custom.push({id:id,equipmentTypes:entry.equipmentTypes||[],symptomKeywords:entry.symptomKeywords||[],warning:text(entry.warning),severity:['watch','likely','critical'].indexOf(entry.severity)>=0?entry.severity:'watch'});
  saveStore(s);
  return id;
}
function removeCustom(id){
  const s=loadStore();s.custom=(Array.isArray(s.custom)?s.custom:[]).filter(c=>c.id!==id);
  s.disabled=(Array.isArray(s.disabled)?s.disabled:[]).filter(x=>x!==id);
  saveStore(s);
}

// ---- Owner Controls card ----
const EQUIP_TYPES=['Vehicle','ATV / UTV','Small engine','Appliance','Machinery / Industrial','Other equipment'];
function repairGuideOn(){
  try{return !!(window.H38RepairGuide&&typeof window.H38RepairGuide.isEnabled==='function'&&window.H38RepairGuide.isEnabled());}catch(e){return false;}
}
function ownerCard(){
  if(!repairGuideOn())return '';
  const chains=getChains();
  const rows=chains.map(e=>{
    const kw=(e.symptomKeywords||[]).join(', ');
    return `<div class="row"><div class="row-top"><strong>${esc(SEVERITY_LABEL[e.severity]||e.severity)}</strong><span class="muted small">${esc(e.source==='custom'?'Shop pattern':'Built-in')}</span></div>`+
      `<div class="small">${esc(e.warning)}</div>`+
      `<small class="muted">Matches: ${esc((e.equipmentTypes||[]).join(', ')||'All equipment')} — keywords: ${esc(kw)}</small>`+
      `<div class="row-actions"><button type="button" class="secondary" data-fc-disable="${esc(e.id)}">Disable</button>`+
      (e.source==='custom'?` <button type="button" class="secondary" data-fc-delete="${esc(e.id)}">Delete</button>`:'')+
      `</div></div>`;
  }).join('')||'<p class="muted">All warning patterns are disabled.</p>';
  const typeChecks=EQUIP_TYPES.map(t=>`<label class="dx-check"><input type="checkbox" data-fc-type value="${esc(t)}"><span>${esc(t)}</span></label>`).join('');
  return `<section class="card span12"><h2>Repair warning patterns</h2>`+
    `<p class="muted small">When a diagnosis matches one of these patterns, the Diagnose step pops a warning card — "heads up, this often turns into a bigger job." Disable the ones that do not fit your shop, or add your own.</p>`+
    `<div class="list">${rows}</div>`+
    `<h3 class="small" style="margin-top:1rem">Add a shop pattern</h3>`+
    `<div class="dx-maint-list">${typeChecks}</div>`+
    `<label class="small">Symptom keywords (comma separated)<input id="fcNewKw" placeholder="e.g. grinding, metal shavings" autocomplete="off"></label>`+
    `<label class="small">Warning text<textarea id="fcNewWarn" rows="2" placeholder="What should the tech watch for or quote?"></textarea></label>`+
    `<label class="small">Severity<select id="fcNewSev"><option value="watch">Watch</option><option value="likely">Likely bigger job</option><option value="critical">Safety — stop</option></select></label>`+
    `<div class="actions"><button type="button" id="fcAdd">Add pattern</button></div></section>`;
}
function bindOwnerCard(){
  if(!repairGuideOn())return;
  document.querySelectorAll('[data-fc-disable]').forEach(b=>{
    if(b.dataset.fcBound)return;b.dataset.fcBound='1';
    b.addEventListener('click',()=>{setEnabled(b.getAttribute('data-fc-disable'),false);rerender();});
  });
  document.querySelectorAll('[data-fc-delete]').forEach(b=>{
    if(b.dataset.fcBound)return;b.dataset.fcBound='1';
    b.addEventListener('click',()=>{if(window.confirm('Delete this shop pattern?')){removeCustom(b.getAttribute('data-fc-delete'));rerender();}});
  });
  const add=document.getElementById('fcAdd');
  if(add&&!add.dataset.fcBound){
    add.dataset.fcBound='1';
    add.addEventListener('click',()=>{
      const kwEl=document.getElementById('fcNewKw'),warnEl=document.getElementById('fcNewWarn'),sevEl=document.getElementById('fcNewSev');
      const warning=text(warnEl&&warnEl.value);
      const kws=text(kwEl&&kwEl.value).split(',').map(s=>text(s).toLowerCase()).filter(Boolean);
      if(!warning||!kws.length){if(typeof toast==='function')toast('Enter warning text and at least one keyword.',true);return;}
      const types=Array.prototype.slice.call(document.querySelectorAll('[data-fc-type]:checked')).map(x=>x.value);
      addCustom({equipmentTypes:types,symptomKeywords:kws,warning:warning,severity:sevEl&&sevEl.value});
      if(typeof toast==='function')toast('Pattern added.');
      rerender();
    });
  }
}
function rerender(){
  try{
    if(window.H38OwnerControls&&typeof window.H38OwnerControls.render==='function'&&typeof window.H38OwnerControls.bind==='function'){
      const main=document.getElementById('mainContent');
      if(main){main.innerHTML=window.H38OwnerControls.render();window.H38OwnerControls.bind();}
    }
  }catch(e){}
}

// ---- styles (scoped, injected once) ----
function injectStyle(){
  if(document.getElementById('dxFailureChainsStyle'))return;
  const st=document.createElement('style');
  st.id='dxFailureChainsStyle';
  st.textContent=`
.dx-warn-card{border:1px solid #c9a13b;border-left:6px solid #c9a13b;background:#fffdf4;border-radius:10px;padding:.7rem .9rem;margin:.6rem 0}
.dx-warn-card.sev-likely{border-color:#b97a1f;border-left-color:#b97a1f}
.dx-warn-card.sev-critical{border-color:#a33;border-left-color:#a33;background:#fff5f5}
.dx-warn-head{display:flex;gap:.5rem;align-items:center;font-weight:900;margin-bottom:.25rem}
.dx-warn-badge{font-size:.72rem;font-weight:900;padding:.15rem .5rem;border-radius:999px;background:#f3e3b3;color:#5c430a}
.dx-warn-card.sev-critical .dx-warn-badge{background:#a33;color:#fff}
.dx-warn-card p{margin:.25rem 0;font-size:.92rem;line-height:1.45}
`;
  document.head.appendChild(st);
}
injectStyle();

window.H38FailureChains={
  BUILD:BUILD,
  match:match,
  getChains:getChains,
  setEnabled:setEnabled,
  addCustom:addCustom,
  removeCustom:removeCustom,
  severityLabel:function(s){return SEVERITY_LABEL[s]||s;},
  ownerCard:ownerCard,
  bindOwnerCard:bindOwnerCard
};
})();
