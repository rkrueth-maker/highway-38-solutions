(function(){
'use strict';

const BUILD='20260901-profitability-operating-layer-1';
const DEFAULTS=Object.freeze({targetMarginPct:32,laborBurdenPct:30,overheadPct:10});
const HEALTH_DIMENSIONS=Object.freeze(['Profit','Sales','Operations','Team','Cash','Systems']);
const COMPLETE_JOB_RE=/\b(complet(?:e|ed)|closed|done|invoiced|paid)\b/i;
const POSITIVE_QUOTE_RE=/\b(approved|accepted|won|awarded|sold)\b/i;
const NEGATIVE_QUOTE_RE=/\b(declined|rejected|lost|cancelled|canceled)\b/i;
let priceBookCache={businessId:'',loadedAt:0,assemblies:[],items:[]};

const app=()=>window.state||{};
const snap=()=>app().snapshot||{};
const text=value=>String(value==null?'':value).trim();
const number=value=>{const n=Number(value);return Number.isFinite(n)?n:0;};
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const val=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const idOf=(row,...keys)=>text(val(row,...keys));
const safe=value=>text(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const currency=value=>{try{return typeof window.money==='function'?window.money(value):number(value).toLocaleString(undefined,{style:'currency',currency:'USD'});}catch(_){return `$${number(value).toFixed(2)}`;}};
const records=name=>{try{if(typeof window.records==='function')return window.records(name)||[];}catch(_){}const rows=snap()[name];return Array.isArray(rows)?rows:[];};
const realRows=name=>records(name).filter(row=>!isExample(row));
const todayIso=()=>new Date().toISOString().slice(0,10);
const normalize=value=>text(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const percent=value=>Number.isFinite(value)?`${value.toFixed(1)}%`:'—';
const statusClass=score=>score==null?'neutral':score>=80?'online':score>=60?'neutral':score>=40?'warn':'bad';
const statusLabel=score=>score==null?'Needs data':score>=80?'Strong':score>=60?'Watch':score>=40?'At risk':'Needs action';

function isExample(row){
  if(!row)return false;
  if(row['Example Data']===true||row.exampleData===true||row['Historical Demo']===true||row.historicalDemo===true)return true;
  const marker=[val(row,'Quote Number','quoteNumber','Job Number','jobNumber','Invoice Number','invoiceNumber'),val(row,'Project Title','projectTitle'),val(row,'Status','status')].join(' ');
  return /\bDEMO\b|\bEX-/i.test(marker);
}
function canSeeFinancial(){
  try{
    if(typeof window.can==='function')return window.can('manageFinancial')||window.can('viewFinancial')||window.can('manageSettings');
    const user=snap().user;if(!user)return false;if(user.owner||user.permissions?.all===true)return true;
    return user.permissions?.manageFinancial===true||user.permissions?.viewFinancial===true||user.permissions?.manageSettings===true;
  }catch(_){return false;}
}
function settingsKey(){return `h38:profitability:${text(app().businessId||'default')}`;}
function readSettings(){
  try{
    const stored=JSON.parse(localStorage.getItem(settingsKey())||'{}');
    return {
      targetMarginPct:clamp(number(stored.targetMarginPct||DEFAULTS.targetMarginPct),1,80),
      laborBurdenPct:clamp(number(stored.laborBurdenPct??DEFAULTS.laborBurdenPct),0,200),
      overheadPct:clamp(number(stored.overheadPct??DEFAULTS.overheadPct),0,80)
    };
  }catch(_){return {...DEFAULTS};}
}
function writeSettings(next){
  const normalized={
    targetMarginPct:clamp(number(next.targetMarginPct),1,80),
    laborBurdenPct:clamp(number(next.laborBurdenPct),0,200),
    overheadPct:clamp(number(next.overheadPct),0,80)
  };
  try{localStorage.setItem(settingsKey(),JSON.stringify(normalized));}catch(_){}
  return normalized;
}
function injectStyles(){
  if(document.getElementById('h38ProfitabilityStyles'))return;
  const style=document.createElement('style');
  style.id='h38ProfitabilityStyles';
  style.textContent=`
    .h38-profit-card{border:1px solid color-mix(in srgb,currentColor 18%,transparent);background:linear-gradient(180deg,rgba(31,111,139,.08),rgba(255,255,255,.02));}
    .h38-profit-kicker{font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.72}
    .h38-profit-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.65rem;margin:.75rem 0}
    .h38-profit-metric{padding:.72rem;border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:12px;background:color-mix(in srgb,var(--card,#fff) 92%,transparent)}
    .h38-profit-metric strong{display:block;font-size:1.08rem;margin-top:.15rem}.h38-profit-metric small{opacity:.7}
    .h38-profit-note{font-size:.86rem;opacity:.78;line-height:1.45}.h38-profit-alert{padding:.7rem .8rem;border-radius:10px;background:rgba(184,111,0,.10);margin:.6rem 0}
    .h38-profit-ok{background:rgba(24,132,83,.10)}
    .h38-profit-controls{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.65rem;margin-top:.8rem}.h38-profit-controls label{font-size:.78rem;font-weight:700}.h38-profit-controls input{width:100%}
    .h38-health-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.7rem}.h38-health-card{padding:.78rem;border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:12px}.h38-health-score{font-size:1.35rem;font-weight:800}
    .h38-profit-list{display:grid;gap:.6rem}.h38-profit-row{padding:.72rem;border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:12px}.h38-profit-row .row-top{gap:.6rem}.h38-profit-row small{display:block;margin-top:.3rem;opacity:.74}
    .h38-plan-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.7rem}.h38-plan-step{padding:.8rem;border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:12px}.h38-plan-step h3{margin:.15rem 0 .4rem}.h38-plan-step p{margin:.2rem 0}
    .h38-profit-mini{margin:.75rem 0;padding:.78rem;border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:12px;background:rgba(31,111,139,.06)}
    @media(max-width:760px){.h38-profit-grid,.h38-health-grid,.h38-plan-grid,.h38-profit-controls{grid-template-columns:1fr 1fr}.h38-profit-card{overflow:hidden}}
    @media(max-width:480px){.h38-profit-grid,.h38-health-grid,.h38-plan-grid,.h38-profit-controls{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}
function currentQuoteRecord(){
  const quoteId=text(app().quote&&app().quote.quoteId);
  const quotes=records('quotes');
  return quotes.find(row=>idOf(row,'Quote ID','quoteId')===quoteId)||{};
}
function quoteLines(row=currentQuoteRecord()){
  const stateLines=app().quote&&Array.isArray(app().quote.lines)?app().quote.lines:[];
  if(stateLines.length)return stateLines;
  const raw=val(row,'lines','Lines');
  if(Array.isArray(raw))return raw;
  if(typeof raw==='string'){try{const parsed=JSON.parse(raw);return Array.isArray(parsed)?parsed:[];}catch(_){} }
  return [];
}
function lineQty(line){return Math.max(0,number(val(line,'Quantity','quantity')||1));}
function lineSellRate(line){return number(val(line,'Unit Price','unitPrice','rate','sellRate'));}
function lineDescription(line){return text(val(line,'Description','description'));}
function lineUnit(line){return normalize(val(line,'Unit','unit'));}
function lineCatalogId(line){return text(val(line,'catalogId','Catalog ID','Price Book ID','priceBookId','assemblyId','itemId'));}
function explicitUnitCost(line){
  const keys=['directCostPerUnit','Direct Cost Per Unit','unitCost','Unit Cost','cost','Cost'];
  for(const key of keys){if(line&&line[key]!==undefined&&line[key]!==null&&line[key]!==''&&number(line[key])>=0)return{known:true,cost:number(line[key]),source:'quote line'};}
  return{known:false,cost:0,source:''};
}
async function getPriceBook(){
  const businessId=text(app().businessId);if(!businessId)return priceBookCache;
  if(priceBookCache.businessId===businessId&&Date.now()-priceBookCache.loadedAt<300000)return priceBookCache;
  const client=window.H38_SUPABASE_SHARED_CLIENT?.ensure?.();if(!client)return priceBookCache={businessId,loadedAt:Date.now(),assemblies:[],items:[]};
  const [assemblyResult,itemResult]=await Promise.all([
    client.from('price_book_assemblies').select('id,assembly_code,description,output_unit,direct_cost_per_unit,sell_rate,approval_status').eq('business_id',businessId),
    client.from('price_book_items').select('id,item_code,description,unit,unit_cost,approval_status').eq('business_id',businessId)
  ]);
  const assemblies=assemblyResult.error?[]:(assemblyResult.data||[]),items=itemResult.error?[]:(itemResult.data||[]);
  priceBookCache={businessId,loadedAt:Date.now(),assemblies,items};return priceBookCache;
}
function matchLineCost(line,book){
  const explicit=explicitUnitCost(line);if(explicit.known)return explicit;
  const catalog=lineCatalogId(line),desc=normalize(lineDescription(line)),unit=lineUnit(line);
  const assemblies=book?.assemblies||[],items=book?.items||[];
  const assembly=assemblies.find(row=>catalog&&[text(row.id),text(row.assembly_code)].includes(catalog))||assemblies.find(row=>desc&&normalize(row.description)===desc&&(!unit||normalize(row.output_unit)===unit));
  if(assembly&&number(assembly.direct_cost_per_unit)>0)return{known:true,cost:number(assembly.direct_cost_per_unit),source:'Price Book assembly'};
  const item=items.find(row=>catalog&&[text(row.id),text(row.item_code)].includes(catalog))||items.find(row=>desc&&normalize(row.description)===desc&&(!unit||normalize(row.unit)===unit));
  if(item&&number(item.unit_cost)>0)return{known:true,cost:number(item.unit_cost),source:'Price Book item'};
  return{known:false,cost:0,source:''};
}
function quoteProfitability(lines,book,settings){
  let revenue=0,knownDirectCost=0,knownRevenue=0,unknownLines=0;
  const details=lines.map(line=>{
    const qty=lineQty(line),sellRate=lineSellRate(line),lineRevenue=qty*sellRate,costMatch=matchLineCost(line,book),directCost=costMatch.known?qty*costMatch.cost:0;
    revenue+=lineRevenue;if(costMatch.known){knownDirectCost+=directCost;knownRevenue+=lineRevenue;}else unknownLines++;
    return{line,qty,sellRate,lineRevenue,directCost,costKnown:costMatch.known,costSource:costMatch.source};
  });
  const coverage=lines.length?100*(lines.length-unknownLines)/lines.length:0;
  const overhead=revenue*settings.overheadPct/100;
  const planningProfit=revenue-knownDirectCost-overhead;
  const planningMargin=revenue>0?100*planningProfit/revenue:null;
  const denom=1-(settings.targetMarginPct+settings.overheadPct)/100;
  const targetPrice=knownDirectCost>0&&denom>0?knownDirectCost/denom:0;
  return{details,revenue,knownDirectCost,knownRevenue,unknownLines,coverage,overhead,planningProfit,planningMargin,targetPrice,complete:lines.length>0&&unknownLines===0};
}
function profitGuardMarkup(model,settings){
  const marginGood=model.complete&&model.planningMargin>=settings.targetMarginPct;
  const marginText=model.complete?percent(model.planningMargin):'Incomplete';
  const targetGap=model.complete&&model.targetPrice>model.revenue?model.targetPrice-model.revenue:0;
  return `<section id="h38ProfitGuard" class="card h38-profit-card" data-h38-profit-guard="true">
    <div class="row-top"><div><span class="h38-profit-kicker">OWNER PROFIT GUARD</span><h2>Price the job for profit</h2></div><span class="pill ${marginGood?'online':model.complete?'warn':'neutral'}">${marginGood?'On target':model.complete?'Review margin':'Cost data needed'}</span></div>
    <p class="h38-profit-note">Uses recorded quote prices and exact Price Book cost matches. Unknown costs stay unknown. Nothing changes the quote, approves it, or sends anything to the customer.</p>
    <div class="h38-profit-grid">
      <div class="h38-profit-metric"><small>Quote revenue</small><strong>${currency(model.revenue)}</strong></div>
      <div class="h38-profit-metric"><small>Known direct cost</small><strong>${currency(model.knownDirectCost)}</strong></div>
      <div class="h38-profit-metric"><small>Planning margin</small><strong>${marginText}</strong></div>
      <div class="h38-profit-metric"><small>Cost coverage</small><strong>${model.coverage.toFixed(0)}%</strong></div>
    </div>
    <div class="h38-profit-alert ${marginGood?'h38-profit-ok':''}">${model.complete?(marginGood?`Margin is at or above the ${settings.targetMarginPct.toFixed(0)}% target.`:`Target margin is ${settings.targetMarginPct.toFixed(0)}%. ${targetGap>0?`Current known costs indicate about <strong>${currency(model.targetPrice)}</strong> in revenue is needed (${currency(targetGap)} above this draft).`:'Review line pricing and cost assumptions before approval.'}`):`${model.unknownLines} quote line${model.unknownLines===1?'':'s'} do not have an exact cost match. Add or link Price Book costs before treating the margin as reliable.`}</div>
    <div class="h38-profit-controls" aria-label="Profitability planning assumptions">
      <label>Target margin %<input id="h38ProfitTargetMargin" type="number" min="1" max="80" step="1" value="${settings.targetMarginPct}"></label>
      <label>Labor burden %<input id="h38ProfitLaborBurden" type="number" min="0" max="200" step="1" value="${settings.laborBurdenPct}"></label>
      <label>Overhead allowance %<input id="h38ProfitOverhead" type="number" min="0" max="80" step="1" value="${settings.overheadPct}"></label>
    </div>
    <p class="h38-profit-note">Planning assumptions are stored on this device for this business. Labor burden is used in job back-costing; overhead allowance is applied to quote/job revenue. These are owner planning values, not accounting entries.</p>
  </section>`;
}
async function decorateProfitGuard(){
  if(!canSeeFinancial()||!document.getElementById('quoteCustomer')||document.getElementById('quotePreviewDocument'))return;
  injectStyles();
  const main=document.getElementById('mainContent');if(!main)return;
  main.querySelector('#h38ProfitGuard')?.remove();
  const settings=readSettings(),lines=quoteLines(),book=await getPriceBook(),model=quoteProfitability(lines,book,settings);
  const anchor=main.querySelector('#h38MissingCostReview')||main.querySelector('.grid')||main.firstElementChild;
  if(!anchor)return;
  anchor.insertAdjacentHTML(anchor.id==='h38MissingCostReview'?'afterend':'beforebegin',profitGuardMarkup(model,settings));
  ['h38ProfitTargetMargin','h38ProfitLaborBurden','h38ProfitOverhead'].forEach(id=>document.getElementById(id)?.addEventListener('change',()=>{
    writeSettings({targetMarginPct:document.getElementById('h38ProfitTargetMargin')?.value,laborBurdenPct:document.getElementById('h38ProfitLaborBurden')?.value,overheadPct:document.getElementById('h38ProfitOverhead')?.value});
    void decorateProfitGuard();
  }));
}
function quoteRevenue(row){
  const total=number(val(row,'Total','total'));if(total>0)return total;
  const subtotal=number(val(row,'Subtotal','subtotal'));if(subtotal>0)return subtotal;
  const raw=val(row,'lines','Lines');let lines=Array.isArray(raw)?raw:[];if(typeof raw==='string'){try{lines=JSON.parse(raw)||[];}catch(_){}}
  return Array.isArray(lines)?lines.reduce((sum,line)=>sum+lineQty(line)*lineSellRate(line),0):0;
}
function employeeRateMap(){
  const map=new Map();realRows('employees').forEach(row=>{const userId=idOf(row,'User ID','userId'),employeeId=idOf(row,'Employee ID','employeeId'),rate=number(val(row,'Hourly Rate','hourlyRate'));if(rate>0){if(userId)map.set(userId,rate);if(employeeId)map.set(employeeId,rate);}});return map;
}
function buildBackCosts(settings){
  const jobs=realRows('jobs'),quotes=realRows('quotes'),expenses=realRows('expenses'),times=realRows('timeEntries'),invoices=realRows('invoices'),rateMap=employeeRateMap();
  const quoteById=new Map(quotes.map(row=>[idOf(row,'Quote ID','quoteId'),row]));
  const byJob=(list,key)=>list.filter(row=>idOf(row,'Job ID','jobId')===key);
  return jobs.map(job=>{
    const jobId=idOf(job,'Job ID','jobId'),quoteId=idOf(job,'Quote ID','quoteId'),quote=quoteById.get(quoteId)||quotes.find(row=>idOf(row,'Job ID','jobId')===jobId)||{};
    const jobExpenses=byJob(expenses,jobId),jobTimes=byJob(times,jobId),jobInvoices=byJob(invoices,jobId);
    const quoted=quoteRevenue(quote),invoiced=jobInvoices.reduce((sum,row)=>sum+number(val(row,'Total','total')),0),revenue=invoiced>0?invoiced:quoted;
    const expenseCost=jobExpenses.reduce((sum,row)=>sum+number(val(row,'Amount','amount'))+number(val(row,'Tax','tax')),0);
    let hours=0,baseLabor=0,unknownLaborHours=0;
    jobTimes.forEach(row=>{const h=number(val(row,'Hours','hours','Regular Hours','Duration Hours'))+number(val(row,'Overtime Hours','overtimeHours'));hours+=h;const user=idOf(row,'User ID','userId','Employee ID','employeeId'),rate=rateMap.get(user)||0;if(rate>0)baseLabor+=h*rate;else unknownLaborHours+=h;});
    const loadedLabor=baseLabor*(1+settings.laborBurdenPct/100),overhead=revenue*settings.overheadPct/100,recordedCost=expenseCost+loadedLabor+overhead,recordedProfit=revenue-recordedCost,margin=revenue>0?100*recordedProfit/revenue:null;
    const updated=text(val(job,'Updated Time','updatedAt','Created Time'));
    return{job,jobId,title:text(val(job,'Project Title','projectTitle'))||idOf(job,'Job Number','jobNumber')||jobId,status:text(val(job,'Status','status'))||'Open',quoted,invoiced,revenue,expenseCost,hours,baseLabor,loadedLabor,unknownLaborHours,overhead,recordedCost,recordedProfit,margin,updated,complete:unknownLaborHours<=0};
  }).sort((a,b)=>String(b.updated).localeCompare(String(a.updated)));
}
function quoteDecisionScore(){
  const quotes=realRows('quotes');let won=0,lost=0;
  quotes.forEach(row=>{const s=text(val(row,'Customer Decision','customerDecision','Status','status'));if(POSITIVE_QUOTE_RE.test(s))won++;else if(NEGATIVE_QUOTE_RE.test(s))lost++;});
  const decided=won+lost;return{score:decided?100*won/decided:null,note:decided?`${won} won / ${decided} decided`:'Record accepted/declined quote decisions'};
}
function staleOpenJobs(){
  const now=Date.now(),jobs=realRows('jobs').filter(row=>!COMPLETE_JOB_RE.test(text(val(row,'Status','status'))));
  const stale=jobs.filter(row=>{const ts=Date.parse(val(row,'Updated Time','updatedAt','Created Time'));return Number.isFinite(ts)&&now-ts>30*86400000;});
  return{open:jobs.length,stale:stale.length,rows:stale};
}
function cashHealth(){
  const invoices=realRows('invoices'),today=todayIso();let open=0,overdue=0,count=0;
  invoices.forEach(row=>{const balance=Math.max(0,number(val(row,'Balance','balance')));if(balance<=0)return;open+=balance;count++;const due=text(val(row,'Due Date','dueDate')).slice(0,10);if(due&&due<today)overdue+=balance;});
  return{score:invoices.length?(open>0?100*(1-overdue/open):100):null,note:invoices.length?(overdue>0?`${currency(overdue)} overdue of ${currency(open)} open`:'No recorded overdue balance'):'No invoice history',open,overdue,count};
}
function teamHealth(){
  const tasks=realRows('tasks'),times=realRows('timeEntries'),recentCutoff=Date.now()-30*86400000;
  const openTasks=tasks.filter(row=>!COMPLETE_JOB_RE.test(text(val(row,'Status','status'))));
  const assigned=openTasks.filter(row=>idOf(row,'Assigned User ID','assignedUserId')).length;
  const recentTimes=times.filter(row=>{const ts=Date.parse(val(row,'Start Time','startTime','Created Time'));return !Number.isFinite(ts)||ts>=recentCutoff;});
  const linked=recentTimes.filter(row=>idOf(row,'Job ID','jobId')&&number(val(row,'Hours','hours'))>0).length;
  const signals=[];if(openTasks.length)signals.push(100*assigned/openTasks.length);if(recentTimes.length)signals.push(100*linked/recentTimes.length);
  return{score:signals.length?signals.reduce((a,b)=>a+b,0)/signals.length:null,note:signals.length?`${assigned}/${openTasks.length||0} open tasks assigned · ${linked}/${recentTimes.length||0} recent time entries job-linked`:'Need assigned tasks or time records'};
}
function systemsHealth(book){
  const jobs=realRows('jobs'),invoices=realRows('invoices'),quotes=realRows('quotes');
  const jobLinked=jobs.length?100*jobs.filter(row=>idOf(row,'Quote ID','quoteId')).length/jobs.length:null;
  const invoiceLinked=invoices.length?100*invoices.filter(row=>idOf(row,'Job ID','jobId')).length/invoices.length:null;
  let lineCount=0,costed=0,priced=0;
  quotes.slice(0,250).forEach(row=>{let raw=val(row,'lines','Lines'),lines=Array.isArray(raw)?raw:[];if(typeof raw==='string'){try{lines=JSON.parse(raw)||[];}catch(_){}}if(!Array.isArray(lines))return;lines.forEach(line=>{lineCount++;if(lineSellRate(line)>0)priced++;if(matchLineCost(line,book).known)costed++;});});
  const pricing= lineCount?100*priced/lineCount:null,costCoverage=lineCount?100*costed/lineCount:null;
  const scores=[jobLinked,invoiceLinked,pricing,costCoverage].filter(x=>x!=null);return{score:scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:null,note:lineCount?`${Math.round(costCoverage||0)}% quote cost coverage · ${Math.round(jobLinked||0)}% jobs linked to quotes · ${Math.round(invoiceLinked||0)}% invoices linked to jobs`:'Need operational records',costCoverage,lineCount};
}
function profitHealth(backCosts,settings){
  const usable=backCosts.filter(row=>row.revenue>0&&row.margin!=null&&row.complete).slice(0,30);if(!usable.length)return{score:null,note:'Need job-linked time rates and recorded costs'};
  const average=usable.reduce((sum,row)=>sum+row.margin,0)/usable.length;return{score:clamp(100*average/settings.targetMarginPct,0,100),note:`${percent(average)} average recorded margin vs ${settings.targetMarginPct.toFixed(0)}% target`,average};
}
function operationsHealth(stale){return{score:stale.open?100*(1-stale.stale/stale.open):100,note:stale.open?`${stale.stale} stale of ${stale.open} open jobs`:'No open jobs are waiting'};}
function healthModel(backCosts,book,settings){
  const stale=staleOpenJobs(),cash=cashHealth(),team=teamHealth(),systems=systemsHealth(book),profit=profitHealth(backCosts,settings),sales=quoteDecisionScore(),operations=operationsHealth(stale);
  const dimensions=[['Profit',profit],['Sales',sales],['Operations',operations],['Team',team],['Cash',cash],['Systems',systems]].map(([name,data])=>({name,...data}));
  const known=dimensions.filter(d=>d.score!=null),overall=known.length?known.reduce((sum,d)=>sum+d.score,0)/known.length:null;
  return{dimensions,overall,stale,cash,team,systems,profit,sales,operations};
}
function leaksModel(backCosts,health,book,settings){
  const leaks=[];
  const low=backCosts.filter(row=>row.complete&&row.revenue>0&&row.margin!=null&&row.margin<settings.targetMarginPct).sort((a,b)=>a.margin-b.margin);
  if(low.length)leaks.push({level:'bad',title:`${low.length} job${low.length===1?'':'s'} below target recorded margin`,detail:`Lowest: ${low[0].title} at ${percent(low[0].margin)}. Review estimate assumptions, labor and expenses.`});
  if(health.cash.overdue>0)leaks.push({level:'bad',title:`${currency(health.cash.overdue)} in overdue recorded balances`,detail:'Review overdue invoices and record collections. H38 will not contact or charge customers automatically.'});
  if(health.stale.stale>0)leaks.push({level:'warn',title:`${health.stale.stale} stale open job${health.stale.stale===1?'':'s'}`,detail:'Open jobs not updated in 30+ days can hide schedule, billing or closeout problems.'});
  if((health.systems.costCoverage||0)<100&&health.systems.lineCount>0)leaks.push({level:'warn',title:`${Math.round(100-(health.systems.costCoverage||0))}% of sampled quote lines lack exact cost coverage`,detail:'Link quote lines to Price Book items/assemblies before trusting margin forecasts.'});
  const unlinkedExpenses=realRows('expenses').filter(row=>!idOf(row,'Job ID','jobId'));if(unlinkedExpenses.length)leaks.push({level:'warn',title:`${unlinkedExpenses.length} recorded expense${unlinkedExpenses.length===1?'':'s'} not linked to a job`,detail:'Unlinked costs weaken job profitability and pricing lessons.'});
  const missingRates=backCosts.reduce((sum,row)=>sum+row.unknownLaborHours,0);if(missingRates>0)leaks.push({level:'warn',title:`${missingRates.toFixed(1)} labor hour${missingRates===1?'':'s'} missing an employee hourly rate`,detail:'Load employee rates so back-costing can include labor. The burden assumption remains an owner planning value.'});
  if(!leaks.length)leaks.push({level:'online',title:'No major recorded profit leaks detected',detail:'Keep recording job time, expenses, invoices and quote decisions so H38 can keep checking.'});
  return leaks.slice(0,6);
}
const PLAN_ACTIONS=Object.freeze({
  Profit:{title:'Protect margin',action:'Cost every active quote, back-cost completed work weekly, and correct any job type finishing below target margin.',measure:'Measure: recorded margin and quote cost coverage.'},
  Sales:{title:'Learn win/loss',action:'Record accepted and declined decisions on every quote, then review the reasons and follow-up gaps weekly.',measure:'Measure: decided quotes and win rate.'},
  Operations:{title:'Clear operating drag',action:'Give every stale open job a next action or closeout decision and keep job status current.',measure:'Measure: stale open jobs older than 30 days.'},
  Team:{title:'Make labor visible',action:'Link tasks and time to jobs, fill missing employee rates, and review unassigned work weekly.',measure:'Measure: job-linked time and assigned open tasks.'},
  Cash:{title:'Tighten collections',action:'Review overdue invoices weekly, record payments promptly, and keep invoices linked to jobs.',measure:'Measure: overdue balance as a share of open balance.'},
  Systems:{title:'Close the data loop',action:'Connect quote → job → invoice and link quote lines to exact Price Book costs.',measure:'Measure: linkage and cost-coverage percentages.'}
});
function planModel(health){
  const sorted=health.dimensions.slice().sort((a,b)=>(a.score??999)-(b.score??999));
  const picks=[];for(const dim of sorted){if(!picks.includes(dim.name))picks.push(dim.name);if(picks.length===3)break;}while(picks.length<3)picks.push(HEALTH_DIMENSIONS[picks.length]);
  return [30,60,90].map((days,index)=>({days,dimension:picks[index],...PLAN_ACTIONS[picks[index]]}));
}
function healthMarkup(health){
  return `<section class="card h38-profit-card" id="h38BusinessHealth"><div class="row-top"><div><span class="h38-profit-kicker">BUSINESS HEALTH</span><h2>${health.overall==null?'Build the evidence loop':`${health.overall.toFixed(0)}/100 operating signal`}</h2></div>${health.overall==null?'<span class="pill neutral">Needs data</span>':`<span class="pill ${statusClass(health.overall)}">${statusLabel(health.overall)}</span>`}</div><p class="h38-profit-note">Transparent operating signals from recorded H38 data—not a financial statement or hidden AI score.</p><div class="h38-health-grid">${health.dimensions.map(d=>`<div class="h38-health-card"><div class="row-top"><strong>${safe(d.name)}</strong><span class="pill ${statusClass(d.score)}">${statusLabel(d.score)}</span></div><div class="h38-health-score">${d.score==null?'—':d.score.toFixed(0)}</div><small>${safe(d.note)}</small></div>`).join('')}</div></section>`;
}
function backCostMarkup(rows,settings){
  const shown=rows.filter(row=>row.revenue>0||row.expenseCost>0||row.hours>0).slice(0,12);
  return `<section class="card" id="h38BackCosting"><div class="row-top"><div><span class="h38-profit-kicker">JOB BACK-COSTING</span><h2>Quoted vs recorded job economics</h2></div><span class="pill neutral">Recorded costs</span></div><p class="h38-profit-note">Revenue uses invoiced total when available, otherwise quoted revenue. Cost uses job-linked expenses, recorded labor × employee rate × ${1+settings.laborBurdenPct/100} burden factor, plus ${settings.overheadPct}% overhead allowance. Missing rates are flagged.</p><div class="h38-profit-list">${shown.length?shown.map(row=>`<div class="h38-profit-row"><div class="row-top"><strong>${safe(row.title)}</strong><span class="pill ${row.complete&&row.margin!=null&&row.margin>=settings.targetMarginPct?'online':row.complete?'warn':'neutral'}">${row.margin==null?'No revenue':`${percent(row.margin)} recorded margin`}</span></div><small>${safe(row.status)} · quoted ${currency(row.quoted)} · invoiced ${currency(row.invoiced)} · expenses ${currency(row.expenseCost)} · ${row.hours.toFixed(1)} labor hr / ${currency(row.loadedLabor)} loaded labor${row.unknownLaborHours>0?` · ${row.unknownLaborHours.toFixed(1)} hr missing rate`:''}</small></div>`).join(''):'<div class="empty">No real job-linked cost records are available yet.</div>'}</div></section>`;
}
function leaksMarkup(leaks){return `<section class="card" id="h38ProfitLeaks"><div><span class="h38-profit-kicker">PROFIT LEAK DETECTOR</span><h2>What deserves attention</h2></div><div class="h38-profit-list">${leaks.map(leak=>`<div class="h38-profit-row"><div class="row-top"><strong>${safe(leak.title)}</strong><span class="pill ${leak.level}">${leak.level==='online'?'Clear':'Review'}</span></div><small>${safe(leak.detail)}</small></div>`).join('')}</div></section>`;}
function planMarkup(plan){return `<section class="card" id="h38NinetyDayPlan"><div><span class="h38-profit-kicker">90-DAY OWNER PLAN</span><h2>Turn the weakest signals into work</h2></div><p class="h38-profit-note">Recommendations only. H38 does not send messages, change pricing, purchase, pay, schedule, publish, or approve anything automatically.</p><div class="h38-plan-grid">${plan.map(step=>`<div class="h38-plan-step"><span class="pill neutral">Day ${step.days}</span><h3>${safe(step.title)}</h3><p><strong>${safe(step.dimension)}</strong></p><p>${safe(step.action)}</p><small>${safe(step.measure)}</small></div>`).join('')}</div></section>`;}
async function decorateReports(){
  if(!canSeeFinancial())return;injectStyles();const main=document.getElementById('mainContent');if(!main)return;
  ['h38BusinessHealth','h38BackCosting','h38ProfitLeaks','h38NinetyDayPlan'].forEach(id=>main.querySelector(`#${id}`)?.remove());
  const settings=readSettings(),book=await getPriceBook(),backCosts=buildBackCosts(settings),health=healthModel(backCosts,book,settings),leaks=leaksModel(backCosts,health,book,settings),plan=planModel(health);
  const head=main.querySelector('.page-head')||main.firstElementChild;if(!head)return;
  head.insertAdjacentHTML('afterend',healthMarkup(health)+backCostMarkup(backCosts,settings)+leaksMarkup(leaks)+planMarkup(plan));
}
async function decorateToday(){
  if(!canSeeFinancial())return;injectStyles();const main=document.getElementById('mainContent');if(!main||main.querySelector('#h38ProfitabilityToday'))return;
  const settings=readSettings(),book=await getPriceBook(),backCosts=buildBackCosts(settings),health=healthModel(backCosts,book,settings),leaks=leaksModel(backCosts,health,book,settings);
  const card=`<section id="h38ProfitabilityToday" class="h38-profit-mini"><div class="row-top"><div><span class="h38-profit-kicker">PROFITABILITY</span><strong>${health.overall==null?'Build the evidence loop':`${health.overall.toFixed(0)}/100 business health`}</strong></div><span class="pill ${statusClass(health.overall)}">${statusLabel(health.overall)}</span></div><small>${safe(leaks[0]?.title||'No major recorded profit leak detected.')}</small><div class="actions"><button type="button" id="h38OpenProfitabilityReport" class="secondary">Open profitability report</button></div></section>`;
  const grid=main.querySelector('.grid');if(grid)grid.insertAdjacentHTML('beforebegin',card);else (main.querySelector('.page-head')||main.firstElementChild)?.insertAdjacentHTML('afterend',card);
  document.getElementById('h38OpenProfitabilityReport')?.addEventListener('click',()=>{try{if(typeof window.openPage==='function')window.openPage('reports');}catch(_){}});
}
function wrapRenderer(name,decorator,marker){
  const original=window[name];if(typeof original!=='function'||original[marker])return;
  const wrapped=function(){const result=original.apply(this,arguments);Promise.resolve().then(()=>decorator()).catch(error=>console.warn(`[H38 profitability ${name}]`,error?.message||error));return result;};
  wrapped[marker]=true;window[name]=wrapped;try{eval(`${name}=window.${name}`);}catch(_){}
}
function install(){
  injectStyles();
  wrapRenderer('renderQuotes',decorateProfitGuard,'__h38ProfitGuard');
  wrapRenderer('renderReports',decorateReports,'__h38ProfitabilityReports');
  wrapRenderer('renderToday',decorateToday,'__h38ProfitabilityToday');
  window.addEventListener('h38:business-snapshot-updated',()=>{priceBookCache.loadedAt=0;const page=text(app().page);if(page==='quotes')void decorateProfitGuard();else if(page==='reports')void decorateReports();else if(page==='today')void decorateToday();});
  if(text(app().page)==='quotes')void decorateProfitGuard();else if(text(app().page)==='reports')void decorateReports();else if(text(app().page)==='today')void decorateToday();
}

window.H38_PROFITABILITY_OPERATING_LAYER=Object.freeze({
  enabled:true,build:BUILD,healthDimensions:HEALTH_DIMENSIONS.slice(),defaults:{...DEFAULTS},
  ownerActionOnly:true,profitGuard:true,backCosting:true,businessHealth:true,profitLeakDetector:true,ninetyDayPlan:true,
  automaticApproval:false,automaticCustomerSending:false,automaticPurchasing:false,automaticPayment:false,automaticScheduling:false,automaticPublishing:false,
  readSettings,writeSettings,getPriceBook,quoteProfitability,buildBackCosts,healthModel
});

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
