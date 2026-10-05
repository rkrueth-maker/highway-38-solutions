/* H38 Daily Digest + Action Board
 * Rule-based morning briefing for the Today page. Zero AI dependency:
 * everything is computed client-side from existing cached collections.
 * Dismiss/snooze state lives in localStorage, keyed per business.
 */
(function(){
  'use strict';

  const STORE_PREFIX='h38-digest-state-';
  const DAY_MS=86400000;

  function storeKey(){return STORE_PREFIX+(state.businessId||'none');}
  function loadStore(){try{return JSON.parse(localStorage.getItem(storeKey())||'{}');}catch(e){return{};}}
  function saveStore(s){try{localStorage.setItem(storeKey(),JSON.stringify(s));}catch(e){}}
  function isHidden(key){const s=loadStore(),entry=s[key];if(!entry)return false;if(entry==='dismissed')return true;if(entry&&entry.snoozedUntil&&Date.now()<entry.snoozedUntil)return true;return false;}

  function dismiss(key){const s=loadStore();s[key]='dismissed';saveStore(s);rerender();}
  function snooze(key){const s=loadStore();s[key]={snoozedUntil:Date.now()+DAY_MS};saveStore(s);rerender();}
  function rerender(){if(state.page==='today'&&typeof renderToday==='function')renderToday();}

  function greeting(){const h=new Date().getHours();if(h<5)return'Good night';if(h<12)return'Good morning';if(h<18)return'Good afternoon';return'Good evening';}
  function startOfToday(){const d=new Date();d.setHours(0,0,0,0);return d.getTime();}
  function endOfToday(){const d=new Date();d.setHours(23,59,59,999);return d.getTime();}
  function daysAgo(n){return Date.now()-n*DAY_MS;}

  function jobStatus(row){return String(v(row,'Status')||'').toUpperCase();}
  function isOpenJob(row){return !['COMPLETE','CLOSED','CANCELLED'].includes(jobStatus(row));}
  function isCompleteJob(row){return jobStatus(row)==='COMPLETE';}

  /* ---------- data collectors ---------- */

  function todaysEvents(){
    const t0=startOfToday(),t1=endOfToday();
    return records('scheduleEvents').filter(row=>{
      const t=new Date(v(row,'Start Time')).getTime();
      return t>=t0&&t<=t1;
    }).sort((a,b)=>new Date(v(a,'Start Time'))-new Date(v(b,'Start Time')));
  }

  function tomorrowsEvents(){
    const t0=endOfToday()+1,t1=t0+DAY_MS;
    return records('scheduleEvents').filter(row=>{
      const t=new Date(v(row,'Start Time')).getTime();
      return t>=t0&&t<t1;
    });
  }

  function overdueInvoices(){
    const t0=startOfToday();
    return records('invoices').filter(row=>{
      const bal=num(v(row,'Balance'));
      if(!(bal>0.005))return false;
      const due=v(row,'Due Date');
      if(!due)return false;
      return new Date(due).getTime()<t0;
    });
  }

  function dueThisWeekInvoices(){
    const t0=startOfToday(),t1=t0+7*DAY_MS;
    return records('invoices').filter(row=>{
      const bal=num(v(row,'Balance'));
      if(!(bal>0.005))return false;
      const due=v(row,'Due Date');
      if(!due)return false;
      const t=new Date(due).getTime();
      return t>=t0&&t<t1;
    });
  }

  function outstandingTotal(){
    return records('invoices').reduce((s,row)=>s+num(v(row,'Balance')),0);
  }

  function unconfirmedEvents(){
    // Scheduled events in the next 7 days that were never marked confirmed.
    const t0=startOfToday(),t1=t0+7*DAY_MS;
    return records('scheduleEvents').filter(row=>{
      const st=String(v(row,'Status')||'').toUpperCase();
      if(st.includes('CANCEL'))return false;
      if(st.includes('CONFIRM'))return false;
      const t=new Date(v(row,'Start Time')).getTime();
      return t>=t0&&t<t1;
    });
  }

  function jobsNoTime(){
    const logged=new Set(records('timeEntries').map(row=>String(v(row,'Job ID'))));
    return records('jobs').filter(row=>{
      const st=jobStatus(row);
      if(st!=='IN PROGRESS'&&st!=='SCHEDULED')return false;
      return !logged.has(String(v(row,'Job ID')));
    });
  }

  function staleQuotes(){
    const cutoff=daysAgo(3);
    return records('quotes').filter(row=>{
      const st=String(v(row,'Status')||'').toUpperCase();
      if(!/PRESENTED|SENT/.test(st))return false;
      const sent=v(row,'Presented Time')||v(row,'Sent Time')||v(row,'Updated Time');
      if(!sent)return true; // presented but no timestamp — still worth flagging
      return new Date(sent).getTime()<cutoff;
    });
  }

  function lowStockItems(){
    const stock=new Map();
    records('inventoryTransactions').forEach(row=>{
      const id=String(v(row,'Item ID')),qty=Math.abs(num(v(row,'Quantity')));
      const dir=String(v(row,'Direction')).toUpperCase();
      stock.set(id,(stock.get(id)||0)+(dir==='OUT'?-qty:qty));
    });
    return records('priceBook').filter(row=>{
      const reorder=num(v(row,'Reorder Point'));
      if(!(reorder>0))return false;
      return (stock.get(String(v(row,'Item ID')))||0)<=reorder;
    });
  }

  function completedUninvoiced(){
    const invoicedJobIds=new Set(records('invoices').map(row=>String(v(row,'Job ID'))).filter(Boolean));
    return records('jobs').filter(row=>isCompleteJob(row)&&!invoicedJobIds.has(String(v(row,'Job ID'))));
  }

  /* ---------- digest model ---------- */

  function buildDigest(){
    const user=state.snapshot&&state.snapshot.user?state.snapshot.user:{};
    const name=v(user,'Display Name')||v(user,'Email')||'there';
    const bizName=v(state.snapshot&&state.snapshot.business,'Business Name','businessName')||'your business';

    const today=todaysEvents(),tomorrow=tomorrowsEvents();
    const overdue=overdueInvoices(),dueWeek=dueThisWeekInvoices();
    const outstanding=outstandingTotal();

    const risks=[];
    const addRisk=(key,title,detail,page,severity)=>{
      if(isHidden('risk:'+key))return;
      risks.push({key:'risk:'+key,title,detail,page,severity:severity||'warn'});
    };

    if(overdue.length)addRisk('overdue-invoices',
      `${overdue.length} overdue invoice${overdue.length>1?'s':''} — ${money(overdue.reduce((s,r)=>s+num(v(r,'Balance')),0))}`,
      overdue.slice(0,3).map(r=>`${v(r,'Invoice Number')} (${customerName(v(r,'Customer ID'))})`).join(' · ')+(overdue.length>3?` · +${overdue.length-3} more`:''),
      'money','bad');

    const unconf=unconfirmedEvents();
    if(unconf.length)addRisk('unconfirmed',
      `${unconf.length} appointment${unconf.length>1?'s':''} not confirmed`,
      unconf.slice(0,3).map(r=>`${v(r,'Title')} — ${dateTime(v(r,'Start Time'))}`).join(' · ')+(unconf.length>3?` · +${unconf.length-3} more`:''),
      'schedule');

    const noTime=jobsNoTime();
    if(noTime.length)addRisk('no-time',
      `${noTime.length} active job${noTime.length>1?'s':''} with no time logged`,
      noTime.slice(0,3).map(r=>jobName(v(r,'Job ID'))||v(r,'Project Title')).join(' · ')+(noTime.length>3?` · +${noTime.length-3} more`:''),
      'field');

    const stale=staleQuotes();
    if(stale.length)addRisk('stale-quotes',
      `${stale.length} quote${stale.length>1?'s':''} sent 3+ days ago, no follow-up`,
      stale.slice(0,3).map(r=>`${v(r,'Project Title')||'Quote'} — ${money(v(r,'Total'))}`).join(' · ')+(stale.length>3?` · +${stale.length-3} more`:''),
      'quotes');

    const low=lowStockItems();
    if(low.length)addRisk('low-stock',
      `${low.length} item${low.length>1?'s':''} at or below reorder point`,
      low.slice(0,3).map(r=>v(r,'Description')||v(r,'SKU')).join(' · ')+(low.length>3?` · +${low.length-3} more`:''),
      'inventory');

    const uninvoiced=completedUninvoiced();
    if(uninvoiced.length)addRisk('uninvoiced',
      `${uninvoiced.length} completed job${uninvoiced.length>1?'s':''} not yet invoiced`,
      uninvoiced.slice(0,3).map(r=>v(r,'Project Title')).join(' · ')+(uninvoiced.length>3?` · +${uninvoiced.length-3} more`:''),
      'money');

    const actions=[];
    const addAction=(key,label,detail,page)=>{
      if(isHidden('action:'+key))return;
      actions.push({key:'action:'+key,label,detail,page});
    };

    if(tomorrow.length)addAction('confirm-tomorrow',
      `Confirm tomorrow's ${tomorrow.length} appointment${tomorrow.length>1?'s':''}`,
      tomorrow.slice(0,2).map(r=>v(r,'Title')).join(' · '),'schedule');
    stale.slice(0,3).forEach((r,i)=>addAction('followup-quote-'+String(v(r,'Quote ID')||i),
      `Follow up: ${v(r,'Project Title')||'quote'} (${money(v(r,'Total'))})`,
      `Sent to ${customerName(v(r,'Customer ID'))}`,'quotes'));
    uninvoiced.slice(0,3).forEach((r,i)=>addAction('invoice-job-'+String(v(r,'Job ID')||i),
      `Invoice: ${v(r,'Project Title')}`,
      'Completed — ready to bill','money'));
    if(overdue.length)addAction('collect-overdue',
      `Collect ${money(overdue.reduce((s,r)=>s+num(v(r,'Balance')),0))} overdue`,
      `${overdue.length} invoice${overdue.length>1?'s':''} past due`,'money');

    return {name,bizName,today,tomorrow,overdue,dueWeek,outstanding,risks,actions};
  }

  /* ---------- rendering ---------- */

  function riskRow(r){
    return `<div class="row"><div class="row-top"><strong>${esc(r.title)}</strong>${pill(r.severity==='bad'?'Needs attention':'Watch','bad')}</div>`+
      `<small>${esc(r.detail)}</small>`+
      `<div class="row-actions"><button class="secondary" data-open-page="${esc(r.page)}">Open</button>`+
      `<button class="secondary" data-digest-snooze="${esc(r.key)}">Snooze</button>`+
      `<button class="secondary" data-digest-dismiss="${esc(r.key)}">Dismiss</button></div></div>`;
  }

  function actionRow(a){
    return `<div class="row"><div class="row-top"><strong>${esc(a.label)}</strong></div>`+
      `<small>${esc(a.detail)}</small>`+
      `<div class="row-actions"><button data-open-page="${esc(a.page)}">Do it</button>`+
      `<button class="secondary" data-digest-snooze="${esc(a.key)}">Snooze</button>`+
      `<button class="secondary" data-digest-dismiss="${esc(a.key)}">Dismiss</button></div></div>`;
  }

  function renderDigestCard(){
    const d=buildDigest();
    const firstJob=d.today.length?d.today[0]:null;

    const digestHtml=
      `<section class="card span12" id="digestCard"><h2>${esc(greeting())}, ${esc(d.name)}</h2>`+
      `<p class="muted">Here is ${esc(d.bizName)} today, ${esc(new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}))}.</p>`+
      `<div class="stats">`+
      `<div class="stat"><strong>${d.today.length}</strong><span>Jobs today</span></div>`+
      `<div class="stat"><strong>${money(d.outstanding)}</strong><span>Outstanding</span></div>`+
      `<div class="stat"><strong>${d.overdue.length}</strong><span>Overdue invoices</span></div>`+
      `<div class="stat"><strong>${d.dueWeek.length}</strong><span>Due this week</span></div>`+
      `</div>`+
      (firstJob
        ?`<p><strong>First up:</strong> ${esc(v(firstJob,'Title'))} at ${esc(dateTime(v(firstJob,'Start Time')))}${v(firstJob,'Location')?` — ${esc(v(firstJob,'Location'))}`:''}</p>`
        :`<p class="muted">Nothing scheduled today.</p>`)+
      `</section>`;

    const risksHtml=
      `<section class="card span6" id="digestRisks"><h2>Risks</h2><div class="list">`+
      (d.risks.length?d.risks.map(riskRow).join(''):empty('No risks flagged. All clear.'))+
      `</div></section>`;

    const actionsHtml=
      `<section class="card span6" id="digestActions"><h2>Action board</h2><div class="list">`+
      (d.actions.length?d.actions.map(actionRow).join(''):empty('Nothing needs action right now.'))+
      `</div></section>`;

    return digestHtml+risksHtml+actionsHtml;
  }

  function bindDigest(){
    document.querySelectorAll('[data-digest-dismiss]').forEach(b=>{
      b.onclick=e=>{e.stopPropagation();dismiss(b.dataset.digestDismiss);};
    });
    document.querySelectorAll('[data-digest-snooze]').forEach(b=>{
      b.onclick=e=>{e.stopPropagation();snooze(b.dataset.digestSnooze);toast('Snoozed until tomorrow.');};
    });
    document.querySelectorAll('#digestCard [data-open-page],#digestRisks [data-open-page],#digestActions [data-open-page]').forEach(b=>{
      b.onclick=()=>openPage(b.dataset.openPage);
    });
  }

  window.H38DailyDigest={render:renderDigestCard,bind:bindDigest,build:buildDigest,dismiss,snooze};
})();
