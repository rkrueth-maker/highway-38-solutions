(function(){
'use strict';
// H38 Site Visit — Diagnose step (Repair Guide embedded in the visit).
//
// Toggle-gated: completely dormant unless "Repair Guide integration" is
// enabled in Owner Controls (default OFF). When off, Site Visit renders
// exactly as before — no extra tab, no extra step, no changed numbering.
//
// When on, the visit gains a Diagnose step between Notes and Review:
//   visit -> diagnose (problem / maintenance / known issue) -> quote lines
// The diagnosis can become quote lines on the visit's draft quote
// (accepted -> job through the normal quote handoff), be saved as a draft
// diagnosis, or be deleted. Works for all equipment: vehicles, machinery,
// small engines, appliances. Aftermarket parts installation is a first-class
// quote line (part + labor), customer-supplied or shop-supplied.
const BUILD='20261005-site-visit-diagnose-1';
const C=window.H38_FIELD_VISIT_CORE;
if(!C)return;
const S=C.state,t=C.t,n=C.n,esc=C.esc;
const text=v=>String(v==null?'':v).trim();
const now=()=>new Date().toISOString();
const uid=p=>typeof window.newId==='function'?window.newId(p):`${p}-${(window.crypto&&crypto.randomUUID?crypto.randomUUID():'xxxxxxxx').toUpperCase()}`;
const money=v=>'$'+Number(n(v)||0).toFixed(2);

function enabled(){
  try{return !!(window.H38RepairGuide&&typeof window.H38RepairGuide.isEnabled==='function'&&window.H38RepairGuide.isEnabled());}
  catch(e){return false;}
}

// ---- visit-scoped diagnose state (persisted with the visit draft) ----
function dg(){
  const v=S.visit;
  if(!v)return null;
  if(!v.diagnose||typeof v.diagnose!=='object')v.diagnose={};
  const d=v.diagnose;
  if(d.mode!==undefined&&d.mode!==null&&!['diagnose','maintenance','known'].includes(d.mode))d.mode=null;
  if(!d.equipType)d.equipType='Vehicle';
  if(!d.idType)d.idType='VIN';
  if(!Array.isArray(d.maint))d.maint=[];
  if(!Array.isArray(d.parts))d.parts=[];
  if(!Array.isArray(d.labor))d.labor=[];
  if(!d.status)d.status='open';
  return d;
}
function persist(){return C.saveDraft().catch(()=>{});}

const EQUIP_TYPES=['Vehicle','ATV / UTV','Small engine','Appliance','Machinery / Industrial','Other equipment'];
const ID_TYPES=['VIN','Serial number','Model number','Other identifier'];
const MAINT_ITEMS=['Oil change','Air filter replacement','Tire rotation / inspection','Brake inspection','Belt / chain inspection','Blade sharpening','Fluid check and top-off','Battery test','Spark plug replacement','General safety inspection'];
const PART_SOURCES=[['shop','Shop-supplied'],['customer','Customer-supplied']];
const PART_TYPES=[['aftermarket','Aftermarket'],['oem','OEM'],['used','Used']];

function equipTypeToCategory(et){
  const s=text(et).toLowerCase();
  if(/atv|utv/.test(s))return 'atv';
  if(/small engine/.test(s))return 'small-engine';
  if(/appliance/.test(s))return 'appliance';
  if(/vehicle|car|truck/.test(s))return 'car';
  return 'other';
}

// ---- quote line building ----
function buildLines(d){
  const lines=[];
  for(const p of d.parts||[]){
    const name=text(p.name);if(!name)continue;
    const src=p.source==='customer'?'customer':'shop';
    const ptype=(p.partType||'aftermarket');
    const ptypeLabel=(PART_TYPES.find(x=>x[0]===ptype)||['','Aftermarket'])[1];
    const srcLabel=src==='customer'?'customer-supplied':'shop-supplied';
    lines.push({
      description:`Part (${ptypeLabel}, ${srcLabel}): ${name}`,
      quantity:Math.max(1,Math.round(n(p.qty)||1)),unit:'each',
      unitPrice:src==='customer'?0:Math.max(0,Math.round(n(p.cost)*100)/100),
      quoteLineId:uid('QUOTE-LINE'),dxKind:'part',dxSource:src,dxPartType:ptype
    });
  }
  for(const l of d.labor||[]){
    const desc=text(l.desc);if(!desc)continue;
    lines.push({
      description:`Labor: ${desc}`,
      quantity:Math.max(0,Math.round(n(l.hours)*100)/100)||1,unit:'hr',
      unitPrice:Math.max(0,Math.round(n(l.rate)*100)/100),
      quoteLineId:uid('QUOTE-LINE'),dxKind:'labor'
    });
  }
  for(const m of d.maint||[]){
    if(!m||!m.selected)continue;
    const label=text(m.label);if(!label)continue;
    lines.push({
      description:`Maintenance: ${label}`,
      quantity:1,unit:'each',
      unitPrice:Math.max(0,Math.round(n(m.price)*100)/100),
      quoteLineId:uid('QUOTE-LINE'),dxKind:'maintenance'
    });
  }
  return lines;
}
function linesTotal(lines){return Math.round(lines.reduce((s,l)=>s+n(l.quantity)*n(l.unitPrice),0)*100)/100;}
function tierTotal(tier){return Math.round((Array.isArray(tier.items)?tier.items:[]).reduce((s,l)=>s+n(l.quantity)*n(l.unitPrice),0)*100)/100;}

function diagnosisSummary(d){
  const eq=[d.equipType,text(d.equipName)].filter(Boolean).join(' — ');
  const ident=[d.idType+': '+text(d.identifier),text(d.year),text(d.make),text(d.model)].filter(x=>text(x).replace(/^[^:]+:\s*$/,'')).join(' · ');
  const modeLabel=d.mode==='maintenance'?'Maintenance visit':d.mode==='known'?'Known issue (skipped diagnosis)':'Problem diagnosis';
  const parts=(d.parts||[]).filter(p=>text(p.name)).length;
  const labor=(d.labor||[]).filter(l=>text(l.desc)).length;
  const maint=(d.maint||[]).filter(m=>m&&m.selected).length;
  return ['Repair diagnosis (Site Visit step):',eq?`Equipment: ${eq}`:'',
    ident?`Identifiers: ${ident}`:'',`Visit type: ${modeLabel}`,
    d.symptoms?`Symptoms: ${text(d.symptoms)}`:'',
    d.diagnosis?`Technician diagnosis: ${text(d.diagnosis)}`:'',
    d.recommendedFix?`Recommended fix: ${text(d.recommendedFix)}`:'',
    d.mode==='known'&&d.knownIssue?`Known issue: ${text(d.knownIssue)}`:'',
    `Quoted work: ${parts} part line(s), ${labor} labor line(s), ${maint} maintenance item(s)`]
    .filter(Boolean).join('\n');
}

// ---- persistence: equipment, diagnosis draft ----
async function saveEquipment(){
  const v=S.visit,d=dg();
  if(!v||!d)return;
  const name=text(d.equipName)||`${d.equipType} — ${text(d.identifier)||'unspecified'}`;
  const id=text(d.equipmentId)||uid('EQUIP');
  const rec={'Equipment ID':id,'Business ID':C.business(),'Customer ID':t(v.customerId),
    'Equipment Name':name,'Equipment Type':d.equipType,
    'Identifier Type':d.idType,'Identifier':text(d.identifier),
    'Make':text(d.make),'Model':text(d.model),'Year':text(d.year),
    'Owner Type':'Customer','Status':'Active',
    'Created Time':now(),'Updated Time':now(),'Record Version':1};
  await window.queueOperation('SAVE_EQUIPMENT','Equipment',id,{equipmentId:id},{collection:'equipment',record:rec,idKeys:['Equipment ID']},false);
  d.equipmentId=id;await persist();
  C.toast('Equipment saved to this customer.');
}
async function saveDiagnosisRecord(status){
  const v=S.visit,d=dg();
  if(!v||!d)return null;
  const id=text(d.diagnosisId)||uid('DIAG');
  const rec={'Diagnosis ID':id,'Business ID':C.business(),'Customer ID':t(v.customerId),
    'Equipment ID':text(d.equipmentId),'Quote ID':t(v.quoteId),'Job ID':'',
    'Visit ID':t(v.visitId),'Session ID':t(v.sessionId),
    'Mode':d.mode||'','Equipment Type':d.equipType,'Equipment Name':text(d.equipName),
    'Identifier Type':d.idType,'Identifier':text(d.identifier),
    'Make':text(d.make),'Model':text(d.model),'Year':text(d.year),
    'Symptoms':text(d.symptoms),'Diagnosis':text(d.diagnosis),'Recommended Fix':text(d.recommendedFix),
    'Known Issue':text(d.knownIssue),
    'Parts JSON':JSON.stringify(d.parts||[]),'Labor JSON':JSON.stringify(d.labor||[]),
    'Maintenance JSON':JSON.stringify((d.maint||[]).filter(m=>m&&m.selected)),
    'Status':status,'Created Time':now(),'Updated Time':now(),'Record Version':1};
  await window.queueOperation('SAVE_ENTITY','Diagnosis',id,{entity:'diagnoses',record:rec},{collection:'diagnoses',record:rec,idKeys:['Diagnosis ID']},false);
  d.diagnosisId=id;await persist();
  return rec;
}

// ---- outcomes ----
async function addToQuote(){
  const v=S.visit,d=dg();
  if(!v||!d)throw new Error('Open a Site Visit first.');
  if(!t(v.quoteId))throw new Error('Save the job draft first (Job tab).');
  const lines=buildLines(d);
  if(!lines.length)throw new Error('Add at least one part, labor, or maintenance line first.');
  const q=C.quote(t(v.quoteId));
  if(!q||!t(C.val(q,'Quote ID','quoteId')))throw new Error('The draft quote could not be found.');
  if(C.locked(q))throw new Error('That quote is locked. Start a new draft quote.');
  const updated=Object.assign({},q);
  const tierMode=text(C.val(q,'Tier Mode','tierMode')).toLowerCase().indexOf('good')===0;
  let total;
  if(tierMode&&Array.isArray(updated.tiers)&&updated.tiers[1]){
    updated.tiers=updated.tiers.map(x=>Object.assign({},x,{items:Array.isArray(x.items)?x.items.slice():[]}));
    updated.tiers[1].items=updated.tiers[1].items.concat(lines);
    updated.tiers[1].total=tierTotal(updated.tiers[1]);
    total=updated.tiers[1].total;
    updated.lines=[];
  }else{
    updated.lines=(Array.isArray(updated.lines)?updated.lines.slice():[]).concat(lines);
    total=linesTotal(updated.lines);
  }
  const prevRev=Math.trunc(n(C.val(q,'Revision','revision'))||0);
  updated.Subtotal=total;updated.Tax=0;updated.Total=total;
  updated.Revision=prevRev+1;updated['Previous Revision']=prevRev||'';
  const summary=diagnosisSummary(d);
  const mn=text(C.val(updated,'Measurement Notes','measurementNotes'));
  if(summary&&mn.indexOf('Repair diagnosis (Site Visit step):')<0)updated['Measurement Notes']=(mn?mn+'\n\n':'')+summary;
  if(text(d.equipmentId))updated['Equipment ID']=text(d.equipmentId);
  updated['Updated Time']=now();
  updated['Record Version']=Math.trunc(n(C.val(updated,'Record Version','recordVersion'))||1)+1;
  if(!text(C.val(updated,'Status','status')))updated['Status']='Draft';
  const qid=t(C.val(updated,'Quote ID','quoteId'));
  const p={quoteId:qid,quoteNumber:C.val(updated,'Quote Number','quoteNumber'),
    customerId:C.val(updated,'Customer ID','customerId'),
    projectTitle:C.val(updated,'Project Title','projectTitle'),
    scope:C.val(updated,'Scope','scope'),measurementNotes:updated['Measurement Notes'],
    status:updated['Status'],revision:updated.Revision,
    previousRevision:updated['Previous Revision'],previousStatus:C.val(updated,'Previous Status','previousStatus'),
    lines:updated.lines,tiers:updated.tiers,tierMode:tierMode,tax:0,
    ownerReviewRequired:true,externalActionOccurred:false,
    __h38Record:{collection:'quotes',record:updated}};
  if(window.H38_QUOTE_REVISION_AUTHORITY&&typeof window.H38_QUOTE_REVISION_AUTHORITY.markOwnerSave==='function')
    window.H38_QUOTE_REVISION_AUTHORITY.markOwnerSave();
  await window.queueOperation('SAVE_QUOTE','Quote',qid,p,{collection:'quotes',record:updated,idKeys:['Quote ID']});
  await saveDiagnosisRecord('Quoted');
  d.status='quoted';d.quotedAt=now();d.quotedLines=lines.length;
  await persist();
  C.toast(`Added ${lines.length} line${lines.length===1?'':'s'} to the draft quote (${money(total)}). Nothing sent or approved.`);
}
async function saveDraft(){
  const d=dg();if(!d)throw new Error('Open a Site Visit first.');
  if(!d.mode)throw new Error('Pick a visit type first (diagnose, maintenance, or known issue).');
  await saveDiagnosisRecord('Draft');
  d.status='draft-saved';await persist();
  C.toast('Diagnosis saved as a draft. It is not on the quote yet.');
}
async function deleteDiagnosis(){
  const v=S.visit,d=dg();if(!v||!d)return;
  if(!window.confirm('Delete this diagnosis? Its parts and labor lines will be discarded.'))return;
  if(text(d.diagnosisId))await saveDiagnosisRecord('Deleted');
  v.diagnose=null;await persist();
  C.toast('Diagnosis deleted.');
}

// ---- optional AI diagnosis (manual-first: this is an enhancement, never required) ----
async function requestAi(){
  const d=dg();if(!d)return;
  const H=window.H38_AI_HANDOFF;
  if(!H||typeof H.runTask!=='function'){C.toast('AI diagnosis is not available in this Office. Enter the diagnosis manually.',true);return;}
  if(!text(d.symptoms)){C.toast('Describe the symptoms first.',true);return;}
  d.aiStatus='working';d.aiError='';render();
  try{
    const unitInfo=[text(d.equipName),text(d.year),text(d.make),text(d.model),text(d.identifier)].filter(Boolean).join(' ');
    const result=await H.runTask('repair_diagnosis',{businessId:C.business(),category:equipTypeToCategory(d.equipType),symptoms:text(d.symptoms),unitInfo:unitInfo||null},{timeoutMs:180000});
    const diag=(result&&result.diagnosis)||result||{};
    const issues=Array.isArray(diag.likelyIssues)?diag.likelyIssues:[];
    const top=issues[0]||{};
    const parts=(Array.isArray(diag.partsEstimate)?diag.partsEstimate:[]).map(p=>text(p.part||p.name||'')).filter(Boolean);
    d.diagnosis=[text(top.issue||top.title||''),text(top.explanation||'')].filter(Boolean).join(' — ')||text(diag.summary||'');
    d.recommendedFix=(Array.isArray(diag.fixPlan)?diag.fixPlan:[]).map((s,i)=>`${i+1}. ${text(typeof s==='string'?s:(s.text||s.step||''))}`).join('\n')||text(diag.how_to_text||'');
    if(parts.length&&!(d.parts||[]).length)d.parts=parts.slice(0,6).map(name=>({name,source:'shop',partType:'aftermarket',qty:1,cost:0}));
    d.aiStatus='done';d.aiError='';
    C.toast('AI diagnosis received. Review and edit it before quoting.');
  }catch(e){d.aiStatus='failed';d.aiError=text((e&&e.message)||e)||'AI diagnosis failed.';}
  await persist();render();
}

// ---- rendering ----
function selOpts(list,current){return list.map(x=>{const val=Array.isArray(x)?x[0]:x,label=Array.isArray(x)?x[1]:x;return `<option value="${esc(val)}"${text(val)===text(current)?' selected':''}>${esc(label)}</option>`;}).join('');}
function modeButtons(d){
  const modes=[['diagnose','Diagnose a problem'],['maintenance','Maintenance visit'],['known','I know the issue — skip to quote']];
  return `<div class="dx-mode-row">${modes.map(([k,label])=>`<button type="button" data-dx-mode="${k}" class="dx-mode-btn${d.mode===k?' active':''}">${esc(label)}</button>`).join('')}</div>`;
}
function equipmentCard(d){
  return `<div class="field-card"><strong>Equipment</strong><span class="dx-hint">Works for any equipment the shop services — vehicles, machinery, small engines, appliances.</span>
  <div class="field-two"><label>Equipment type<select id="dxEquipType">${selOpts(EQUIP_TYPES,d.equipType)}</select></label>
  <label>Equipment name / label<input id="dxEquipName" value="${esc(d.equipName||'')}" placeholder="e.g. Shop air compressor" autocomplete="off"></label></div>
  <div class="field-two"><label>ID type<select id="dxIdType">${selOpts(ID_TYPES,d.idType)}</select></label>
  <label>Identifier<input id="dxIdentifier" value="${esc(d.identifier||'')}" placeholder="VIN, serial or model number" autocomplete="off"></label></div>
  <div class="dx-three"><label>Make<input id="dxMake" value="${esc(d.make||'')}" autocomplete="off"></label>
  <label>Model<input id="dxModel" value="${esc(d.model||'')}" autocomplete="off"></label>
  <label>Year<input id="dxYear" value="${esc(d.year||'')}" inputmode="numeric" autocomplete="off"></label></div>
  <div class="dx-row"><button type="button" id="dxSaveEquip" class="field-secondary">${d.equipmentId?'Equipment saved — update':'Save equipment to customer'}</button></div>
  <small class="dx-hint">Saved equipment links to this customer and is offered next time.</small></div>`;
}
function diagnoseSection(d){
  if(d.mode!=='diagnose')return '';
  const ai=d.aiStatus==='working'
    ?'<div class="dx-ai-working">Requesting AI diagnosis… you can keep working; the result lands here.</div>'
    :d.aiStatus==='failed'
    ?`<div class="dx-ai-error">AI diagnosis failed: ${esc(d.aiError||'unknown error')}. Enter the diagnosis manually.</div>`
    :'';
  return `<div class="field-card"><strong>Diagnosis</strong>
  <label>Symptoms<textarea id="dxSymptoms" rows="4" placeholder="What is wrong? Noises, leaks, error codes, when it happens…">${esc(d.symptoms||'')}</textarea></label>
  <label>Technician diagnosis<textarea id="dxDiagnosis" rows="3" placeholder="Root cause, in your own words.">${esc(d.diagnosis||'')}</textarea></label>
  <label>Recommended fix<textarea id="dxFix" rows="3" placeholder="What should be done to fix it.">${esc(d.recommendedFix||'')}</textarea></label>
  ${ai}
  <div class="dx-row"><button type="button" id="dxAiBtn" class="field-secondary"${d.aiStatus==='working'?' disabled':''}>Request AI diagnosis (optional)</button></div>
  <small class="dx-hint">Manual entry always works. The AI suggestion is optional and editable.</small></div>`;
}
function maintenanceSection(d){
  if(d.mode!=='maintenance')return '';
  const items=MAINT_ITEMS.map(label=>{
    const row=(d.maint||[]).find(m=>m&&text(m.label)===label)||{label,selected:false,price:0};
    return row;
  });
  const custom=(d.maint||[]).filter(m=>m&&MAINT_ITEMS.indexOf(text(m.label))<0);
  const rowHtml=(m,idx)=>`<label class="dx-check"><input type="checkbox" data-dx-maint="${idx}"${m.selected?' checked':''}><span>${esc(m.label)}</span><input type="number" min="0" step="0.01" data-dx-maint-price="${idx}" value="${esc(String(m.price||0))}" aria-label="Price for ${esc(m.label)}"></label>`;
  return `<div class="field-card"><strong>Maintenance checklist</strong><span class="dx-hint">Tick what this visit needs. Each ticked item becomes a quote line.</span>
  <div class="dx-maint-list">${items.map((m,i)=>rowHtml(m,i)).join('')}</div>
  ${custom.map((m,i)=>rowHtml(m,items.length+i)).join('')}
  <div class="dx-row"><input id="dxMaintCustom" placeholder="Add custom item" autocomplete="off"><button type="button" id="dxMaintAdd" class="field-secondary">Add</button></div></div>`;
}
function knownSection(d){
  if(d.mode!=='known')return '';
  return `<div class="field-card"><strong>Known issue</strong>
  <label>What is the issue?<textarea id="dxKnownIssue" rows="3" placeholder="e.g. Customer wants an aftermarket backup camera installed.">${esc(d.knownIssue||'')}</textarea></label>
  <small class="dx-hint">Skips the diagnostic questions. Build the parts and labor below and add them straight to the quote.</small></div>`;
}
function partsLaborCard(d){
  const partRow=(p,i)=>`<div class="dx-line-row" data-dx-part="${i}">
    <input data-dx-p-name value="${esc(p.name||'')}" placeholder="Part name" autocomplete="off" aria-label="Part name">
    <select data-dx-p-source aria-label="Part source">${selOpts(PART_SOURCES,p.source||'shop')}</select>
    <select data-dx-p-type aria-label="Part type">${selOpts(PART_TYPES,p.partType||'aftermarket')}</select>
    <input data-dx-p-qty type="number" min="1" step="1" value="${esc(String(p.qty||1))}" aria-label="Quantity">
    <input data-dx-p-cost type="number" min="0" step="0.01" value="${esc(String(p.cost||0))}" aria-label="Unit cost" ${p.source==='customer'?'disabled':''}>
    <button type="button" data-dx-p-del class="dx-del" aria-label="Remove part">Remove</button></div>`;
  const laborRow=(l,i)=>`<div class="dx-line-row" data-dx-labor="${i}">
    <input data-dx-l-desc value="${esc(l.desc||'')}" placeholder="Labor description" autocomplete="off" aria-label="Labor description">
    <input data-dx-l-hours type="number" min="0" step="0.25" value="${esc(String(l.hours||1))}" aria-label="Hours">
    <input data-dx-l-rate type="number" min="0" step="0.01" value="${esc(String(l.rate||0))}" aria-label="Rate per hour">
    <button type="button" data-dx-l-del class="dx-del" aria-label="Remove labor">Remove</button></div>`;
  const total=linesTotal(buildLines(d));
  return `<div class="field-card"><strong>Parts and labor</strong>
  <span class="dx-hint">Aftermarket installs: add the part (shop or customer supplied) plus the install labor. Customer-supplied parts price at $0 — labor still bills.</span>
  <div class="dx-lines">${(d.parts||[]).map(partRow).join('')||'<p class="dx-hint">No parts yet.</p>'}</div>
  <div class="dx-row"><button type="button" id="dxAddPart" class="field-secondary">Add part</button></div>
  <div class="dx-lines">${(d.labor||[]).map(laborRow).join('')||'<p class="dx-hint">No labor yet.</p>'}</div>
  <div class="dx-row"><button type="button" id="dxAddLabor" class="field-secondary">Add labor</button></div>
  <div class="dx-total"><span>Quote lines total</span><strong>${money(total)}</strong></div></div>`;
}
function outcomeCard(d){
  const status=d.status==='quoted'
    ?`<div class="dx-status">Added ${n(d.quotedLines)||0} line(s) to the draft quote. Present and accept it in Quotes to create the job.</div>`
    :d.status==='draft-saved'
    ?'<div class="dx-status">Diagnosis saved as a draft. It is not on the quote yet.</div>':'';
  return `<div class="field-card"><strong>Outcome</strong>${status}
  <div class="dx-outcome-row">
    <button type="button" id="dxAddToQuote" class="field-primary">Add to quote</button>
    <button type="button" id="dxSaveDraftBtn" class="field-secondary">Save as draft</button>
  </div>
  <div class="dx-row"><button type="button" id="dxDeleteBtn" class="field-danger">Delete diagnosis</button></div>
  <small class="dx-hint">Add to quote writes lines to this visit's draft quote. The normal quote flow (present, accept) creates the job.</small></div>`;
}
function panel(){
  if(!enabled())return '';
  const v=S.visit;if(!v)return '';
  const d=dg();
  return `<section class="field-panel ${S.tab==='diagnose'?'active':''}">
  <div class="field-step-head"><span>3</span><div><h1>Diagnose</h1>
  <p>Run the Repair Guide diagnosis inside this visit — or skip straight to the quote when you already know the issue. Maintenance visits work here too.</p></div></div>
  <div class="field-card"><strong>What kind of visit is this?</strong>${modeButtons(d)}</div>
  ${equipmentCard(d)}
  ${diagnoseSection(d)}${maintenanceSection(d)}${knownSection(d)}
  ${d.mode?partsLaborCard(d)+outcomeCard(d):'<div class="field-card"><p class="dx-hint">Pick a visit type above to continue.</p></div>'}
  <button type="button" class="field-next" data-go="review">Next: Review →</button></section>`;
}

// ---- binding ----
let bound=false;
function render(){try{if(typeof C.state.render==='function')C.state.render();}catch(e){}}
function onMode(k){
  const d=dg();if(!d)return;
  d.mode=(d.mode===k)?null:k;
  if(d.mode==='maintenance'&&!d.maint.length)d.maint=MAINT_ITEMS.map(label=>({label,selected:false,price:0}));
  persist().then(render);
}
function syncInputs(){
  const d=dg();if(!d)return;
  const get=id=>{const el=document.getElementById(id);return el?el.value:undefined;};
  const assign=(id,key)=>{const v=get(id);if(v!==undefined)d[key]=v;};
  assign('dxEquipType','equipType');assign('dxEquipName','equipName');assign('dxIdType','idType');
  assign('dxIdentifier','identifier');assign('dxMake','make');assign('dxModel','model');assign('dxYear','year');
  assign('dxSymptoms','symptoms');assign('dxDiagnosis','diagnosis');assign('dxFix','recommendedFix');assign('dxKnownIssue','knownIssue');
  // part/labor rows
  document.querySelectorAll('[data-dx-part]').forEach(row=>{
    const i=Number(row.getAttribute('data-dx-part')),p=d.parts[i];if(!p)return;
    p.name=row.querySelector('[data-dx-p-name]')?.value||'';
    p.source=row.querySelector('[data-dx-p-source]')?.value||'shop';
    p.partType=row.querySelector('[data-dx-p-type]')?.value||'aftermarket';
    p.qty=row.querySelector('[data-dx-p-qty]')?.value||1;
    p.cost=row.querySelector('[data-dx-p-cost]')?.value||0;
  });
  document.querySelectorAll('[data-dx-labor]').forEach(row=>{
    const i=Number(row.getAttribute('data-dx-labor')),l=d.labor[i];if(!l)return;
    l.desc=row.querySelector('[data-dx-l-desc]')?.value||'';
    l.hours=row.querySelector('[data-dx-l-hours]')?.value||0;
    l.rate=row.querySelector('[data-dx-l-rate]')?.value||0;
  });
  document.querySelectorAll('[data-dx-maint]').forEach(box=>{
    const i=Number(box.getAttribute('data-dx-maint'));
    const all=MAINT_ITEMS.map(label=>(d.maint||[]).find(m=>m&&text(m.label)===label)).concat((d.maint||[]).filter(m=>m&&MAINT_ITEMS.indexOf(text(m.label))<0));
    const m=all[i];if(!m)return;
    m.selected=box.checked;
    const priceEl=document.querySelector(`[data-dx-maint-price="${i}"]`);
    if(priceEl)m.price=priceEl.value;
  });
}
function bind(){
  if(!enabled())return;
  document.querySelectorAll('[data-dx-mode]').forEach(b=>{
    if(b.dataset.dxBound)return;b.dataset.dxBound='1';
    b.addEventListener('click',()=>{syncInputs();onMode(b.getAttribute('data-dx-mode'));});
  });
  const on=(id,fn)=>{const el=document.getElementById(id);if(el&&!el.dataset.dxBound){el.dataset.dxBound='1';el.addEventListener('click',fn);}};
  on('dxSaveEquip',async()=>{try{syncInputs();await saveEquipment();render();}catch(e){C.toast(e.message||String(e),true);}});
  on('dxAiBtn',()=>{syncInputs();requestAi().catch(e=>C.toast(e.message||String(e),true));});
  on('dxAddPart',()=>{syncInputs();const d=dg();d.parts.push({name:'',source:'shop',partType:'aftermarket',qty:1,cost:0});persist().then(render);});
  on('dxAddLabor',()=>{syncInputs();const d=dg();d.labor.push({desc:'',hours:1,rate:0});persist().then(render);});
  on('dxMaintAdd',()=>{
    const d=dg();const el=document.getElementById('dxMaintCustom');
    const label=text(el&&el.value);if(!label){C.toast('Enter a custom maintenance item first.',true);return;}
    syncInputs();d.maint.push({label,selected:true,price:0});persist().then(render);
  });
  on('dxAddToQuote',async()=>{try{syncInputs();await addToQuote();render();}catch(e){C.toast(e.message||String(e),true);}});
  on('dxSaveDraftBtn',async()=>{try{syncInputs();await saveDraft();render();}catch(e){C.toast(e.message||String(e),true);}});
  on('dxDeleteBtn',()=>{syncInputs();deleteDiagnosis().then(render).catch(e=>C.toast(e.message||String(e),true));});
  document.querySelectorAll('[data-dx-p-del]').forEach(b=>{
    if(b.dataset.dxBound)return;b.dataset.dxBound='1';
    b.addEventListener('click',()=>{syncInputs();const d=dg();const row=b.closest('[data-dx-part]');if(row)d.parts.splice(Number(row.getAttribute('data-dx-part')),1);persist().then(render);});
  });
  document.querySelectorAll('[data-dx-l-del]').forEach(b=>{
    if(b.dataset.dxBound)return;b.dataset.dxBound='1';
    b.addEventListener('click',()=>{syncInputs();const d=dg();const row=b.closest('[data-dx-labor]');if(row)d.labor.splice(Number(row.getAttribute('data-dx-labor')),1);persist().then(render);});
  });
  // text inputs: keep state fresh without re-render (preserves focus/typing)
  ['dxEquipName','dxIdentifier','dxMake','dxModel','dxYear','dxSymptoms','dxDiagnosis','dxFix','dxKnownIssue','dxMaintCustom'].forEach(id=>{
    const el=document.getElementById(id);
    if(el&&!el.dataset.dxSyncBound){el.dataset.dxSyncBound='1';el.addEventListener('input',()=>{syncInputs();persist();});}
  });
  document.querySelectorAll('[data-dx-maint],[data-dx-maint-price]').forEach(el=>{
    if(el.dataset.dxSyncBound)return;el.dataset.dxSyncBound='1';
    el.addEventListener('change',()=>{syncInputs();persist().then(render);});
  });
  document.querySelectorAll('[data-dx-p-name],[data-dx-p-source],[data-dx-p-type],[data-dx-p-qty],[data-dx-p-cost],[data-dx-l-desc],[data-dx-l-hours],[data-dx-l-rate]').forEach(el=>{
    if(el.dataset.dxSyncBound)return;el.dataset.dxSyncBound='1';
    el.addEventListener('change',()=>{syncInputs();persist().then(render);});
  });
  const eqType=document.getElementById('dxEquipType'),idType=document.getElementById('dxIdType');
  [eqType,idType].forEach(el=>{if(el&&!el.dataset.dxSyncBound){el.dataset.dxSyncBound='1';el.addEventListener('change',()=>{syncInputs();persist();});}});
}

// ---- styles (scoped, injected once) ----
function injectStyle(){
  if(document.getElementById('dxDiagnoseStyle'))return;
  const st=document.createElement('style');
  st.id='dxDiagnoseStyle';
  st.textContent=`
.dx-mode-row{display:grid;gap:.5rem;margin-top:.5rem}
@media(min-width:560px){.dx-mode-row{grid-template-columns:1fr 1fr 1fr}}
.dx-mode-btn{min-height:56px;border:2px solid #9db4c3;border-radius:12px;background:#fff;font:inherit;font-weight:800;padding:.6rem;cursor:pointer}
.dx-mode-btn.active{border-color:#0d6f8d;background:#eef7fb;color:#0b3d55}
.dx-hint{display:block;color:#52616d;font-size:.82rem;line-height:1.4;margin:.25rem 0 .5rem}
.dx-three{display:grid;gap:.5rem;grid-template-columns:1fr 1fr 1fr}
@media(max-width:520px){.dx-three{grid-template-columns:1fr}}
.dx-row{display:flex;gap:.5rem;margin-top:.6rem;flex-wrap:wrap}
.dx-row input{flex:1;min-height:48px;padding:.6rem;border:1px solid #9db4c3;border-radius:10px;font:inherit;min-width:0}
.dx-row button,.dx-outcome-row button{min-height:52px;font-weight:900}
.dx-outcome-row{display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin:.6rem 0}
@media(max-width:520px){.dx-outcome-row{grid-template-columns:1fr}}
.dx-check{display:flex;gap:.6rem;align-items:center;padding:.55rem .2rem;border-bottom:1px solid #e3edf3}
.dx-check input[type=checkbox]{width:26px;height:26px;flex:none}
.dx-check span{flex:1;font-weight:600}
.dx-check input[type=number]{width:96px;min-height:44px;padding:.4rem;border:1px solid #9db4c3;border-radius:10px;font:inherit}
.dx-maint-list{margin:.4rem 0}
.dx-line-row{display:grid;gap:.4rem;padding:.6rem 0;border-bottom:1px solid #e3edf3}
.dx-line-row input,.dx-line-row select{min-height:48px;padding:.55rem;border:1px solid #9db4c3;border-radius:10px;font:inherit;min-width:0;width:100%}
.dx-line-row .dx-del{min-height:48px;border:1px solid #c98a8a;background:#fff;color:#8f2b2b;border-radius:10px;font-weight:800}
@media(min-width:560px){.dx-line-row{grid-template-columns:2fr 1fr 1fr .6fr .8fr auto}}
.dx-total{display:flex;justify-content:space-between;align-items:center;margin-top:.7rem;padding-top:.6rem;border-top:2px solid #0d6f8d;font-size:1.05rem}
.dx-status{padding:.6rem .8rem;border-radius:10px;background:#f2faf4;border:1px solid #9cc3a8;margin-bottom:.6rem;font-weight:600}
.dx-ai-working{padding:.6rem .8rem;border-radius:10px;background:#eef7fb;border:1px solid #9db4c3;margin:.5rem 0}
.dx-ai-error{padding:.6rem .8rem;border-radius:10px;background:#fff1f1;border:1px solid #db9b9b;margin:.5rem 0}
.field-card label{display:grid;gap:.3rem;margin:.55rem 0;font-weight:700;font-size:.9rem}
.field-card label>input,.field-card label>select,.field-card label>textarea{font-weight:400;min-height:48px;padding:.6rem;border:1px solid #9db4c3;border-radius:10px;font:inherit;width:100%}
.field-card label>textarea{min-height:88px;resize:vertical}
`;
  document.head.appendChild(st);
}
injectStyle();

window.H38_SITE_VISIT_DIAGNOSE=Object.freeze({build:BUILD,enabled,panel,bind,addToQuote,saveDraft,deleteDiagnosis,saveEquipment,requestAi,state:dg,buildLines,linesTotal});
})();
