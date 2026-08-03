import {put,get,all,remove,clearAll,newId} from './db.js';
import {H38Bridge} from './bridge.js';

const BRIDGE_URL='https://script.google.com/macros/s/AKfycbyY8cbfvGLzllw7rMhRY46wx_eIKhsK5oLlV6vIcDxDIKuCzX0_oTi4EyVufSxonLdxow/exec?bridge=1';
const state={businessId:'',snapshot:null,quoteId:'',lines:[],bridge:null,ready:false};
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const money=value=>Number(value||0).toLocaleString(undefined,{style:'currency',currency:state.snapshot?.business?.currency||'USD'});
const empty=text=>`<div class="empty">${esc(text)}</div>`;

async function init(){
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  bind();network();addEventListener('online',()=>{network();state.bridge?.connect();});addEventListener('offline',network);
  const settings=await get('meta','settings')||{id:'settings',bridgeUrl:BRIDGE_URL};
  $('bridgeUrl').value=settings.bridgeUrl||BRIDGE_URL;
  state.businessId=(await get('meta','selectedBusiness'))?.businessId||'';
  state.bridge=new H38Bridge($('bridgeFrame'),settings.bridgeUrl||BRIDGE_URL,async status=>{
    state.ready=status==='ready';$('bridgeStatus').textContent=state.ready?'Ready':status==='connecting'?'Connecting':'Unavailable';
    if(state.ready){await businesses();if(state.businessId)await loadBusiness(state.businessId,true);await sync(false);}
  });
  state.bridge.connect();await cached();await counts();renderLines();await renderDrafts();
}
function bind(){
  document.querySelectorAll('nav button').forEach(button=>button.onclick=()=>page(button.dataset.page,button));
  $('loadBusinessButton').onclick=()=>loadBusiness($('businessSelect').value,false);$('syncButton').onclick=()=>sync(true);
  $('addLineButton').onclick=addLine;$('saveDraftButton').onclick=saveDraft;$('newDraftButton').onclick=newDraft;$('priceSearch').oninput=renderPrices;
  $('assignAssetButton').onclick=()=>queueFleet('ASSIGN_ASSET_TO_JOB',{assetId:$('fleetAsset').value,jobId:$('fleetJob').value,conditionOut:$('fleetCondition').value});
  $('returnAssetButton').onclick=()=>queueFleet('RETURN_ASSET_FROM_JOB',{assetId:$('fleetAsset').value,conditionIn:$('fleetCondition').value});
  $('recordUsageButton').onclick=()=>queueFleet('RECORD_ASSET_USAGE',{assetId:$('fleetAsset').value,jobId:$('fleetJob').value,endMeter:$('usageMeter').value,endMileage:$('usageMileage').value,usageType:$('usageType').value,notes:$('usageNotes').value});
  $('scheduleMaintenanceButton').onclick=()=>queueFleet('SCHEDULE_MAINTENANCE',{assetId:$('serviceAsset').value,maintenanceType:$('maintenanceType').value,dueDate:$('maintenanceDue').value,priority:$('maintenancePriority').value,notes:$('maintenanceNotes').value});
  $('recordInspectionButton').onclick=()=>queueFleet('RECORD_INSPECTION',{assetId:$('serviceAsset').value,inspectionType:$('inspectionType').value,result:$('inspectionResult').value,notes:$('inspectionNotes').value});
  $('saveSettingsButton').onclick=saveSettings;$('clearLocalButton').onclick=clearDevice;
}
function page(name,button){document.querySelectorAll('.page').forEach(node=>node.classList.toggle('active',node.id===`page-${name}`));document.querySelectorAll('nav button').forEach(node=>node.classList.toggle('active',node===button));if(name==='drafts')renderDrafts();if(name==='fleet')renderFleet();}
function network(){const online=navigator.onLine;$('networkBadge').textContent=online?'Online':'Offline';$('networkBadge').className=`badge ${online?'online':'offline'}`;}
function notice(text,bad=false){$('syncMessage').textContent=text;$('syncMessage').className=`notice${bad?' bad':''}`;}
async function businesses(){try{const rows=await state.bridge.request('listBusinesses');$('businessSelect').innerHTML='<option value="">Select business</option>'+rows.map(row=>`<option value="${esc(row.businessId)}">${esc(row.businessName)} — ${esc((row.industryPacks||[row.industryPack]).join(', '))}</option>`).join('');$('businessSelect').value=state.businessId;}catch(error){notice(error.message,true);}}
async function loadBusiness(id,quiet){
  if(!id)return;state.businessId=id;await put('meta',{id:'selectedBusiness',businessId:id});
  try{const snapshot=await state.bridge.request('pwaBootstrap',{businessId:id});snapshot.id=`business:${id}`;snapshot.cachedAt=new Date().toISOString();await put('snapshots',snapshot);state.snapshot=snapshot;render();notice(`Refreshed ${new Date(snapshot.cachedAt).toLocaleString()}. Cached pricing remains owner-review required.`);}
  catch(error){await cached();if(!quiet)notice(`${error.message} Using the last offline pack.`,true);}
}
async function cached(){if(!state.businessId)return;const snapshot=await get('snapshots',`business:${state.businessId}`);if(snapshot){state.snapshot=snapshot;render();notice(`Offline pack loaded from ${new Date(snapshot.cachedAt).toLocaleString()}.`);}}
function render(){
  const s=state.snapshot;if(!s)return;$('businessStatus').textContent=s.business.businessName;$('businessSelect').value=state.businessId;
  $('customerSelect').innerHTML='<option value="">Generic Quote Customer</option>'+(s.customers||[]).map(x=>`<option value="${esc(x.customerId)}">${esc(x.name)}</option>`).join('');
  $('priceSnapshotLabel').textContent=`Cached ${s.priceBook?.length||0} price records · ${new Date(s.cachedAt).toLocaleString()} · owner review required`;
  renderPrices();renderField();renderFleetSelectors();renderFleet();
}
function renderPrices(){
  const q=$('priceSearch').value.trim().toLowerCase();const rows=(state.snapshot?.priceBook||[]).filter(x=>!q||`${x.sku} ${x.description}`.toLowerCase().includes(q)).slice(0,100);
  $('priceBookList').innerHTML=rows.length?rows.map(x=>`<div class="row"><div class="row-top"><strong>${esc(x.description)}</strong><button data-price="${esc(x.itemId)}">Use</button></div><small>${esc(x.sku||'No SKU')} · ${money(x.unitPrice)} / ${esc(x.unit||'each')} · owner review</small></div>`).join(''):empty('No matching cached prices.');
  document.querySelectorAll('[data-price]').forEach(button=>button.onclick=()=>{const x=(state.snapshot.priceBook||[]).find(row=>row.itemId===button.dataset.price);if(x){$('lineDescription').value=x.description;$('lineUnit').value=x.unit||'each';$('linePrice').value=Number(x.unitPrice||0).toFixed(2);}});
}
function renderField(){
  const s=state.snapshot||{};$('fieldJobs').innerHTML=(s.jobs||[]).length?s.jobs.slice(0,50).map(x=>`<div class="row"><div class="row-top"><strong>${esc(x.projectTitle)}</strong><span class="pill">${esc(x.status)}</span></div><small>${esc(x.jobNumber)}</small></div>`).join(''):empty('No cached jobs.');
  $('fieldAssets').innerHTML=(s.assets||[]).length?s.assets.slice(0,75).map(x=>`<div class="row"><div class="row-top"><strong>${esc(x.description)}</strong><span class="pill">${esc(x.availability||x.status)}</span></div><small>${esc(x.assetNumber)}${x.assignedJobId?' · Job '+esc(x.assignedJobId):''}${x.nextService?' · Service '+esc(x.nextService):''}</small></div>`).join(''):empty('No cached equipment.');
}
function renderFleetSelectors(){const assets=state.snapshot?.assets||[],jobs=state.snapshot?.jobs||[];const assetOptions=assets.map(x=>`<option value="${esc(x.assetId)}">${esc(x.assetNumber)} — ${esc(x.description)}</option>`).join('');$('fleetAsset').innerHTML=assetOptions;$('serviceAsset').innerHTML=assetOptions;$('fleetJob').innerHTML='<option value="">Select job</option>'+jobs.map(x=>`<option value="${esc(x.jobId)}">${esc(x.jobNumber)} — ${esc(x.projectTitle)}</option>`).join('');}
async function renderFleet(){
  const assets=state.snapshot?.assets||[],maintenance=state.snapshot?.maintenance||[];$('fleetList').innerHTML=assets.length?assets.map(x=>{const due=maintenance.find(m=>m.assetId===x.assetId&&String(m.status).toUpperCase()!=='COMPLETE');return`<div class="row"><div class="row-top"><strong>${esc(x.description)}</strong><span class="pill">${esc(x.availability||x.status)}</span></div><small>${esc(x.assetNumber)}${x.assignedJobId?' · Assigned '+esc(x.assignedJobId):''}${due?' · '+esc(due.maintenanceType)+' '+esc(due.dueDate||due.status):''}</small></div>`;}).join(''):empty('No fleet or equipment records.');
  const queued=(await all('operations')).filter(x=>x.businessId===state.businessId&&x.syncStatus==='PENDING'&&['ASSIGN_ASSET_TO_JOB','RETURN_ASSET_FROM_JOB','RECORD_ASSET_USAGE','SCHEDULE_MAINTENANCE','RECORD_INSPECTION'].includes(x.action));
  $('fleetQueue').innerHTML=queued.length?queued.map(x=>`<div class="row"><div class="row-top"><strong>${esc(x.action.replaceAll('_',' '))}</strong><span class="pill pending">Waiting to sync</span></div><small>${esc(x.recordId)} · ${new Date(x.localTimestamp).toLocaleString()}</small></div>`).join(''):empty('No fleet actions waiting to sync.');
}
function addLine(){const description=$('lineDescription').value.trim(),quantity=Number($('lineQuantity').value||0),unitPrice=Number($('linePrice').value||0);if(!description||quantity<=0)return notice('Enter a description and quantity.',true);state.lines.push({quoteLineId:newId('QUOTE-LINE'),description,quantity,unit:$('lineUnit').value.trim()||'each',unitPrice,priceSource:'Cached or manual',priceStatus:'Owner review required'});$('lineDescription').value='';$('linePrice').value='';renderLines();}
function renderLines(){$('draftTotal').textContent=money(state.lines.reduce((sum,x)=>sum+Number(x.quantity)*Number(x.unitPrice),0));$('lineList').innerHTML=state.lines.length?state.lines.map((x,i)=>`<div class="row"><div class="row-top"><strong>${esc(x.description)}</strong><button class="secondary" data-remove="${i}">Remove</button></div><small>${esc(x.quantity)} ${esc(x.unit)} × ${money(x.unitPrice)} · owner review required</small></div>`).join(''):empty('No quote lines yet.');document.querySelectorAll('[data-remove]').forEach(button=>button.onclick=()=>{state.lines.splice(Number(button.dataset.remove),1);renderLines();});}
async function saveDraft(){
  const title=$('projectTitle').value.trim();if(!title)return notice('Project title is required.',true);const quoteId=state.quoteId||newId('QUOTE'),now=new Date().toISOString();const draft={id:quoteId,quoteId,businessId:state.businessId,customerId:$('customerSelect').value,projectTitle:title,scope:$('scope').value.trim(),measurementNotes:$('measurementNotes').value.trim(),lines:state.lines.slice(),tax:0,status:'Draft',localUpdatedTime:now,syncStatus:'PENDING'};await put('quotes',draft);
  await queue('UPSERT_QUOTE_DRAFT','Quote',quoteId,{quoteId,customerId:draft.customerId,projectTitle:title,scope:draft.scope,measurementNotes:draft.measurementNotes,lines:draft.lines,tax:0});state.quoteId=quoteId;notice('Quote draft saved on this device. It has not been approved or sent.');await counts();await renderDrafts();if(navigator.onLine&&state.ready)await sync(false);
}
async function renderDrafts(){const drafts=(await all('quotes')).filter(x=>!state.businessId||x.businessId===state.businessId).sort((a,b)=>String(b.localUpdatedTime).localeCompare(String(a.localUpdatedTime)));$('draftList').innerHTML=drafts.length?drafts.map(x=>`<div class="row"><div class="row-top"><strong>${esc(x.projectTitle)}</strong><span class="pill ${x.syncStatus==='SYNCED'?'synced':'pending'}">${esc(x.syncStatus)}</span></div><small>${x.lines.length} lines · ${money(x.lines.reduce((sum,line)=>sum+Number(line.quantity)*Number(line.unitPrice),0))} · ${new Date(x.localUpdatedTime).toLocaleString()}</small><div class="actions"><button data-draft="${esc(x.id)}">Open</button></div></div>`).join(''):empty('No drafts saved on this device.');document.querySelectorAll('[data-draft]').forEach(button=>button.onclick=()=>openDraft(button.dataset.draft));}
async function openDraft(id){const x=await get('quotes',id);if(!x)return;state.quoteId=x.quoteId;$('customerSelect').value=x.customerId||'';$('projectTitle').value=x.projectTitle;$('scope').value=x.scope;$('measurementNotes').value=x.measurementNotes;state.lines=x.lines||[];renderLines();page('quotes',document.querySelector('[data-page="quotes"]'));}
function newDraft(){state.quoteId='';state.lines=[];['projectTitle','scope','measurementNotes','lineDescription','linePrice'].forEach(id=>$(id).value='');$('lineQuantity').value='1';$('lineUnit').value='each';$('customerSelect').value='';renderLines();}
async function queueFleet(action,payload){if(!payload.assetId)return notice('Select equipment first.',true);if(action==='ASSIGN_ASSET_TO_JOB'&&!payload.jobId)return notice('Select a job first.',true);await queue(action,'Asset',payload.assetId,payload);notice('Fleet action saved on this device and queued for protected synchronization.');await counts();await renderFleet();if(navigator.onLine&&state.ready)await sync(false);}
async function queue(action,recordType,recordId,payload){const id=newId('OP');await put('operations',{id,operationId:id,businessId:state.businessId,deviceId:await deviceId(),recordType,recordId,action,baseVersion:0,localTimestamp:new Date().toISOString(),payload,syncStatus:'PENDING',retryCount:0});}
async function sync(show){
  const operations=(await all('operations')).filter(x=>x.syncStatus==='PENDING'&&x.businessId===state.businessId);await counts();if(!operations.length){if(show)notice('Nothing is waiting to sync.');return;}if(!navigator.onLine||!state.ready){if(show)notice('Offline or secure bridge unavailable. Work remains safely queued.',true);return;}
  try{const response=await state.bridge.request('syncOperations',{businessId:state.businessId,operations},45000);let done=0,failed=0;for(const result of response.results||[]){const op=operations.find(x=>x.operationId===result.operationId);if(!op)continue;if(['SYNCED','ALREADY_SYNCED'].includes(result.status)){await remove('operations',op.id);const draft=await get('quotes',op.recordId);if(draft){draft.syncStatus='SYNCED';draft.serverRecordId=result.recordId||op.recordId;await put('quotes',draft);}done++;}else{op.retryCount++;op.lastError=result.message||'Sync failed';await put('operations',op);failed++;}}notice(`${done} operation${done===1?'':'s'} synchronized${failed?`; ${failed} need review`:''}. Nothing was approved or sent.`,failed>0);await counts();await renderDrafts();await renderFleet();if(done)await loadBusiness(state.businessId,true);}catch(error){notice(error.message,true);}
}
async function deviceId(){let device=await get('meta','device');if(!device){device={id:'device',deviceId:newId('DEVICE'),createdTime:new Date().toISOString()};await put('meta',device);}return device.deviceId;}
async function counts(){const drafts=(await all('quotes')).filter(x=>!state.businessId||x.businessId===state.businessId),pending=(await all('operations')).filter(x=>x.syncStatus==='PENDING'&&(!state.businessId||x.businessId===state.businessId));$('draftCount').textContent=drafts.length;$('pendingCount').textContent=pending.length;}
async function saveSettings(){const bridgeUrl=$('bridgeUrl').value.trim();if(!bridgeUrl)return notice('Bridge URL is required.',true);await put('meta',{id:'settings',bridgeUrl});state.bridge.setUrl(bridgeUrl);notice('Offline settings saved.');}
async function clearDevice(){if(!confirm('Clear all H38 data saved on this device? Server records will not be deleted.'))return;await clearAll();state.businessId='';state.snapshot=null;newDraft();$('businessStatus').textContent='Not selected';notice('Local device data cleared. Server records were not deleted.');await counts();await renderDrafts();}
init().catch(error=>notice(error.message||String(error),true));
