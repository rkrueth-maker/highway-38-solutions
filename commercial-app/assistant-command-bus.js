(function(){
'use strict';
const BUILD='20260824-assistant-command-bus-2';
const text=v=>String(v==null?'':v).trim();
const lower=v=>text(v).toLowerCase();
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const state=()=>window.state||{};
const snapshot=()=>state().snapshot||{};
const rows=name=>window.H38_EXAMPLE_DATA_MANAGER?.rowsFor?.(snapshot(),name)||(Array.isArray(snapshot()[name])?snapshot()[name]:[]);
const pageNames={today:'Today',customers:'Customers',work:'Jobs',quotes:'Quote Builder',measure:'Measure',schedule:'Schedule',messages:'Messages',field:'Site Visit',inventory:'Inventory',fleet:'Fleet & Maintenance',money:'Money',documents:'Files',social:'Social',ai:'H38 AI',settings:'Settings',assistant:'Personal Assistant',meetings:'Meetings'};
const pageAliases=[
  [/(?:today|dashboard|home)/,'today'],[/(?:customer|client)/,'customers'],[/(?:job|work|task)/,'work'],[/(?:quote|estimate|pricing)/,'quotes'],[/(?:measure|measurement|scanner)/,'measure'],[/(?:schedule|calendar|appointment)/,'schedule'],[/(?:message|communication|email|text|sms|portal)/,'messages'],[/(?:site\s*visit|field|walkthrough)/,'field'],[/(?:inventory|stock|material)/,'inventory'],[/(?:fleet|maintenance|equipment|asset|vehicle|trailer|tool)/,'fleet'],[/(?:money|invoice|payment|expense|mileage|accounting)/,'money'],[/(?:file|document|photo)/,'documents'],[/(?:social|facebook|instagram|post)/,'social'],[/(?:settings?|configuration|example data|demo data)/,'settings'],[/(?:assistant|personal assistant)/,'assistant'],[/(?:meeting|conversation|call)/,'meetings'],[/(?:h38 ai|ai)/,'ai']
];
const EXTERNAL=/\b(send|deliver|release|email it|text it|message the customer|approve|accept for|reject|pay|refund|purchase|buy|order|publish|post it|delete|invite|change permission|deploy|file tax|submit tax|export payroll)\b/i;
function allowedPage(page){try{return typeof window.allowedPages==='function'?window.allowedPages().includes(page):true;}catch(_){return true;}}
function open(page){if(!allowedPage(page)&&page!=='meetings')return false;try{window.openPage?.(page);return true;}catch(_){return false;}}
function settingContext(customerId,jobId=''){try{window.H38_OWNER_CUSTOMER_WORKFLOW_POLISH?.setContext?.(customerId,{jobId,source:'assistant-command'});}catch(_){}try{if(window.H38_CUSTOMER_360)window.H38_CUSTOMER_360.selectedCustomerId=customerId;}catch(_){} }
function customerMatches(query){const c360=window.H38_CUSTOMER_360;if(!c360?.searchCustomers)return[];try{return c360.searchCustomers(snapshot(),query)||[];}catch(_){return[];}}
function directCustomerResult(query){
  const words=lower(query).replace(/[^a-z0-9' -]+/g,' ').split(/\s+/).filter(word=>word.length>1);
  if(!words.length)return null;
  const candidates=rows('customers').map(row=>({row,id:text(value(row,'Customer ID','customerId')),name:text(value(row,'Customer Name','name'))})).filter(x=>x.id&&x.name);
  const matched=candidates.filter(x=>{const name=lower(x.name);return words.every(word=>name.split(/\s+/).some(part=>part===word||part.startsWith(word)||word.startsWith(part)));});
  if(matched.length===1){const item=matched[0],c360=window.H38_CUSTOMER_360;return{customerId:item.id,bundle:c360?.customerBundle?.(snapshot(),item.id)||null};}
  if(matched.length>1)return{ambiguous:true,answer:`I found more than one matching customer: ${matched.slice(0,3).map(x=>x.name).join(', ')}. Add an address or job detail.`};
  return null;
}
function customerResult(query){
  const c360=window.H38_CUSTOMER_360;
  if(c360){
    try{const result=c360.resolveAssistantQuery?.(snapshot(),query);if(result?.confident&&result.customerId)return{customerId:result.customerId,bundle:c360.customerBundle?.(snapshot(),result.customerId),answer:result.answer};if(result?.matched&&!result?.confident){const direct=directCustomerResult(query);if(direct)return direct;return{ambiguous:true,answer:result.answer};}}catch(_){}
    const list=customerMatches(query);if(list.length===1)return{customerId:list[0].customerId,bundle:list[0].bundle};if(list.length>1){const direct=directCustomerResult(query);if(direct)return direct;return{ambiguous:true,answer:`I found more than one matching customer: ${list.slice(0,3).map(x=>text(value(x.bundle?.customer,'Customer Name'))).join(', ')}. Add an address or job detail.`};}
  }
  return directCustomerResult(query);
}
function customerName(id){return text(value(rows('customers').find(row=>text(value(row,'Customer ID','customerId'))===text(id)),'Customer Name','name'))||'customer';}
function customerFromCommand(command){
  const stripped=text(command).replace(/^(please\s+)?(open|show|find|pull up|start|new|create|prepare|go to)\s+/i,'').replace(/\b(quote|estimate|job|jobs|site visit|field visit|meeting|conversation|files?|documents?|schedule|maintenance|customer|client|for|on|with|from photos?|photo quote)\b/gi,' ').replace(/\s+/g,' ').trim();
  return customerResult(stripped)||customerResult(command);
}
function jobsForCustomer(cid){return rows('jobs').filter(row=>text(value(row,'Customer ID','customerId'))===cid);}
function assetSearch(term){const q=lower(term);return rows('assets').filter(row=>`${value(row,'Asset Number','assetNumber')} ${value(row,'Description','description')} ${value(row,'Asset Type','assetType','Category')}`.toLowerCase().includes(q));}
function parseDate(command){const q=lower(command),d=new Date();if(/\btomorrow\b/.test(q)){d.setDate(d.getDate()+1);return d.toISOString().slice(0,10);}if(/\bnext week\b/.test(q)){d.setDate(d.getDate()+7);return d.toISOString().slice(0,10);}const m=q.match(/\b(20\d\d-\d\d-\d\d)\b/);return m?m[1]:'';}
function focusAfter(id,callback){setTimeout(()=>{const node=document.getElementById(id);if(node){callback?.(node);node.scrollIntoView?.({block:'center'});node.focus?.();}},60);}
function agentStatus(){
  const agents=[
    ['Personal Assistant',!!window.H38_PERSONAL_ASSISTANT],['Command Bus',true],['Customer 360',!!window.H38_CUSTOMER_360],['Quote Agent',!!window.H38_QUOTE_AGENT_CONTRACT],['Conversation / Meeting Assistant',!!window.H38_CONVERSATION_MEETING_ASSISTANT],['Site Visit',!!window.H38_FIELD_VISIT||!!window.H38_FIELD_VISIT_CORE],['Site Visit AI Evidence',!!window.H38_SITE_VISIT_AI_EVIDENCE_BRIDGE],['Job Lifecycle',!!window.H38_JOB_LIFECYCLE],['Photo Quote',!!window.H38_OWNER_CUSTOMER_WORKFLOW_POLISH],['Example Data',!!window.H38_EXAMPLE_DATA_MANAGER]
  ];
  return{agents,ready:agents.filter(x=>x[1]).length,total:agents.length,summary:agents.map(([name,ok])=>`${ok?'✓':'○'} ${name}`).join('\n')};
}
function highRiskResponse(command){const q=lower(command);let page='';if(/pay|refund|invoice|expense/.test(q))page='money';else if(/send|email|text|message|deliver|release/.test(q))page=/quote|estimate/.test(q)?'quotes':'messages';else if(/publish|post/.test(q))page='social';else if(/purchase|buy|order/.test(q))page='inventory';else if(/approve|reject/.test(q))page=/quote|estimate/.test(q)?'quotes':'today';else if(/settings|permission|invite|deploy|delete/.test(q))page='settings';if(page)open(page);return`I opened ${pageNames[page]||'the relevant Office control'}, but I did not execute “${text(command)}”. Sending, approval, purchasing, payment, deletion, permissions, publishing and other external commitments still require the explicit control on that screen.`;}
function canHandle(command){const q=lower(command);if(!q)return false;if(EXTERNAL.test(q))return true;if(/agent status|check agents|agents working|what agents/.test(q))return true;if(/example data|sample data|proof data/.test(q))return true;if(/^(open|show|go to|take me to|start|new|create|prepare|find|pull up)\b/.test(q))return true;if(/\b(maintenance|fleet|inventory|site visit|meeting|quote|customer|job|schedule|files|documents|settings)\b/.test(q))return true;return false;}
async function handle(command,options={}){
  const q=lower(command);if(!q)return'';
  if(EXTERNAL.test(command))return highRiskResponse(command);
  if(/agent status|check agents|agents working|what agents/.test(q)){const status=agentStatus();return`${status.ready} of ${status.total} specialist authorities are available in this runtime.\n${status.summary}`;}
  if(/(?:install|load|reset|populate).*(?:example|sample|proof) data|(?:example|sample|proof) data.*(?:install|load|reset|populate)/.test(q)){open('settings');return'Example Data is ready in Settings. Use Install/Reset examples there so the exact removable dataset is visible before it is written.';}
  if(/(?:hide|turn off|disable).*(?:example|sample) data/.test(q)){open('settings');return'Opened Settings to Example Data. Hiding examples is reversible and leaves real records untouched; use the Hide examples control.';}
  if(/(?:clear|remove|delete).*(?:example|sample) data/.test(q)){open('settings');return'Opened Settings to Example Data. Clearing examples requires the explicit Clear examples confirmation so real records cannot be removed by a misunderstood command.';}
  const customer=customerFromCommand(command);
  if(customer?.ambiguous)return customer.answer||'I found multiple possible customers. Add an address or job detail.';
  const cid=customer?.customerId||'';
  if(cid)settingContext(cid);
  if(/(?:start|new|create|prepare).*\b(quote|estimate)\b|\b(quote|estimate)\b.*\bfor\b/.test(q)){
    if(!cid)return'Which customer is this quote for? Give me the customer name, address or job.';
    state().quote={quoteId:'',lines:[],hydrationComplete:true,customerId:cid};open('quotes');if(/photo|pictures?/.test(q)){setTimeout(()=>window.H38_OWNER_CUSTOMER_WORKFLOW_POLISH?.openQuickQuote?.(cid),80);return`Opened Quick Quote from Photos for ${customerName(cid)}. Add photos and scope; H38 will tell you exactly what is still required without forcing a Site Visit.`;}return`Started a new working quote for ${customerName(cid)}. Nothing is saved, approved or sent until you use the Quote Builder controls.`;
  }
  if(/(?:start|new|create).*\b(meeting|conversation|call)\b/.test(q)){
    if(window.H38_CONVERSATION_MEETING_ASSISTANT?.startMeeting){window.H38_CONVERSATION_MEETING_ASSISTANT.startMeeting({customerId:cid});return`Opened a new ${cid?customerName(cid)+' ':''}meeting record. Recording will not start unless you explicitly choose it.`;}open('meetings');return'Opened Meetings.';
  }
  if(/(?:add|record).*\bpast (conversation|meeting|call)\b/.test(q)){
    if(window.H38_CONVERSATION_MEETING_ASSISTANT?.addPastConversation){window.H38_CONVERSATION_MEETING_ASSISTANT.addPastConversation({customerId:cid});return`Opened Past Conversation${cid?` for ${customerName(cid)}`:''}. Recording is not required.`;}open('meetings');return'Opened Meetings.';
  }
  if(/(?:start|new|create|open).*\b(site visit|field visit|walkthrough)\b/.test(q)){open('field');if(cid){focusAfter('fieldVisitCustomer',node=>{node.value=cid;node.dispatchEvent(new Event('change',{bubbles:true}));});return`Opened Site Visit for ${customerName(cid)}. Customer context is set; capture does not start until you use the Site Visit control.`;}return'Opened Site Visit.';}
  if(/\bmaintenance\b/.test(q)){
    open('fleet');const raw=text(command).replace(/^.*?maintenance\s+(?:for|on)?\s*/i,'').replace(/\b(tomorrow|next week|20\d\d-\d\d-\d\d)\b.*$/i,'').trim();const assets=raw?assetSearch(raw):[];const due=parseDate(command);setTimeout(()=>{const form=document.getElementById('maintenanceForm');if(!form)return;if(assets.length===1)form.elements.assetId.value=text(value(assets[0],'Asset ID','assetId'));if(due)form.elements.dueDate.value=due;form.scrollIntoView?.({block:'center'});form.elements.maintenanceType?.focus?.();},70);if(assets.length>1)return`Opened Maintenance. I found ${assets.length} matching assets; choose the correct equipment before saving.`;if(assets.length===1)return`Opened Maintenance for ${text(value(assets[0],'Description','description'))}${due?` due ${due}`:''}. Review service type/priority, then save the internal maintenance record.`;return'Opened Fleet & Maintenance. Choose the equipment and service details, then save.';
  }
  if(/\b(job|jobs|work)\b/.test(q)&&cid){open('work');const jobs=jobsForCustomer(cid);return`Opened Jobs for ${customerName(cid)}. ${jobs.length?`${jobs.length} linked job${jobs.length===1?'':'s'} are in the current Office pack.`:'There is no linked job yet; use the job form to create one with the customer context.'}`;}
  if(/^(?:open|show|find|pull up).*\b(customer|client)\b/.test(q)||cid&&/^(?:open|show|find|pull up)/.test(q)){open('customers');if(cid&&window.H38_CUSTOMER_360)window.H38_CUSTOMER_360.selectedCustomerId=cid;return cid?`Opened Customer 360 for ${customerName(cid)}.`:'Opened Customers.';}
  for(const [pattern,page] of pageAliases){if(pattern.test(q)){open(page);return`Opened ${pageNames[page]}.`;}}
  if(cid){open('customers');return`Opened Customer 360 for ${customerName(cid)}.`;}
  return'';
}
window.H38_ASSISTANT_COMMAND_BUS=Object.freeze({enabled:true,build:BUILD,canHandle,handle,agentStatus,customerResult,openPage:open,specialistExecution:true,internalNavigation:true,internalPreparation:true,externalActionsEnabled:false,automaticCustomerSending:false,automaticApproval:false,automaticPurchasing:false,automaticPayment:false,automaticScheduling:false});
window.dispatchEvent(new CustomEvent('h38:assistant-command-bus-ready',{detail:{build:BUILD}}));
})();
