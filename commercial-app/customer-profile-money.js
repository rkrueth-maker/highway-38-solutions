/* H38 Customer Profile — Money consolidation (FIX ROUND 2, workstream B)
 * Extends the canonical Customer 360 workspace (customer-360-authority.js):
 * the Money tab gains a Financial Summary, an Aging Summary, an Account
 * Ledger and (on Overview) the customer's Call history, all computed from
 * the same record fields the Money / Accounting surfaces already use.
 *
 * Canonical math — do not fork it:
 * - Open balance + aging come from H38_ACCOUNTING_ENGINE.arAging when the
 *   engine is loaded (Accounting workspace + money-agent use the same call);
 *   the local fallback below mirrors arAging exactly (same balance keys in
 *   the same order, same due-date keys, same bucket thresholds, same
 *   void/delete filter, cents rounding).
 * - Aging rule (the engine's rule): an invoice is aged by its 'Due Date'.
 *   An invoice with NO due date is aged as of today, so it lands in the
 *   Current bucket and is never counted overdue. Buckets: Current
 *   (due today or later / no due date), 1-30, 31-60, 61-90, 90+ days past
 *   due. Overdue balance = open total - Current bucket.
 * - "Removed" invoices follow renderMoney's invoiceRemoved (app-13.js):
 *   status containing DELET or VOID, or Deleted flag true.
 * - Paid revenue = sum of recorded payment 'Amount' values for the
 *   customer (the same field the Money payments list displays).
 * - Payments reach a customer through the Customer 360 bundle graph
 *   (direct 'Customer ID', or via their invoice's customer).
 *
 * Read-only: no sends, no money movement, no deletes, no schema changes.
 * Loaded on demand with the Customers page group (see lead registrations).
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root){root.H38_CUSTOMER_PROFILE_MONEY=api;if(root.document)api.install(root);}
})(typeof window!=='undefined'?window:null,function(){
'use strict';
const BUILD='20261030-r2-customer-profile-money-1';
const LEDGER_RENDER_LIMIT=50;
const CALL_RENDER_LIMIT=25;
const BALANCE_KEYS=['Balance','Balance Due','Open Balance','Amount Due'];
const DUE_KEYS=['Due Date','dueDate'];
const TOTAL_KEYS=['Total','Invoice Total','Amount','total','amount'];
const PAID_KEYS=['Amount','Payment Amount','amount','paymentAmount'];
function text(v){return String(v==null?'':v).trim();}
function value(row,...keys){for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';}
function num(v){const n=Number(String(v==null?'':v).replace(/[$,%]/g,''));return Number.isFinite(n)?n:0;}
function cents(v){return Math.round(num(v)*100);}
function dollars(c){return Math.round(Number(c||0))/100;}
function moneyFmt(n){return Number(n||0).toLocaleString('en-US',{style:'currency',currency:'USD'});}
function dateMs(raw){if(raw===undefined||raw===null||raw==='')return 0;const d=new Date(raw);return Number.isFinite(d.getTime())?d.getTime():0;}
function todayISO(){return new Date().toISOString().slice(0,10);}
function isRemovedInvoice(row){const status=text(value(row,'Status','status')).toUpperCase();return /DELET|VOID/.test(status)||value(row,'Deleted')===true||text(value(row,'Deleted')).toLowerCase()==='true';}
function isVoidPayment(row){return /VOID|CANCEL|DELETED|FAILED/i.test(text(value(row,'Status','status')));}
function invoiceDate(row){return value(row,'Invoice Date','invoiceDate','Date','date','Created Time','createdAt');}
function paymentDate(row){return value(row,'Payment Date','paymentDate','Paid Time','paidAt','Date','date','Created Time','createdAt');}
/* Mirror of accounting-engine aging() — used only when the engine itself is
 * not loaded on this page. Semantics copied 1:1 (see header). */
