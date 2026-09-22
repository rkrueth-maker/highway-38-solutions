(function(){
'use strict';
const BUILD='20260922-tenant-aware-office-actions-4';
const base=window.H38_ASSISTANT_COMMAND_BUS;
if(!base)return;
const text=value=>String(value==null?'':value).trim();
const lower=value=>text(value).toLowerCase();
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const rows=name=>Array.isArray(window.state?.snapshot?.[name])?window.state.snapshot[name]:[];
const now=()=>new Date().toISOString();
const truthy=v=>v===true||['true','1','yes','on','enabled'].includes(lower(v));
const money=v=>'$'+Number(v||0).toFixed(2);
const esc=v=>text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let pending=null,lastCompletion=null,renderTimer=0;

function businessId(){return text(window.state?.businessId||window.state?.snapshot?.business?.businessId);}
function businessKey(){return lower(window.state?.snapshot?.business?.businessKey);}
function activeUser(){return window.state?.snapshot?.user||{};}
function role(){const u=activeUser();return lower(u.roleId||u.roleName||u.role);}
function permitted(capability){
  const u=activeUser(),p=u.permissions||{};
  if(u.owner===true||p.all===true)return true;
  return p[capability]===true;
}
function financialPermission(){return permitted('manageFinancial');}
function customerEditPermission(){return permitted('manageCustomers')||permitted('editCustomers')||permitted('manageSettings');}
function customerId(row){return text(value(row,'Customer ID','customerId','id'));}
function customerName(row){return text(value(row,'Customer Name','name'))||'Customer';}
function customerById(id){return rows('customers').find(row=>customerId(row)===text(id))||null;}
function activeCustomerId(){
  const c360=text(window.H38_CUSTOMER_360?.selectedCustomerId);
  if(c360&&customerById(c360))return c360;
  const context=text(window.H38_OWNER_CUSTOMER_WORKFLOW_POLISH?.currentContext?.()?.customerId);
  if(context&&customerById(context))return context;
  return'';
}
function resolveCustomer(command){
  const result=base.customerResult?.(command);
  if(result?.ambiguous)return{ambiguous:true,answer:result.answer};
  if(result?.customerId){
    const row=customerById(result.customerId);
    if(row)return{id:result.customerId,row};
  }
  const id=activeCustomerId(),row=customerById(id);
  return row?{id,row}:null;
}
function rateSpec(q){
  if(/plow|snow/.test(q))return{service:'Snow plowing',field:'Plowing Rate',alternates:['Snow Plowing Rate','Recurring Service Rate']};
  if(/mow|lawn/.test(q))return{service:'Lawn mowing',field:'Mowing Rate',alternates:['Lawn Mowing Rate','Recurring Service Rate']};
  return{service:'Recurring service',field:'Recurring Service Rate',alternates:['Hourly Rate','Flat Rate']};
}
function rateValue(row,spec){
  for(const field of [spec.field,...spec.alternates]){const raw=value(row,field);if(raw!==''&&Number.isFinite(Number(raw)))return{field,amount:Number(raw)};}
  return{field:spec.field,amount:0};
}
function makeActionId(){return 'AI-ACTION-'+(crypto.randomUUID?crypto.randomUUID().toUpperCase():Date.now()+'-'+Math.random().toString(16).slice(2));}
function snapshotPending(){return pending?JSON.parse(JSON.stringify(pending)):null;}
function scheduleRender(){clearTimeout(renderTimer);renderTimer=setTimeout(renderCard,0);}
function setPending(action){pending={version:1,status:'PREVIEW',createdAt:now(),...action};lastCompletion=null;scheduleRender();return pending;}
function clearPending(status='CANCELLED'){if(pending)pending={...pending,status,finishedAt:now()};const finished=pending;pending=null;scheduleRender();return finished;}
function quotePreview(action){return{projectTitle:`${action.service} — ${action.customerName}`,lineDescription:action.service,quantity:1,unit:'service',unitPrice:Number(action.after||0),total:Number(action.after||0)};}
function actionSummary(action){
  if(action.type==='rate-change')return`Proposed change\n${action.customerName} — ${action.service}\n${money(action.before)} → ${money(action.after)}\nAffected: ${action.field}${action.createQuote?' + new internal draft quote':''}.\nNo business data has been changed yet.`;
  if(action.type==='bulk-rate-change')return`Proposed bulk change\n${action.records.length} eligible ${action.service.toLowerCase()} customer${action.records.length===1?'':'s'}\nCurrent projected per-service revenue: ${money(action.currentRevenue)}\nProposed: ${money(action.proposedRevenue)}\n${action.excluded.length} custom-contract customer${action.excluded.length===1?'':'s'} excluded or flagged.\nNo business data has been changed yet.`;
  if(action.type==='customer-field')return`Proposed change\n${action.customerName}\n${action.label}: ${text(action.before)||'(blank)'} → ${text(action.after)}\nNo business data has been changed yet.`;
  if(action.type==='product-suggestion')return`H38 product suggestion\n${action.title}\nThis changes how H38 Office works, not your business data. It will not modify source code or platform settings.`;
  return'Proposed Office change. No data has been changed yet.';
}
function renderCard(){
  const chat=document.getElementById('paChat')||document.querySelector('#globalAiBody .ai-chat');
  const existing=document.querySelector('[data-h38-ai-action-card]');
  if(!chat||!pending){document.querySelectorAll('[data-h38-ai-action-card]').forEach(node=>node.remove());return;}
  if(existing&&existing.dataset.h38AiActionId===String(pending.actionId||'')&&existing.dataset.h38AiActionVersion===String(pending.version||1))return;
  document.querySelectorAll('[data-h38-ai-action-card]').forEach(node=>node.remove());
  const card=document.createElement('section');card.dataset.h38AiActionCard='1';card.className='h38-ai-action-card';
  const a=pending,canSave=a.canExecute!==false;card.dataset.h38AiActionId=String(a.actionId||'');card.dataset.h38AiActionVersion=String(a.version||1);
  card.innerHTML=`<div class="h38-ai-action-kicker">Proposed change</div><strong>${esc(a.type==='rate-change'?a.customerName+' — '+a.service:a.type==='bulk-rate-change'?a.service+' bulk update':a.type==='customer-field'?a.customerName:a.title||'H38 Office suggestion')}</strong><pre>${esc(actionSummary(a))}</pre><div class="h38-ai-action-buttons">${canSave?'<button type="button" data-h38-ai-approve>Approve &amp; Save</button>':'<button type="button" data-h38-ai-owner-review>Request owner review</button>'}<button type="button" class="secondary" data-h38-ai-edit>Edit</button><button type="button" class="secondary" data-h38-ai-cancel>Cancel</button></div><small>${canSave?'Approval applies only to this exact preview version.':'Your current role cannot execute this change.'}</small>`;
  chat.appendChild(card);chat.scrollTop=chat.scrollHeight;
  card.querySelector('[data-h38-ai-approve]')?.addEventListener('click',()=>void executePending().then(message=>window.toast?.(message)).catch(error=>window.toast?.(error?.message||String(error),true)));
  card.querySelector('[data-h38-ai-owner-review]')?.addEventListener('click',()=>void requestOwnerReview().then(message=>window.toast?.(message)).catch(error=>window.toast?.(error?.message||String(error),true)));
  card.querySelector('[data-h38-ai-cancel]')?.addEventListener('click',()=>{cancelPending();window.toast?.('Proposed AI change cancelled. Nothing was written.');});
  card.querySelector('[data-h38-ai-edit]')?.addEventListener('click',()=>{
    const input=document.querySelector('#paCommandForm [name="command"]');if(!input)return;
    input.value=a.type==='rate-change'?`Make it ${money(a.after)} instead.`:'Change the proposed value and show me a new preview.';
    input.focus();input.setSelectionRange?.(0,input.value.length);
  });
}
function installStyle(){
  if(document.getElementById('h38AssistantTenantActionStyle'))return;
  const style=document.createElement('style');style.id='h38AssistantTenantActionStyle';style.textContent=`
  .h38-ai-action-card{margin:8px 0;padding:13px;border:1px solid #bfd0dc;border-radius:13px;background:#f8fbfd;box-shadow:0 4px 14px rgba(11,36,56,.06)}
  .h38-ai-action-kicker{font-size:.68rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#174a70;margin-bottom:5px}
  .h38-ai-action-card pre{white-space:pre-wrap;font:inherit;font-size:.84rem;line-height:1.42;margin:8px 0;color:#29465e}
  .h38-ai-action-buttons{display:flex;gap:7px;flex-wrap:wrap}.h38-ai-action-buttons button{min-height:40px}
  .h38-ai-action-card small{display:block;margin-top:7px;color:#617487}
  @media(max-width:600px){.h38-ai-action-buttons button{flex:1 1 100%}}
  `;document.head.appendChild(style);
}
async function refreshAuthoritativeSnapshot(){
  if(!navigator.onLine)return null;
  if(typeof window.refreshSnapshot==='function'){
    const refreshed=await window.refreshSnapshot();
    if(refreshed)return refreshed;
  }
  const bridge=window.state?.bridge,bid=businessId();
  if(bridge?.ready&&typeof bridge.request==='function'&&bid){
    const snapshot=await bridge.request('completionBootstrap',{businessId:bid},45000);
    if(snapshot&&typeof snapshot==='object'){
      if(typeof bridge.onFullSnapshot==='function')await bridge.onFullSnapshot(snapshot,bid);
      else if(window.state)window.state.snapshot=snapshot;
      return snapshot;
    }
  }
  return null;
}
async function settle(){
  if(navigator.onLine&&typeof window.sync==='function')await window.sync(false);
  await refreshAuthoritativeSnapshot();
}
function proofVisible(actionId){return rows('proofLog').some(row=>text(row?.Details?.aiActionId||row?.details?.aiActionId)===text(actionId));}
async function awaitProof(actionId){
  if(!actionId)return false;
  for(let attempt=0;attempt<6;attempt++){
    if(proofVisible(actionId))return true;
    if(navigator.onLine)await refreshAuthoritativeSnapshot();
    if(proofVisible(actionId))return true;
    await new Promise(resolve=>setTimeout(resolve,250+attempt*100));
  }
  return proofVisible(actionId);
}
function proof(action,before,after,records,approval='APPROVED'){
  return{aiActionId:action.actionId,request:action.request,tenantBusinessId:action.businessId,businessKey:action.businessKey,userId:text(activeUser().userId||activeUser().id),effectiveRole:role(),approvalState:approval,approverUserId:text(activeUser().userId||activeUser().id),before,after,recordsAffected:records,previewVersion:action.version,verifiedAt:now()};
}
async function saveEntity(collection,recordType,id,record,action,before,after){
  const keys={customers:['Customer ID','customerId'],aiRecommendations:['Recommendation ID','recommendationId']}[collection]||['id'];
  const payload={entity:collection,record,__h38AiProof:proof(action,before,after,[{collection,recordId:id}])};
  await window.queueOperation('SAVE_ENTITY',recordType,id,payload,{collection,record,idKeys:keys},false);
}
function ensureSameTenant(action){
  if(!action||action.businessId!==businessId()||action.businessKey!==businessKey())throw Error('AI action expired because the active business changed. Build a new preview in the current tenant.');
}
function ensurePreviewCurrent(action){
  if(action.status!=='PREVIEW')throw Error('This AI preview is no longer active.');
  ensureSameTenant(action);
}
async function executeRate(action){
  if(!financialPermission())throw Error('Your current Office role does not have permission to change service pricing.');
  const current=customerById(action.customerId);if(!current)throw Error('The selected customer is no longer available in this tenant.');
  const currentValue=Number(value(current,action.field)||0);
  if(Math.abs(currentValue-Number(action.before||0))>0.005)throw Error('The service rate changed after this preview. Build a new preview before approving.');
  const updated={...current,[action.field]:Number(action.after),'Updated Time':now(),'Record Version':Math.max(1,Number(value(current,'Record Version','recordVersion')||0)+1),'AI Last Action ID':action.actionId};
  delete updated.__localPending;
  await saveEntity('customers','Customer',action.customerId,updated,action,{[action.field]:action.before},{[action.field]:action.after});
  let quoteId='';
  if(action.createQuote){
    quoteId=typeof window.newId==='function'?window.newId('QUOTE'):'QUOTE-AI-'+crypto.randomUUID().toUpperCase();
    const qp=quotePreview(action),lineId=typeof window.newId==='function'?window.newId('QUOTE-LINE'):'QUOTE-LINE-'+crypto.randomUUID().toUpperCase();
    const lines=[{quoteLineId:lineId,description:qp.lineDescription,quantity:1,unit:qp.unit,unitPrice:qp.unitPrice,priceSource:'AI-approved tenant service rate',priceStatus:'Owner approved for draft'}];
    const quote={'Quote ID':quoteId,'Business ID':action.businessId,'Customer ID':action.customerId,'Quote Number':'AI-DRAFT-'+Date.now(),'Project Title':qp.projectTitle,'Scope':action.service+' service using the approved customer rate.','Measurement Notes':'Generated from an explicitly approved H38 Assistant tenant-data change.','Status':'Draft','Revision':1,'Subtotal':qp.total,'Tax':0,'Total':qp.total,'Created Time':now(),'Updated Time':now(),'Record Version':1,lines};
    await window.queueOperation('SAVE_QUOTE','Quote',quoteId,{quoteId,customerId:action.customerId,projectTitle:quote['Project Title'],scope:quote.Scope,measurementNotes:quote['Measurement Notes'],lines,tax:0,__h38AiProof:proof(action,{quote:null},{quoteId,total:qp.total},[{collection:'quotes',recordId:quoteId}])},{collection:'quotes',record:quote,idKeys:['Quote ID']},false);
  }
  await settle();
  if(!await awaitProof(action.actionId))throw Error('The approved change saved, but its AI proof-log entry did not verify. Refresh before taking another consequential action.');
  const verified=customerById(action.customerId),saved=Number(value(verified,action.field)||0);
  if(Math.abs(saved-Number(action.after))>0.005)throw Error('The approved rate did not verify after save.');
  if(quoteId){
    const quote=rows('quotes').find(row=>text(value(row,'Quote ID','quoteId'))===quoteId);
    if(!quote||Math.abs(Number(value(quote,'Total','total')||0)-Number(action.after))>0.005)throw Error('The approved draft quote did not verify after save.');
    try{window.openPage?.('quotes');window.openQuote?.(quoteId);}catch(_){}
  }
  return{quoteId,verifiedRate:saved};
}
async function executeCustomerField(action){
  if(!customerEditPermission())throw Error('Your current Office role does not have permission to edit customer information.');
  const current=customerById(action.customerId);if(!current)throw Error('The selected customer is no longer available in this tenant.');
  if(text(value(current,action.field))!==text(action.before))throw Error('The customer record changed after this preview. Build a new preview before approving.');
  const updated={...current,[action.field]:action.after,'Updated Time':now(),'Record Version':Math.max(1,Number(value(current,'Record Version','recordVersion')||0)+1),'AI Last Action ID':action.actionId};
  delete updated.__localPending;
  await saveEntity('customers','Customer',action.customerId,updated,action,{[action.field]:action.before},{[action.field]:action.after});
  await settle();
  if(!await awaitProof(action.actionId))throw Error('The approved customer change saved, but its AI proof-log entry did not verify.');
  const verified=customerById(action.customerId);
  if(text(value(verified,action.field))!==text(action.after))throw Error('The approved customer change did not verify after save.');
  return{verified:true};
}
async function executeBulk(action){
  if(!financialPermission())throw Error('Your current Office role does not have permission to change service pricing.');
  for(const item of action.records){
    const current=customerById(item.customerId);if(!current)throw Error('A customer in this bulk preview is no longer available.');
    if(Math.abs(Number(value(current,item.field)||0)-Number(item.before))>0.005)throw Error('A customer rate changed after the bulk preview. Rebuild the preview before approving.');
  }
  for(const item of action.records){
    const current=customerById(item.customerId),updated={...current,[item.field]:item.after,'Updated Time':now(),'Record Version':Math.max(1,Number(value(current,'Record Version','recordVersion')||0)+1),'AI Last Action ID':action.actionId};
    delete updated.__localPending;
    await saveEntity('customers','Customer',item.customerId,updated,action,{[item.field]:item.before},{[item.field]:item.after});
  }
  await settle();
  if(!await awaitProof(action.actionId))throw Error('The approved bulk change saved, but its AI proof-log entry did not verify.');
  for(const item of action.records){const verified=customerById(item.customerId);if(Math.abs(Number(value(verified,item.field)||0)-Number(item.after))>0.005)throw Error('One or more approved bulk rate changes did not verify.');}
  return{changed:action.records.length};
}
async function executeSuggestion(action){
  const id='FEATURE-AI-'+(crypto.randomUUID?crypto.randomUUID().toUpperCase():Date.now());
  const payload={featureRequestId:id,pageKey:text(window.state?.page||''),title:action.title,problem:action.request,currentWorkaround:'Submitted from H38 Assistant product boundary.',frequency:'Unspecified',proposedAction:'Review in H38 Build Captain / product development workflow.',__h38AiProof:proof(action,null,{featureRequestId:id},[{collection:'featureRequests',recordId:id}])};
  await window.queueOperation('SAVE_FEATURE_REQUEST','Feature Request',id,payload,{collection:'featureRequests',record:{'Feature Request ID':id,'Business ID':businessId(),'Requested By':text(activeUser().userId||activeUser().id),'Page Key':payload.pageKey,'User Role':role(),'Title':payload.title,'Problem':payload.problem,'Current Workaround':payload.currentWorkaround,'Frequency':payload.frequency,'Proposed Action':payload.proposedAction,'Status':'Open','Created Time':now(),'Updated Time':now(),'Record Version':1},idKeys:['Feature Request ID']},false);
  await settle();if(!await awaitProof(action.actionId))throw Error('The H38 product suggestion saved, but its proof-log entry did not verify.');return{id};
}
async function executePending(){
  const action=pending;if(!action)throw Error('There is no AI change waiting for approval.');
  ensurePreviewCurrent(action);
  if(action.canExecute===false)throw Error('This preview needs an authorized owner or administrator before it can be executed.');
  let result;
  if(action.type==='rate-change')result=await executeRate(action);
  else if(action.type==='customer-field')result=await executeCustomerField(action);
  else if(action.type==='bulk-rate-change')result=await executeBulk(action);
  else if(action.type==='product-suggestion')result=await executeSuggestion(action);
  else throw Error('Unsupported AI action type.');
  lastCompletion={...action,status:'SAVED',result,finishedAt:now()};pending=null;scheduleRender();
  return action.type==='rate-change'?`✓ Saved and verified ${action.customerName} ${action.service} at ${money(action.after)}.${result.quoteId?' ✓ Draft quote created and opened.':''}`:action.type==='bulk-rate-change'?`✓ Saved and verified ${result.changed} approved rate changes.`:action.type==='customer-field'?`✓ Saved and verified ${action.customerName} ${action.label}.`:'✓ Product suggestion saved for H38 review. No Office source code or platform setting was changed.';
}
async function requestOwnerReview(){
  const action=pending;if(!action)throw Error('There is no AI preview to escalate.');ensurePreviewCurrent(action);
  const id='AI-REVIEW-'+(crypto.randomUUID?crypto.randomUUID().toUpperCase():Date.now());
  const record={'Recommendation ID':id,'Business ID':action.businessId,'Recommendation Type':'AI Tenant Action Review','Status':'Owner Review Requested','Title':actionSummary(action).split('\n')[0],'Summary':actionSummary(action),'AI Action ID':action.actionId,'Requested By':text(activeUser().userId||activeUser().id),'Requested Role':role(),'Created Time':now(),'Updated Time':now(),'Record Version':1,'Automatic Execution':false};
  await saveEntity('aiRecommendations','AI Recommendation',id,record,action,null,{reviewRequested:true});
  await settle();if(!await awaitProof(action.actionId))throw Error('The owner-review request saved, but its AI proof-log entry did not verify.');lastCompletion={...action,status:'OWNER_REVIEW_REQUESTED',result:{id},finishedAt:now()};pending=null;scheduleRender();return'Owner review requested. No restricted business data was changed.';
}
function cancelPending(){const a=pending;if(!a)return'Nothing is waiting for approval.';lastCompletion={...a,status:'CANCELLED',finishedAt:now()};pending=null;scheduleRender();return'Cancelled. Nothing was written.';}
function previewRate(command){
  const target=resolveCustomer(command);if(target?.ambiguous)return target;if(!target)return{answer:'Open the customer in Customer 360 or name the customer before changing a service rate.'};
  const q=lower(command),match=q.match(/(?:to|at|make(?:\s+it)?)\s*\$?([0-9]+(?:\.[0-9]+)?)/i)||q.match(/\$([0-9]+(?:\.[0-9]+)?)/);
  if(!match)return{answer:'Tell me the proposed service rate so I can build a preview.'};
  const spec=rateSpec(q),current=rateValue(target.row,spec),after=Number(match[1]);
  if(!(after>=0))return{answer:'Enter a valid proposed rate.'};
  const action=setPending({actionId:makeActionId(),type:'rate-change',request:text(command),businessId:businessId(),businessKey:businessKey(),customerId:target.id,customerName:customerName(target.row),service:spec.service,field:current.field,before:current.amount,after,createQuote:/quote|estimate/.test(q),canExecute:financialPermission(),requiredPermission:'manageFinancial'});
  return{action,answer:actionSummary(action)+(action.canExecute?'\nApprove & Save when this is correct.':'\nYou do not have pricing permission. I can keep this preview for owner review.')};
}
function previewPhone(command){
  const target=resolveCustomer(command);if(target?.ambiguous)return target;if(!target)return{answer:'Open the customer in Customer 360 or name the customer before changing contact information.'};
  const match=text(command).match(/(?:to|is)\s*(\+?[0-9][0-9() .-]{6,}[0-9])/i);if(!match)return{answer:'Include the new phone number so I can show the exact change.'};
  const after=text(match[1]),before=text(value(target.row,'Phone','phone'));
  const action=setPending({actionId:makeActionId(),type:'customer-field',request:text(command),businessId:businessId(),businessKey:businessKey(),customerId:target.id,customerName:customerName(target.row),field:'Phone',label:'Phone',before,after,canExecute:customerEditPermission(),requiredPermission:'editCustomers'});
  return{action,answer:actionSummary(action)+(action.canExecute?'\nApprove & Save when this is correct.':'\nYour current role cannot edit this customer. Owner review is available.')};
}
function previewBulk(command){
  const q=lower(command),m=q.match(/(?:raise|increase|change).*?(plow|snow|mow|lawn).*?([0-9]+(?:\.[0-9]+)?)\s*%/i);
  if(!m)return null;const pct=Number(m[2]),spec=rateSpec(q),eligible=[],excluded=[];
  for(const row of rows('customers')){
    if(!customerId(row)||truthy(value(row,'Internal Only','internalOnly')))continue;
    const current=rateValue(row,spec);if(!(current.amount>0))continue;
    if(truthy(value(row,'Custom Contract','customContract'))||text(value(row,'Contract Pricing','contractPricing'))){excluded.push({customerId:customerId(row),customerName:customerName(row)});continue;}
    eligible.push({customerId:customerId(row),customerName:customerName(row),field:current.field,before:current.amount,after:Math.round(current.amount*(1+pct/100)*100)/100});
  }
  const action=setPending({actionId:makeActionId(),type:'bulk-rate-change',request:text(command),businessId:businessId(),businessKey:businessKey(),service:spec.service,percent:pct,records:eligible,excluded,currentRevenue:eligible.reduce((s,x)=>s+x.before,0),proposedRevenue:eligible.reduce((s,x)=>s+x.after,0),canExecute:financialPermission(),requiredPermission:'manageFinancial'});
  return{action,answer:actionSummary(action)+(action.canExecute?'\nReview the affected count and approve only if this exact preview is correct.':'\nYou do not have pricing permission. I can keep this preview for owner review.')};
}
function productRequest(command){
  const q=lower(command);return /\b(move|rearrange|redesign|layout|screen|button|navigation|sidebar|color|font|interface|ui)\b/.test(q)&&/\b(invoice|quote|customer|office|page|screen|total|field|button|navigation)\b/.test(q);
}
function engineAttack(command){
  const q=lower(command);return /\b(change|remove|bypass|disable|edit|rewrite|override|grant)\b.*\b(permissions?|row level security|rls|source code|javascript|database schema|migration|security rules?|all access|everything)\b/.test(q)||/\bunrestricted sql\b/.test(q);
}
function crossTenantRequest(command){
  const q=lower(command);return /\b(other|another)\s+(tenant|business)\b/.test(q)||/\b(switch|impersonate)\b.*\btenant\b/.test(q)||/\btenant id\b.*\b(open|read|edit|change|show)\b/.test(q);
}
function makeProductSuggestion(command){
  const action=setPending({actionId:makeActionId(),type:'product-suggestion',request:text(command),businessId:businessId(),businessKey:businessKey(),title:'Assistant product suggestion',canExecute:true});
  return actionSummary(action)+'\nUse Approve & Save to send the structured suggestion to H38. This will not modify the application.';
}
function revisePending(command){
  if(!pending)return'';
  const q=lower(command);
  if(/never mind|cancel|leave (?:it|this|the customer)|keep .*old rate/.test(q))return cancelPending();
  if(/approve(?:\s*&?\s*save)?|save it|yes save/.test(q))return executePending();
  const m=text(command).match(/(?:make it|change it to|instead)\s*\$?([0-9]+(?:\.[0-9]+)?)/i);
  if(m&&pending.type==='rate-change'){
    const old=pending;pending={...old,after:Number(m[1]),version:Number(old.version||1)+1,status:'PREVIEW',updatedAt:now()};scheduleRender();
    return actionSummary(pending)+'\nThe previous approval target was invalidated. Approve & Save applies only to this new value.';
  }
  if(/request owner review|send to owner|owner review/.test(q))return requestOwnerReview();
  return'';
}
function canHandle(command){
  const q=lower(command);
  if(!q)return false;
  if(pending&&/(approve|save it|never mind|cancel|make it|change it to|instead|owner review)/.test(q))return true;
  if(engineAttack(q)||crossTenantRequest(q)||productRequest(q))return true;
  if(/(?:raise|change|set|make).*(?:plow|snow|mow|lawn|service).*(?:rate|price|\$| to )/.test(q))return true;
  if(/(?:raise|increase|change).*?(?:plow|snow|mow|lawn).*?[0-9]+(?:\.[0-9]+)?\s*%/.test(q))return true;
  if(/phone(?: number)?.*(?:change|update|wrong)|change .*phone/.test(q))return true;
  return base.canHandle?.(command)===true;
}
async function handle(command,options={}){
  const q=lower(command);
  if(pending){const revised=await revisePending(command);if(revised)return revised;}
  if(engineAttack(q))return'That request would change H38 platform/security authority. I will not modify permissions, RLS, source code, schema, or platform controls from a customer Assistant command.';
  if(crossTenantRequest(q))return'I will not switch tenants, accept another tenant ID from prompt text, or inspect another business from an Assistant command. Open the authorized business through the normal Office membership controls.';
  if(productRequest(q))return makeProductSuggestion(command);
  const bulk=previewBulk(command);if(bulk)return bulk.answer;
  if(/phone(?: number)?.*(?:change|update|wrong)|change .*phone/.test(q)){const out=previewPhone(command);return out.answer||out;}
  if(/(?:raise|change|set|make).*(?:plow|snow|mow|lawn|service).*(?:rate|price|\$| to )/.test(q)){const out=previewRate(command);return out.answer||out;}
  return base.handle(command,options);
}
installStyle();
new MutationObserver(()=>scheduleRender()).observe(document.documentElement,{childList:true,subtree:true});
const extended=Object.freeze({...base,build:`${base.build}+${BUILD}`,canHandle,handle,tenantAwareActions:true,previewApprovalExecutionProof:true,engineMutationAllowed:false,crossTenantPromptSwitching:false});
window.H38_ASSISTANT_COMMAND_BUS=extended;
window.H38_ASSISTANT_TENANT_ACTIONS=Object.freeze({enabled:true,build:BUILD,pending:snapshotPending,lastCompletion:()=>lastCompletion?JSON.parse(JSON.stringify(lastCompletion)):null,executePending,requestOwnerReview,cancelPending,financialPermission,customerEditPermission,engineMutationAllowed:false,tenantIsolation:true,previewApprovalExecutionProof:true});
window.dispatchEvent(new CustomEvent('h38:assistant-command-bus-ready',{detail:{build:extended.build,tenantAwareActions:true}}));
scheduleRender();
})();