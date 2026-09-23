(function(){
'use strict';
const BUILD='20260923-ai-team-orchestrator-1';
let initialized=false,lastScan=null,renderQueued=false;
const text=v=>String(v==null?'':v).trim();
const lower=v=>text(v).toLowerCase();
const val=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const number=v=>{const n=Number(String(v==null?'':v).replace(/[$,%]/g,''));return Number.isFinite(n)?n:0;};
const rows=name=>Array.isArray(window.state?.snapshot?.[name])?window.state.snapshot[name]:[];
const date=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?d:null;};
const daysOld=v=>{const d=date(v);return d?Math.floor((Date.now()-d.getTime())/86400000):0;};
const activeStatus=v=>!/(paid|closed|complete|completed|cancel|void|deleted|archived)/i.test(text(v));
const TEAM=Object.freeze([
  {key:'orchestrator',name:'Agent Manager',icon:'✦',purpose:'Routes work, combines findings, prevents conflicting or duplicate actions, and keeps every write behind the existing Office approval/proof controls.',page:'assistant'},
  {key:'coordinator',name:'Office Coordinator',icon:'🗂',purpose:'Watches jobs, schedule, tasks, follow-ups, and operating handoffs.',page:'today'},
  {key:'estimating',name:'Estimating Agent',icon:'🧮',purpose:'Watches draft quotes, missing pricing, stale estimates, and quote readiness.',page:'quotes'},
  {key:'field_ops',name:'Field & Operations Agent',icon:'🛠',purpose:'Watches active work, schedule conflicts, field readiness, and recurring operations.',page:'work'},
  {key:'finance',name:'Finance Agent',icon:'💵',purpose:'Watches open invoices, overdue balances, billing gaps, and money follow-up.',page:'money'},
  {key:'customer',name:'Customer Agent',icon:'👤',purpose:'Watches customer records for missing contact or job context and prepares follow-up work.',page:'customers'},
  {key:'owner',name:'Owner Agent',icon:'📌',purpose:'Turns the team scan into a short owner priority list and decision queue.',page:'today'},
  {key:'improvement',name:'Improvement Agent',icon:'⚙',purpose:'Detects repeated workflow friction and proposes product/process improvements without changing the H38 engine.',page:'assistant'}
]);
function finding(agent,severity,title,detail,page,prompt){return{agent,severity,title,detail,page:page||TEAM.find(x=>x.key===agent)?.page||'today',prompt:prompt||''};}
function invoiceFindings(out){
  for(const invoice of rows('invoices')){
    const status=text(val(invoice,'Status','status'));
    if(!activeStatus(status))continue;
    const total=number(val(invoice,'Total','total','Amount','amount'));
    const paid=number(val(invoice,'Paid','paid','Amount Paid','amountPaid'));
    const balance=number(val(invoice,'Balance Due','balanceDue','Balance','balance'))||Math.max(0,total-paid);
    if(balance<=0.005)continue;
    const due=val(invoice,'Due Date','dueDate');const dueDate=date(due);
    if(dueDate&&dueDate.getTime()<Date.now()-86400000)out.push(finding('finance','critical','Overdue invoice',`${text(val(invoice,'Invoice Number','invoiceNumber','Invoice ID','invoiceId'))||'Invoice'} has $${balance.toFixed(2)} outstanding and is past due.`,'money','Show me the overdue invoice and prepare the next follow-up.'));
    else if(dueDate&&dueDate.getTime()<Date.now()+7*86400000)out.push(finding('finance','warning','Invoice due soon',`${text(val(invoice,'Invoice Number','invoiceNumber','Invoice ID','invoiceId'))||'Invoice'} has $${balance.toFixed(2)} due within 7 days.`,'money','Show invoices due soon.'));
  }
}
function quoteFindings(out){
  for(const quote of rows('quotes')){
    const status=text(val(quote,'Status','status'))||'Draft';if(!/draft|internal review|working/i.test(status))continue;
    const raw=val(quote,'lines','Lines');let lines=Array.isArray(raw)?raw:[];if(typeof raw==='string'){try{const p=JSON.parse(raw);if(Array.isArray(p))lines=p;}catch(_){}}
    const total=number(val(quote,'Total','total'));
    const name=text(val(quote,'Project Title','projectTitle','Quote Number','quoteNumber','Quote ID','quoteId'))||'Draft quote';
    if(!lines.length||total<=0)out.push(finding('estimating','warning','Quote still needs pricing',`${name} is still a draft with ${!lines.length?'no priced lines':'a zero total'}.`,'quotes','Open the draft quote and tell me what is missing before it can be priced.'));
    const updated=val(quote,'Updated Time','updatedTime','Created Time','createdTime');if(updated&&daysOld(updated)>=7)out.push(finding('estimating','info','Stale draft quote',`${name} has not been updated in ${daysOld(updated)} days.`,'quotes','Review stale draft quotes and tell me which need follow-up.'));
  }
}
function customerFindings(out){
  let incomplete=0;
  for(const customer of rows('customers')){
    const name=text(val(customer,'Customer Name','name'));if(!name)continue;
    const phone=text(val(customer,'Phone','phone','Primary Phone','primaryPhone'));
    const email=text(val(customer,'Email','email','Primary Email','primaryEmail'));
    const address=text(val(customer,'Address','address','Service Address','serviceAddress'));
    if(!phone&&!email){incomplete++;out.push(finding('customer','warning','Customer cannot be contacted',`${name} has no phone or email on the current customer record.`,'customers',`Open customer ${name} and show me the missing contact fields.`));}
    else if(!address){incomplete++;out.push(finding('customer','info','Customer address missing',`${name} has contact information but no visible service/address field.`,'customers',`Open customer ${name}.`));}
    if(incomplete>=5)break;
  }
}
function jobFindings(out){
  const jobs=rows('jobs');let missingCustomer=0;
  for(const job of jobs){
    if(!activeStatus(val(job,'Status','status')))continue;
    const title=text(val(job,'Project Title','projectTitle','Job Name','jobName','Job ID','jobId'))||'Active job';
    if(!text(val(job,'Customer ID','customerId'))&&missingCustomer<3){missingCustomer++;out.push(finding('coordinator','warning','Active job missing customer link',`${title} is active but has no customer ID in the current snapshot.`,'work','Open jobs and show active work missing customer links.'));}
  }
}
function scheduleFindings(out){
  const items=rows('schedule').concat(rows('scheduleItems')).concat(rows('appointments'));
  const normalized=items.map(row=>({row,user:text(val(row,'Assigned User ID','assignedUserId','User ID','userId','Assigned To','assignedTo')),start:date(val(row,'Start Time','startTime','Start','start')),end:date(val(row,'End Time','endTime','End','end')),title:text(val(row,'Title','title','Project Title','projectTitle','Schedule ID','scheduleId'))||'Scheduled item'})).filter(x=>x.user&&x.start&&x.end&&x.end>x.start).sort((a,b)=>a.start-b.start);
  let conflicts=0;
  for(let i=0;i<normalized.length;i++)for(let j=i+1;j<normalized.length&&j<i+8;j++){
    const a=normalized[i],b=normalized[j];if(a.user!==b.user)continue;if(b.start>=a.end)break;if(a.start<b.end&&b.start<a.end&&conflicts<4){conflicts++;out.push(finding('field_ops','critical','Schedule conflict',`${a.title} overlaps ${b.title} for the same assigned user.`,'schedule','Show the schedule conflict and help me decide what should move.'));}
  }
}
function recurringFindings(out){
  const plans=rows('recurringPlans').concat(rows('recurringServicePlans'));
  for(const plan of plans.slice(0,100)){
    if(!activeStatus(val(plan,'Status','status')))continue;
    const next=date(val(plan,'Next Service Date','nextServiceDate','Next Due','nextDue'));
    if(next&&next.getTime()<Date.now()-86400000)out.push(finding('field_ops','warning','Recurring service is past due',`${text(val(plan,'Plan Name','planName','Recurring Plan ID','recurringPlanId'))||'Recurring service'} is past its next service date.`,'work','Show recurring service work that is past due.'));
  }
}
function summarize(findings){const counts={critical:0,warning:0,info:0};findings.forEach(f=>counts[f.severity]=(counts[f.severity]||0)+1);return{...counts,total:findings.length};}
function scan(){
  const findings=[];invoiceFindings(findings);quoteFindings(findings);customerFindings(findings);jobFindings(findings);scheduleFindings(findings);recurringFindings(findings);
  findings.sort((a,b)=>({critical:0,warning:1,info:2}[a.severity]-({critical:0,warning:1,info:2}[b.severity]));
  const summary=summarize(findings),byAgent=Object.fromEntries(TEAM.map(agent=>[agent.key,findings.filter(f=>f.agent===agent.key)]));
  byAgent.owner=findings.slice(0,5);byAgent.orchestrator=findings.slice(0,8);byAgent.improvement=[];
  if(summary.total>=4)byAgent.improvement.push(finding('improvement','info','Repeated operating friction detected',`The current scan found ${summary.total} issues across business workflows. Improvement Agent can turn repeated patterns into product/process suggestions, but it cannot change source code, permissions, schema, or the H38 engine.`,'assistant','Summarize the repeated workflow friction and create product suggestions only.'));
  lastScan={build:BUILD,businessId:text(window.state?.businessId),businessName:text(window.state?.snapshot?.business?.businessName),generatedAt:new Date().toISOString(),summary,findings,byAgent,agents:TEAM};
  render();return lastScan;
}
function ownerBrief(result=lastScan||scan()){
  const top=result.findings.slice(0,5);if(!top.length)return'AI Team scan is clear right now. I did not find overdue invoices, obvious draft-quote gaps, schedule conflicts, missing customer links, or recurring-service dates that are already past due.';
  return[`AI Team found ${result.summary.total} item${result.summary.total===1?'':'s'} needing attention (${result.summary.critical} critical, ${result.summary.warning} warning).`,...top.map((f,i)=>`${i+1}. ${f.title}: ${f.detail}`),'Nothing has been changed, sent, approved, purchased, paid, scheduled, or deployed.'].join('\n');
}
async function deepReview(){
  const result=lastScan||scan();const router=window.H38_ASSISTANT_ROUTER;if(!router?.ask)return ownerBrief(result)+'\n\nThe cloud advisory router is not available in this runtime, so this is the deterministic team brief.';
  const facts=result.findings.slice(0,12).map(f=>`${f.severity.toUpperCase()} | ${f.agent} | ${f.title} | ${f.detail}`).join('\n')||'No current deterministic findings.';
  const response=await router.ask({businessId:window.state?.businessId,question:`You are the H38 Agent Manager. Review ONLY these current deterministic Business Office findings and produce a short owner brief with priorities, dependencies, and safe next steps. Do not invent facts and do not execute or imply any external action.\n${facts}`,pageKey:'assistant',context:{source:'ai-team',businessName:result.businessName,roleName:text(window.state?.snapshot?.user?.roleName)}} ,60000);
  return text(response?.answer)||ownerBrief(result);
}
function esc(v){return text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function ensureStyle(){if(document.getElementById('h38AiTeamStyle'))return;const s=document.createElement('style');s.id='h38AiTeamStyle';s.textContent=`.h38-ai-team{margin:14px 0;padding:14px;border:1px solid #c8d6e1;border-radius:16px;background:#f8fbfd}.h38-ai-team-head{display:flex;gap:10px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap}.h38-ai-team-head h2{margin:0}.h38-ai-team-summary{font-size:.82rem;color:#53697b;margin-top:4px}.h38-ai-team-actions{display:flex;gap:7px;flex-wrap:wrap}.h38-ai-team-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:9px;margin-top:12px}.h38-ai-agent{border:1px solid #d9e2e9;border-radius:12px;padding:10px;background:white}.h38-ai-agent strong{display:block}.h38-ai-agent p{margin:5px 0 0;font-size:.78rem;color:#5c7182}.h38-ai-agent-count{display:inline-block;margin-top:7px;font-size:.72rem;font-weight:900}.h38-ai-findings{margin-top:11px;display:grid;gap:7px}.h38-ai-finding{display:flex;gap:8px;justify-content:space-between;align-items:flex-start;padding:9px;border-radius:10px;background:white;border-left:4px solid #789}.h38-ai-finding[data-severity="critical"]{border-left-color:#a32a2a}.h38-ai-finding[data-severity="warning"]{border-left-color:#a36a00}.h38-ai-finding[data-severity="info"]{border-left-color:#336b8c}.h38-ai-finding small{display:block;color:#607285;margin-top:3px}.h38-ai-finding button{min-height:36px;white-space:nowrap}@media(max-width:600px){.h38-ai-team-grid{grid-template-columns:1fr}.h38-ai-finding{flex-direction:column}.h38-ai-finding button{width:100%}}`;document.head.appendChild(s);}
function runPrompt(prompt){const form=document.getElementById('paCommandForm'),input=form?.querySelector('[name="command"]');if(!form||!input)return;input.value=prompt;form.requestSubmit();}
function render(){
  if(window.state?.page!=='assistant')return;const main=document.getElementById('mainContent'),form=document.getElementById('paCommandForm');if(!main||!form)return;ensureStyle();
  const result=lastScan||scan();let panel=main.querySelector('[data-h38-ai-team]');if(!panel){panel=document.createElement('section');panel.dataset.h38AiTeam='1';panel.className='h38-ai-team';const shell=main.querySelector('.pa-shell');shell?.parentNode?.insertBefore(panel,shell);}
  panel.innerHTML=`<div class="h38-ai-team-head"><div><h2>AI Team</h2><div class="h38-ai-team-summary">${result.summary.total} current finding${result.summary.total===1?'':'s'} · ${result.summary.critical} critical · ${result.summary.warning} warning · advisory until you approve an existing Office action</div></div><div class="h38-ai-team-actions"><button type="button" class="secondary" data-ai-team-scan>Run team scan</button><button type="button" class="secondary" data-ai-team-deep>AI owner brief</button></div></div><div class="h38-ai-team-grid">${TEAM.map(agent=>{const count=(result.byAgent[agent.key]||[]).length;return`<article class="h38-ai-agent"><strong>${agent.icon} ${esc(agent.name)}</strong><p>${esc(agent.purpose)}</p><span class="h38-ai-agent-count">${count} active item${count===1?'':'s'}</span></article>`;}).join('')}</div><div class="h38-ai-findings">${result.findings.slice(0,8).map(f=>`<div class="h38-ai-finding" data-severity="${f.severity}"><div><strong>${esc(f.title)}</strong><small>${esc(f.detail)}</small></div><button type="button" class="secondary" data-ai-team-page="${esc(f.page)}" data-ai-team-prompt="${esc(f.prompt)}">Review</button></div>`).join('')||'<div class="h38-install-note">No current team findings from the available Office snapshot.</div>'}</div>`;
  panel.querySelector('[data-ai-team-scan]')?.addEventListener('click',()=>{scan();window.toast?.('AI Team scan refreshed.');});
  panel.querySelector('[data-ai-team-deep]')?.addEventListener('click',()=>runPrompt('Run a deep AI Team owner review.'));
  panel.querySelectorAll('[data-ai-team-page]').forEach(button=>button.addEventListener('click',()=>{const page=button.dataset.aiTeamPage||'today';window.openPage?.(page);const prompt=button.dataset.aiTeamPrompt;if(prompt)setTimeout(()=>{try{window.H38_AI_TEAM.lastReviewPrompt=prompt;}catch(_){}},0);}));
}
function scheduleRender(){if(renderQueued)return;renderQueued=true;queueMicrotask(()=>{renderQueued=false;render();});}
function install(){
  if(initialized)return true;const base=window.H38_ASSISTANT_COMMAND_BUS;if(!base)return false;initialized=true;
  const teamCommand=/\b(ai team|agent team|agent manager|business brief|team scan|team status|scan (?:the )?business|what needs attention)\b/i;
  const deepCommand=/\b(deep|full|complete|analy[sz]e|owner review)\b/i;
  const canHandle=command=>teamCommand.test(text(command))||base.canHandle?.(command);
  const handle=async(command,options={})=>{if(teamCommand.test(text(command))){const result=scan();if(deepCommand.test(text(command)))return deepReview();return ownerBrief(result);}return base.handle?.(command,options)||'';};
  const agentStatus=()=>{const prior=base.agentStatus?.()||{agents:[],ready:0,total:0};const agents=[...(prior.agents||[]),...TEAM.map(agent=>[`AI Team · ${agent.name}`,true])];return{agents,ready:agents.filter(x=>x[1]).length,total:agents.length,summary:agents.map(([name,ok])=>`${ok?'✓':'○'} ${name}`).join('\n')};};
  window.H38_ASSISTANT_COMMAND_BUS=Object.freeze({...base,canHandle,handle,agentStatus,aiTeamOrchestration:true,aiTeamBuild:BUILD,engineChangesAllowed:false,externalActionsEnabled:false,automaticCustomerSending:false,automaticApproval:false,automaticPurchasing:false,automaticPayment:false,automaticScheduling:false,automaticDeployment:false});
  window.H38_AI_TEAM={enabled:true,build:BUILD,agents:TEAM,scan,ownerBrief,deepReview,getLastScan:()=>lastScan,lastReviewPrompt:'',activeTenantOnly:true,usesExistingSpecialists:true,usesExistingCommandBus:true,usesExistingApprovalProof:true,engineChangesAllowed:false,externalActionsEnabled:false,automaticCustomerSending:false,automaticApproval:false,automaticPurchasing:false,automaticPayment:false,automaticScheduling:false,automaticDeployment:false};
  window.addEventListener('h38:office-page-rendered',scheduleRender);window.addEventListener('h38:business-snapshot-updated',()=>{lastScan=null;scheduleRender();});
  const observer=new MutationObserver(scheduleRender);observer.observe(document.documentElement,{childList:true,subtree:true});scheduleRender();
  window.dispatchEvent(new CustomEvent('h38:ai-team-ready',{detail:{build:BUILD}}));return true;
}
if(!install())window.addEventListener('h38:assistant-command-bus-ready',install,{once:true});
})();