function ageBucket(days){if(days<=0)return'current';if(days<=30)return'1-30';if(days<=60)return'31-60';if(days<=90)return'61-90';return'90+';}
function daysBetween(asOf,due){const a=new Date(`${asOf}T00:00:00Z`),d=new Date(`${due}T00:00:00Z`);if(Number.isNaN(+a)||Number.isNaN(+d))return 0;return Math.floor((a-d)/86400000);}
function agingMirror(rows,asOf){
  const buckets={'current':0,'1-30':0,'31-60':0,'61-90':0,'90+':0},items=[];
  for(const row of rows||[]){
    if(/void|delet/i.test(text(row&&row.Status!==undefined?row.Status:row&&row.status)))continue;
    let bal=0,found=false;
    for(const k of BALANCE_KEYS){if(row&&row[k]!=null&&row[k]!==''){bal=Number(row[k])||0;found=true;break;}}
    if(!found||bal<=0)continue;
    let due='';for(const k of DUE_KEYS){if(row&&row[k]){due=String(row[k]).slice(0,10);break;}}
    const days=daysBetween(asOf,due||asOf),bucket=ageBucket(days);
    buckets[bucket]=dollars(cents(buckets[bucket])+Math.round(bal*100));
    items.push({row,balance:dollars(Math.round(bal*100)),dueDate:due,daysOverdue:Math.max(0,days),bucket});
  }
  return{asOf,buckets,total:dollarSum(buckets),items:items.sort((a,b)=>b.daysOverdue-a.daysOverdue)};
}
function dollarSum(buckets){return dollars(Object.values(buckets).reduce((s,v)=>s+Math.round(num(v)*100),0));}
function agingFor(invoices,asOf,engine){
  if(engine&&typeof engine.arAging==='function')return engine.arAging(invoices||[],asOf);
  return agingMirror(invoices||[],asOf);
}
function computeProfileMoney(groups,opts){
  const o=opts||{},asOf=o.asOf||todayISO();
  const invoices=Array.isArray(groups&&groups.invoices)?groups.invoices:[];
  const payments=(Array.isArray(groups&&groups.payments)?groups.payments:[]).filter(r=>!isVoidPayment(r));
  const activeInvoices=invoices.filter(r=>!isRemovedInvoice(r));
  const aging=agingFor(invoices,asOf,o.engine||null);
  const openBalance=aging.total;
  const overdueBalance=dollars(Math.round(openBalance*100)-Math.round(num(aging.buckets.current)*100));
  const invoicedCents=activeInvoices.reduce((s,r)=>s+cents(value(r,...TOTAL_KEYS)),0);
  const paidCents=payments.reduce((s,r)=>s+cents(value(r,...PAID_KEYS)),0);
  /* Ledger: invoices debit their Total, payments credit their Amount,
   * chronological with a running balance computed over the full history. */
  const invoiceNumbers=new Map();
  activeInvoices.forEach(r=>{const id=text(value(r,'Invoice ID','invoiceId','id'));if(id)invoiceNumbers.set(id,text(value(r,'Invoice Number','invoiceNumber'))||id);});
  const entries=[];
  activeInvoices.forEach(r=>{
    const raw=invoiceDate(r),time=dateMs(raw);
    entries.push({kind:'invoice',id:text(value(r,'Invoice ID','invoiceId','id')),time,date:text(raw).slice(0,10),label:`Invoice ${text(value(r,'Invoice Number','invoiceNumber'))||text(value(r,'Invoice ID','invoiceId','id'))||''}`.trim(),detail:text(value(r,'Status','status')),debitCents:cents(value(r,...TOTAL_KEYS)),creditCents:0});
  });
  payments.forEach(r=>{
    const raw=paymentDate(r),time=dateMs(raw),invId=text(value(r,'Invoice ID','invoiceId'));
    const invLabel=invId?(invoiceNumbers.get(invId)||invId):'';
    entries.push({kind:'payment',id:text(value(r,'Payment ID','paymentId','id')),time,date:text(raw).slice(0,10),label:'Payment'+(text(value(r,'Method','method'))?` · ${text(value(r,'Method','method'))}`:''),detail:[invLabel?`Invoice ${invLabel}`:'',text(value(r,'Reference','reference'))?`Ref ${text(value(r,'Reference','reference'))}`:''].filter(Boolean).join(' · '),debitCents:0,creditCents:cents(value(r,...PAID_KEYS))});
  });
  entries.sort((a,b)=>a.time-b.time||(a.kind===b.kind?String(a.id).localeCompare(String(b.id)):(a.kind==='invoice'?-1:1)));
  let running=0;
  const ledger=entries.map(e=>{running+=e.debitCents-e.creditCents;return{kind:e.kind,id:e.id,date:e.date,time:e.time,label:e.label,detail:e.detail,debit:dollarC(e.debitCents),credit:dollarC(e.creditCents),balance:dollarC(running)};});
  function dollarC(c){return dollars(c);}
  const openInvoices=aging.items.length;
  const maxDaysOverdue=aging.items.reduce((m,i)=>Math.max(m,i.daysOverdue||0),0);
  return{
    asOf,
    invoicedTotal:dollars(invoicedCents),
    paidTotal:dollars(paidCents),
    openBalance,overdueBalance,
    overdue:overdueBalance>0.005,
    openInvoiceCount:openInvoices,
    maxDaysOverdue,
    aging:{buckets:aging.buckets,total:aging.total,items:aging.items.map(i=>({balance:i.balance,dueDate:i.dueDate,daysOverdue:i.daysOverdue,bucket:i.bucket,number:text(value(i.row,'Invoice Number','invoiceNumber'))||text(value(i.row,'Invoice ID','invoiceId','id'))}))},
    ledger,ledgerTotal:ledger.length,
    counts:{invoices:activeInvoices.length,payments:payments.length}
  };
}
function callHistoryFor(logs,limit){
  const cap=Number(limit)>0?Number(limit):CALL_RENDER_LIMIT;
  return (Array.isArray(logs)?logs:[]).map(row=>{
    const raw=value(row,'Occurred At','occurredAt','Date','date','Created Time','createdAt');
    return{
      id:text(value(row,'Communication Log ID','communicationLogId','id')),
      time:dateMs(raw),date:text(raw),
      channel:text(value(row,'Channel','channel','Type','type'))||'Communication',
      duration:text(value(row,'Duration','duration','Call Duration','callDuration','Duration Seconds')),
      outcome:text(value(row,'Outcome','outcome','Status','status')),
      summary:text(value(row,'Summary','summary','Message','message','Notes','notes','Body','body')),
      title:text(value(row,'Title','title')),
      phone:text(value(row,'Phone','phone'))
    };
  }).sort((a,b)=>b.time-a.time).slice(0,cap);
}
function latestOf(list,dateKeys){
  let best=null,bestTime=-1;
  (list||[]).forEach(r=>{const t=Math.max(0,...dateKeys.map(k=>dateMs(r&&r[k])));if(t>=bestTime){bestTime=t;best=r;}});
  return best?{row:best,time:bestTime}:null;
}
function serviceAddressOf(customer,properties){
  const c=customer||{};
  const street=[value(c,'Service Address','Address'),value(c,'Service Address 2','Address 2')].map(text).filter(Boolean).join(', ');
  const locality=[value(c,'Service City','City'),value(c,'Service State','State'),value(c,'Service ZIP','ZIP')].map(text).filter(Boolean).join(' ');
  const own=[street,locality].filter(Boolean).join(', ');
  if(own)return own;
  const p=(properties||[])[0];
  return p?text(value(p,'Address','address','Service Address')):'';
}
function quickViewFor(customer,groups,compute){
  const g=groups||{};
  const job=latestOf(g.jobs,['Updated Time','updatedAt','Created Time','createdAt','Start Time','startTime']);
  const quote=latestOf(g.quotes,['Updated Time','updatedAt','Created Time','createdAt']);
  const invoice=latestOf((g.invoices||[]).filter(r=>!isRemovedInvoice(r)),['Updated Time','updatedAt','Created Time','createdAt','Invoice Date','invoiceDate']);
  const label=(row,keys,fallback)=>row?text(value(row,...keys))||fallback:'';
  return{
    name:text(value(customer,'Customer Name','name'))||'Customer',
    status:text(value(customer,'Status','status'))||'Active',
    email:text(value(customer,'Email','email')),
    phone:text(value(customer,'Phone','phone','Mobile Phone')),
    address:serviceAddressOf(customer,g.properties),
    openBalance:compute?compute.openBalance:0,
    overdueBalance:compute?compute.overdueBalance:0,
    overdue:!!(compute&&compute.overdue),
    latestJob:job?{label:label(job.row,['Project Title','Title','Job Number'],'Job'),status:text(value(job.row,'Status','status')),time:job.time}:null,
    latestQuote:quote?{label:label(quote.row,['Quote Number','Project Title','Title'],'Quote'),status:text(value(quote.row,'Status','status')),time:quote.time}:null,
    latestInvoice:invoice?{label:label(invoice.row,['Invoice Number'],'Invoice'),status:text(value(invoice.row,'Status','status')),total:num(value(invoice.row,...TOTAL_KEYS)),time:invoice.time}:null
  };
}

/* ---------------- Browser layer ---------------- */
function install(root){
  if(api.installed)return api;api.installed=true;
  const doc=root.document;
  const esc=v=>typeof root.esc==='function'?root.esc(v):text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const snap=()=>root.state&&root.state.snapshot?root.state.snapshot:{};
  const engine=()=>root.H38_ACCOUNTING_ENGINE||null;
  function ensureStyle(){
    if(doc.querySelector('link[data-h38-customer-profile-money]'))return;
    const link=doc.createElement('link');link.rel='stylesheet';
    link.href=`./customer-profile-money.css?build=${BUILD}`;
    link.dataset.h38CustomerProfileMoney='1';doc.head.appendChild(link);
  }
  function fmtDate(iso){const t=dateMs(iso);if(!t)return text(iso).slice(0,10)||'—';return new Date(t).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
  function fmtDateTime(iso){const t=dateMs(iso);if(!t)return'—';return new Date(t).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});}
  function moneySectionHtml(m){
    const b=m.aging.buckets;
    const bucketCell=(label,val,hot)=>`<div class="h38-pm-aging-cell${hot&&val>0?' is-overdue':''}"><strong>${esc(moneyFmt(val))}</strong><span>${esc(label)}</span></div>`;
    const ledgerRows=m.ledger.slice(-LEDGER_RENDER_LIMIT).reverse();
    return `<div class="h38-pm-stats">
      <div><strong>${esc(moneyFmt(m.paidTotal))}</strong><span>Total revenue (paid)</span></div>
      <div><strong>${esc(moneyFmt(m.openBalance))}</strong><span>Open balance</span></div>
      <div class="${m.overdue?'is-overdue':''}"><strong>${esc(moneyFmt(m.overdueBalance))}</strong><span>Overdue${m.overdue?` · up to ${m.maxDaysOverdue} day${m.maxDaysOverdue===1?'':'s'}`:''}</span></div>
      <div><strong>${esc(moneyFmt(m.invoicedTotal))}</strong><span>Invoiced (${m.counts.invoices})</span></div>
    </div>
    <h4 class="h38-pm-subhead">Aging summary <span class="h38-pm-asof">as of ${esc(m.asOf)}</span></h4>
    ${m.openInvoiceCount?`<div class="h38-pm-aging">${bucketCell('Current',b.current,false)}${bucketCell('1–30 days',b['1-30'],true)}${bucketCell('31–60 days',b['31-60'],true)}${bucketCell('61–90 days',b['61-90'],true)}${bucketCell('90+ days',b['90+'],true)}</div><p class="muted small">Aged by due date. Invoices without a due date count as Current. Open total ${esc(moneyFmt(m.aging.total))} across ${m.openInvoiceCount} open invoice${m.openInvoiceCount===1?'':'s'}.</p>`:'<p class="muted small">No open invoices — nothing is aging.</p>'}
    <h4 class="h38-pm-subhead">Account ledger</h4>
    ${ledgerRows.length?`<div class="h38-pm-ledger" role="table" aria-label="Account ledger"><div class="h38-pm-ledger-row h38-pm-ledger-head" role="row"><span>Date</span><span>Item</span><span class="num">Debit</span><span class="num">Credit</span><span class="num">Balance</span></div>${ledgerRows.map(e=>`<div class="h38-pm-ledger-row" role="row"><span>${esc(fmtDate(e.date))}</span><span><strong>${esc(e.label)}</strong>${e.detail?`<small>${esc(e.detail)}</small>`:''}</span><span class="num">${e.debit?esc(moneyFmt(e.debit)):''}</span><span class="num">${e.credit?esc(moneyFmt(e.credit)):''}</span><span class="num">${esc(moneyFmt(e.balance))}</span></div>`).join('')}</div>${m.ledgerTotal>LEDGER_RENDER_LIMIT?`<p class="muted small">Showing the latest ${LEDGER_RENDER_LIMIT} of ${m.ledgerTotal} ledger entries. The balance column is computed over the full history.</p>`:''}`:'<p class="muted small">No invoices or payments recorded for this customer yet.</p>'}`;
  }
  function callSectionHtml(calls){
    return `<h3>Call history</h3>${calls.length?`<div class="h38-pm-calls">${calls.map(c=>`<div class="h38-pm-call"><div class="h38-pm-call-top"><strong>${esc(c.title||c.channel)}</strong><span>${esc(fmtDateTime(c.date))}</span></div><small>${esc([c.channel,c.duration?`Duration ${c.duration}`:'',c.outcome,c.phone].filter(Boolean).join(' · '))}</small>${c.summary?`<p>${esc(c.summary)}</p>`:''}</div>`).join('')}</div>`:'<p class="muted small">No calls recorded for this customer yet.</p>'}`;
  }
  function enhance(){
    try{
      if(!root.state||root.state.page!=='customers')return;
      const c360=root.H38_CUSTOMER_360;if(!c360||typeof c360.customerBundle!=='function')return;
      if(c360.canViewMoney&&!c360.canViewMoney(root.state))return;
      const workspace=doc.querySelector('.h38-c360-workspace');if(!workspace)return;
      const customerId=text(c360.selectedCustomerId);if(!customerId)return;
      ensureStyle();
      const bundle=c360.customerBundle(snap(),customerId);
      if(!bundle||!bundle.customer)return;
      const m=computeProfileMoney(bundle.groups||{},{engine:engine()});
      const calls=callHistoryFor((bundle.groups||{}).communicationLogs);
      const signature=[customerId,m.counts.invoices,m.counts.payments,m.invoicedTotal,m.paidTotal,m.openBalance,calls.length,(bundle.groups.communicationLogs||[]).length].join('|');
      const moneyPanel=workspace.querySelector('[data-c360-panel="money"]');
      if(moneyPanel){
        let section=moneyPanel.querySelector('[data-h38-profile-money]');
        if(!section||section.dataset.signature!==signature){
          if(!section){section=doc.createElement('section');section.className='card h38-pm';section.dataset.h38ProfileMoney='1';}
          section.dataset.signature=signature;
          section.innerHTML=`<h3>Customer money</h3><p class="muted small">Financial summary, aging and ledger for this customer, from the same invoice and payment records as the Money view.</p>${moneySectionHtml(m)}`;
          const legacy=moneyPanel.querySelector('.h38-c360-balance');
          if(legacy)legacy.remove();
          moneyPanel.prepend(section);
        }
      }
      const overviewPanel=workspace.querySelector('[data-c360-panel="overview"]');
      if(overviewPanel){
        let callCard=overviewPanel.querySelector('[data-h38-profile-calls]');
        if(!callCard||callCard.dataset.signature!==signature){
          if(!callCard){callCard=doc.createElement('section');callCard.className='card h38-pm-calls-card';callCard.dataset.h38ProfileCalls='1';}
          callCard.dataset.signature=signature;
          callCard.innerHTML=callSectionHtml(calls);
          overviewPanel.appendChild(callCard);
        }
      }
    }catch(error){
      try{
        const panel=doc.querySelector('.h38-c360-workspace [data-c360-panel="money"]');
        if(panel&&!panel.querySelector('[data-h38-profile-money-error]')){
          const card=doc.createElement('section');card.className='card';card.dataset.h38ProfileMoneyError='1';
          card.innerHTML=`<h3>Customer money</h3><p class="muted small">The money summary could not be calculated for this customer (${esc(error&&error.message||String(error))}). The rest of the profile is unaffected.</p>`;
          panel.prepend(card);
        }
      }catch(_){}
      console.warn('[H38 Customer Profile Money]',error);
    }
  }
  function scheduleEnhance(){setTimeout(enhance,0);}
  /* Quick view */
  function closeQuickView(){doc.querySelector('[data-h38-quickview]')?.remove();doc.removeEventListener('keydown',onQuickViewKey,true);}
  function onQuickViewKey(event){if(event.key==='Escape')closeQuickView();}
  function openQuickView(customerId){
    const c360=root.H38_CUSTOMER_360;if(!c360||typeof c360.customerBundle!=='function')return false;
    const bundle=c360.customerBundle(snap(),customerId);
    if(!bundle||!bundle.customer)return false;
    const m=computeProfileMoney(bundle.groups||{},{engine:engine()});
    const q=quickViewFor(bundle.customer,bundle.groups||{},m);
    closeQuickView();
    const wrap=doc.createElement('div');wrap.className='h38-qv-backdrop';wrap.dataset.h38Quickview='1';
    const latestLine=(label,item,extra)=>item?`<div class="h38-qv-latest"><span>${esc(label)}</span><strong>${esc(item.label)}</strong><small>${esc([item.status,item.time?fmtDate(item.time):'',extra||''].filter(Boolean).join(' · '))}</small></div>`:`<div class="h38-qv-latest"><span>${esc(label)}</span><strong>None yet</strong><small></small></div>`;
    wrap.innerHTML=`<div class="h38-qv-card" role="dialog" aria-modal="true" aria-label="Customer quick view">
      <div class="h38-qv-head"><div><span class="h38-qv-kicker">QUICK VIEW</span><h3>${esc(q.name)}</h3></div><span class="pill">${esc(q.status)}</span><button type="button" class="secondary h38-qv-close" data-h38-qv-close aria-label="Close quick view">✕</button></div>
      <div class="h38-qv-contact">${[q.email,q.phone,q.address].filter(Boolean).map(v=>`<span>${esc(v)}</span>`).join('')||'<span class="muted">No contact details saved.</span>'}</div>
      <div class="h38-qv-money"><div><strong>${esc(moneyFmt(q.openBalance))}</strong><span>Open balance</span></div><div class="${q.overdue?'is-overdue':''}"><strong>${q.overdue?esc(moneyFmt(q.overdueBalance))+' overdue':'Nothing overdue'}</strong><span>${q.overdue?'Needs follow-up':'Account current'}</span></div></div>
      <div class="h38-qv-latest-list">${latestLine('Latest job',q.latestJob)}${latestLine('Latest quote',q.latestQuote)}${latestLine('Latest invoice',q.latestInvoice,q.latestInvoice?moneyFmt(q.latestInvoice.total):'')}</div>
      <div class="h38-qv-actions"><button type="button" data-h38-qv-profile>View Profile</button><button type="button" class="secondary" data-h38-qv-close>Close</button></div>
    </div>`;
    wrap.addEventListener('click',event=>{if(event.target===wrap)closeQuickView();});
    wrap.querySelectorAll('[data-h38-qv-close]').forEach(b=>b.addEventListener('click',closeQuickView));
    wrap.querySelector('[data-h38-qv-profile]').addEventListener('click',()=>{
      closeQuickView();
      c360.selectedCustomerId=customerId;c360.selectedTab='overview';
      if(typeof c360.renderNow==='function')c360.renderNow(root);else if(typeof root.renderCustomers==='function')root.renderCustomers();
      setTimeout(()=>{doc.querySelector('.h38-c360-detail')?.scrollIntoView({behavior:'smooth',block:'start'});},50);
    });
    doc.body.appendChild(wrap);
    doc.addEventListener('keydown',onQuickViewKey,true);
    wrap.querySelector('[data-h38-qv-profile]')?.focus();
    return true;
  }
  function onListClick(event){
    if(!root.state||root.state.page!=='customers')return;
    const target=event.target;
    if(!target||typeof target.closest!=='function')return;
    if(target.closest('[data-h38-quickview]'))return;
    const card=target.closest('[data-h38-customer-card],[data-customer-card]');
    if(!card)return;
    /* Inner interactive elements keep their own behavior. */
    const inner=target.closest('button,a,input,select,textarea,[role="button"]');
    if(inner&&inner!==card)return;
    const id=text(card.dataset.h38CustomerCard||card.dataset.customerCard);
    if(!id)return;
    event.preventDefault();event.stopPropagation();
    openQuickView(id);
  }
  doc.addEventListener('click',onListClick,true);
  function patchRender(){
    const current=root.renderCustomers;
    if(typeof current!=='function'||current.__h38ProfileMoney)return;
    const wrapped=function(){const result=current.apply(this,arguments);scheduleEnhance();return result;};
    wrapped.__h38ProfileMoney=true;wrapped.__h38ProfileMoneyBase=current;
    root.renderCustomers=wrapped;
  }
  patchRender();
  root.addEventListener&&root.addEventListener('h38:business-snapshot-updated',()=>{patchRender();scheduleEnhance();});
  root.addEventListener&&root.addEventListener('h38:office-page-rendered',scheduleEnhance);
  let ticks=0;const timer=setInterval(()=>{patchRender();if(root.state&&root.state.page==='customers')scheduleEnhance();if(++ticks>40)clearInterval(timer);},250);
  api.enhance=enhance;api.openQuickView=openQuickView;api.closeQuickView=closeQuickView;
  return api;
}
const api={BUILD,LEDGER_RENDER_LIMIT,CALL_RENDER_LIMIT,computeProfileMoney,callHistoryFor,quickViewFor,agingFor,isRemovedInvoice,install,installed:false,automaticCustomerSending:false,automaticApproval:false,automaticPayment:false,automaticMoneyMovement:false};
return api;
});
