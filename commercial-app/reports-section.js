/* H38 Office — Reports Section (v1.0)
 * Operational business reports generated from Office records:
 * Profit & Loss, Revenue by Customer, Outstanding Invoices (Aging),
 * Quote Win/Loss, Labor Summary, Year-End Tax Summary.
 * Manual-first, no AI. Date-range picker, print-friendly, CSV export.
 * Replaces the basic renderReports in app-19.js with the full version.
 */
(function(){
  'use strict';
  if(typeof window==='undefined'||typeof document==='undefined')return;
  const BUILD='20261011-reports-section-1';

  // ---------- helpers (match Office conventions) ----------
  const $=id=>document.getElementById(id);
  const t=v=>String(v==null?'':v).trim();
  const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0;};
  const esc=v=>t(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n(v));
  const day=v=>t(v).slice(0,10);
  const rows=name=>Array.isArray(window.state?.snapshot?.[name])?window.state.snapshot[name]:[];
  const rec=(row,...keys)=>{for(const k of keys)if(t(row?.[k]))return t(row[k]);return '';};
  const recN=(row,...keys)=>{for(const k of keys){const x=Number(row?.[k]);if(Number.isFinite(x))return x;}return 0;};
  const inRange=(value,start,end)=>{const d=day(value);if(!d)return false;return(!start||d>=start)&&(!end||d<=end);};
  const notVoid=row=>!/VOID|DELET/i.test(t(rec(row,'Status')));
  const businessName=()=>t(window.state?.snapshot?.business?.['Business Name']||window.state?.snapshot?.business?.businessName||'Your business');

  // ---------- date ranges ----------
  function rangeFor(preset,customStart,customEnd){
    const now=new Date(),y=now.getFullYear(),m=now.getMonth();
    const iso=d=>d.toISOString().slice(0,10);
    const first=m2=>new Date(y,m2,1), last=m2=>new Date(y,m2+1,0);
    switch(preset){
      case 'this-month': return {start:iso(first(m)),end:iso(last(m)),label:'This month'};
      case 'last-month':{const lm=m===0?11:m-1,ly=m===0?y-1:y;return{start:new Date(ly,lm,1).toISOString().slice(0,10),end:new Date(ly,lm+1,0).toISOString().slice(0,10),label:'Last month'};}
      case 'this-quarter':{const q=Math.floor(m/3);return{start:iso(first(q*3)),end:iso(last(q*3+2)),label:'This quarter'};}
      case 'this-year': return {start:`${y}-01-01`,end:`${y}-12-31`,label:'This year'};
      case 'last-year': return {start:`${y-1}-01-01`,end:`${y-1}-12-31`,label:'Last year'};
      case 'custom': return {start:customStart||'',end:customEnd||'',label:'Custom range'};
      default: return {start:iso(first(m)),end:iso(last(m)),label:'This month'};
    }
  }

  // ---------- state ----------
  const S={tab:'pl',preset:'this-month',start:'',end:'',label:''};
  function currentRange(){
    const r=rangeFor(S.preset,S.start,S.end);
    return {start:r.start||S.start,end:r.end||S.end,label:r.label};
  }

  // ---------- report data builders ----------
  function plData(start,end){
    const inv=rows('invoices').filter(r=>inRange(rec(r,'Invoice Date','Created Time'),start,end)&&notVoid(r));
    const pay=rows('payments').filter(r=>inRange(rec(r,'Payment Date','Created Time'),start,end)&&notVoid(r));
    const exp=rows('expenses').filter(r=>inRange(rec(r,'Expense Date','Created Time'),start,end));
    const payroll=rows('payrollPeriods').filter(r=>inRange(rec(r,'Pay Date','Period End','Created Time'),start,end));
    const revenue=pay.reduce((s,r)=>s+recN(r,'Amount'),0);
    const invoiced=inv.reduce((s,r)=>s+recN(r,'Total'),0);
    const expenses=exp.reduce((s,r)=>s+recN(r,'Amount')+recN(r,'Tax'),0);
    const labor=payroll.reduce((s,r)=>s+recN(r,'Gross Pay'),0);
    const net=revenue-expenses-labor;
    // expenses by category
    const cats={};
    exp.forEach(r=>{const c=rec(r,'Category')||'Uncategorized';cats[c]=(cats[c]||0)+recN(r,'Amount')+recN(r,'Tax');});
    const catRows=Object.entries(cats).sort((a,b)=>b[1]-a[1]);
    return {revenue,invoiced,expenses,labor,net,catRows,invCount:inv.length,payCount:pay.length,expCount:exp.length};
  }

  function revenueByCustomer(start,end){
    const customers=rows('customers');
    const name=id=>{const c=customers.find(r=>t(rec(r,'Customer ID'))===t(id));return rec(c,'Customer Name')||'Unknown customer';};
    const pay=rows('payments').filter(r=>inRange(rec(r,'Payment Date','Created Time'),start,end)&&notVoid(r));
    const per={};
    pay.forEach(r=>{
      const inv=rows('invoices').find(i=>t(rec(i,'Invoice ID'))===t(rec(r,'Invoice ID')));
      const cid=rec(inv,'Customer ID')||rec(r,'Customer ID')||'unknown';
      per[cid]=per[cid]||{name:name(cid),total:0,count:0};
      per[cid].total+=recN(r,'Amount');per[cid].count++;
    });
    return Object.values(per).sort((a,b)=>b.total-a.total);
  }

  function arAging(){
    const today=new Date().toISOString().slice(0,10);
    const inv=rows('invoices').filter(r=>notVoid(r)&&recN(r,'Balance')>0);
    const customers=rows('customers');
    const name=id=>{const c=customers.find(r=>t(rec(r,'Customer ID'))===t(id));return rec(c,'Customer Name')||'—';};
    const buckets={'0-30':[],'31-60':[],'61-90':[],'90+':[]};
    inv.forEach(r=>{
      const due=day(rec(r,'Due Date'))||day(rec(r,'Invoice Date','Created Time'));
      const daysDue=due?Math.floor((new Date(today)-new Date(due))/86400000):0;
      const b=daysDue<=30?'0-30':daysDue<=60?'31-60':daysDue<=90?'61-90':'90+';
      buckets[b].push({number:rec(r,'Invoice Number')||rec(r,'Invoice ID'),customer:name(rec(r,'Customer ID')),due:due||'—',balance:recN(r,'Balance'),total:recN(r,'Total')});
    });
    const totals={};for(const k in buckets)totals[k]=buckets[k].reduce((s,x)=>s+x.balance,0);
    return {buckets,totals,grand:Object.values(totals).reduce((a,b)=>a+b,0)};
  }

  function winLoss(start,end){
    const quotes=rows('quotes').filter(r=>inRange(rec(r,'Created Time'),start,end));
    const won=quotes.filter(r=>/accept|approve|won/i.test(rec(r,'Status')));
    const lost=quotes.filter(r=>/declin|lost|reject|cancel/i.test(rec(r,'Status')));
    const pending=quotes.filter(r=>!/accept|approve|won|declin|lost|reject|cancel/i.test(rec(r,'Status')));
    const sent=won.length+lost.length;
    const rate=sent?Math.round(won.length/sent*100):0;
    const wonValue=won.reduce((s,r)=>s+recN(r,'Total'),0);
    const lostValue=lost.reduce((s,r)=>s+recN(r,'Total'),0);
    const pendingValue=pending.reduce((s,r)=>s+recN(r,'Total'),0);
    return {total:quotes.length,won:won.length,lost:lost.length,pending:pending.length,rate,wonValue,lostValue,pendingValue,
      detail:quotes.map(r=>({title:rec(r,'Project Title')||'Untitled quote',number:rec(r,'Quote Number')||rec(r,'Quote ID'),status:rec(r,'Status')||'Draft',total:recN(r,'Total')})).slice(0,100)};
  }

  function laborSummary(start,end){
    const time=rows('timeEntries').filter(r=>inRange(rec(r,'Start Time','Created Time'),start,end));
    const users=rows('users'),employees=rows('employees');
    const name=id=>{
      const u=users.find(r=>t(rec(r,'User ID'))===t(id))||employees.find(r=>t(rec(r,'Employee ID'))===t(id));
      return rec(u,'Display Name','Employee Name','Email')||'Unknown';
    };
    const per={};
    time.forEach(r=>{
      const id=rec(r,'User ID')||rec(r,'Employee ID')||'unknown';
      const h=recN(r,'Hours')||recN(r,'Regular Hours')+recN(r,'Overtime Hours');
      per[id]=per[id]||{name:name(id),hours:0,entries:0};
      per[id].hours+=h;per[id].entries++;
    });
    const list=Object.values(per).sort((a,b)=>b.hours-a.hours);
    const totalHours=list.reduce((s,x)=>s+x.hours,0);
    return {list,totalHours,entryCount:time.length};
  }

  function taxSummary(year){
    const start=`${year}-01-01`,end=`${year}-12-31`;
    const pl=plData(start,end);
    const exp=rows('expenses').filter(r=>inRange(rec(r,'Expense Date','Created Time'),start,end));
    const cats={};
    exp.forEach(r=>{const c=rec(r,'Category')||'Uncategorized';cats[c]=(cats[c]||0)+recN(r,'Amount')+recN(r,'Tax');});
    const catRows=Object.entries(cats).sort((a,b)=>b[1]-a[1]);
    const mileage=rows('mileageLog').filter(r=>inRange(rec(r,'Date','Created Time'),start,end));
    const miles=mileage.reduce((s,r)=>s+recN(r,'Miles','Distance'),0);
    const subs=rows('subcontractorPayments').filter(r=>inRange(rec(r,'Payment Date','Created Time'),start,end));
    const subTotal=subs.reduce((s,r)=>s+recN(r,'Amount'),0);
    return {...pl,catRows,year,miles,subTotal,subCount:subs.length};
  }

  // ---------- CSV export ----------
  function downloadCSV(filename,headers,rowsArr){
    const q=v=>`"${String(v??'').replace(/"/g,'""')}"`;
    const csv=[headers.map(q).join(','),...rowsArr.map(r=>r.map(q).join(','))].join('\r\n');
    const blob=new Blob([csv],{type:'text/csv'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download=filename;
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),5000);
    window.toast?.('Report downloaded as CSV.');
  }

  // ---------- print ----------
  function printReport(){
    const el=$('h38-reports-print');
    if(!el){window.toast?.('Nothing to print yet.',true);return;}
    const w=window.open('','_blank','width=900,height=700');
    if(!w){window.toast?.('Allow pop-ups to open the printable report.',true);return;}
    const r=currentRange();
    w.document.write(`<!doctype html><html><head><title>Report — ${esc(r.label)}</title><style>
      body{font:14px/1.5 system-ui,-apple-system,sans-serif;margin:32px;max-width:900px;color:#111}
      h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:24px 0 8px;border-bottom:2px solid #111;padding-bottom:4px}
      .meta{color:#555;margin-bottom:16px}table{width:100%;border-collapse:collapse;margin:8px 0}
      th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #ddd}
      th{background:#f3f4f6;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
      td.num,th.num{text-align:right}.total td{font-weight:700;border-top:2px solid #111}
      .stats{display:flex;gap:24px;flex-wrap:wrap;margin:12px 0}
      .stats div strong{display:block;font-size:20px}.stats div span{font-size:12px;color:#555}
      .foot{margin-top:32px;color:#777;font-size:12px;border-top:1px solid #ddd;padding-top:12px}
    </style></head><body>
    <h1>${esc(businessName())}</h1><div class="meta">${esc(S.reportTitle||'Business report')} · ${esc(r.label)}${r.start&&r.end?` (${esc(r.start)} to ${esc(r.end)})`:''} · Prepared ${esc(new Date().toLocaleDateString())}</div>
    ${el.innerHTML}
    <div class="foot">Prepared from H38 Office records. Review with your accountant before filing or making tax decisions.</div>
    </body></html>`);
    w.document.close();w.focus();
    setTimeout(()=>w.print(),300);
  }

  // ---------- render helpers ----------
  function stat(label,value){return `<div class="stat"><strong>${value}</strong><span>${esc(label)}</span></div>`;}
  function table(headers,rowsHtml,footHtml){
    return `<div class="h38-report-table-wrap"><table class="h38-report-table"><thead><tr>${headers.map(h=>`<th class="${/amount|total|balance|hours|rate|value/i.test(h)?'num':''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rowsHtml||'<tr><td colspan="99" class="muted">No records for this period.</td></tr>'}</tbody>${footHtml?`<tfoot>${footHtml}</tfoot>`:''}</table></div>`;
  }
  function numCell(v){return `<td class="num">${money(v)}</td>`;}

  // ---------- tab bodies ----------
  function bodyPL(r){
    const d=plData(r.start,r.end);
    S.reportTitle='Profit & Loss';
    const html=`
    <div class="stats">
      ${stat('Money in (payments)',money(d.revenue))}
      ${stat('Expenses',money(d.expenses))}
      ${stat('Payroll gross',money(d.labor))}
      ${stat('Net',money(d.net))}
    </div>
    ${table(['Line','Amount'],`
      <tr><td>Payments received</td>${numCell(d.revenue)}</tr>
      <tr><td>Invoices sent (billed)</td>${numCell(d.invoiced)}</tr>
      <tr><td>Expenses</td>${numCell(-d.expenses)}</tr>
      <tr><td>Payroll</td>${numCell(-d.labor)}</tr>`,
      `<tr class="total"><td>Net</td>${numCell(d.net)}</tr>`)}
    <h3>Expenses by category</h3>
    ${table(['Category','Amount'],d.catRows.map(([c,v])=>`<tr><td>${esc(c)}</td>${numCell(v)}</tr>`).join(''))}`;
    return {html,csv:()=>downloadCSV(`profit-loss-${r.start}-to-${r.end}.csv`,
      ['Line','Amount'],
      [['Payments received',d.revenue.toFixed(2)],['Invoices sent',d.invoiced.toFixed(2)],['Expenses',(-d.expenses).toFixed(2)],['Payroll',(-d.labor).toFixed(2)],['Net',d.net.toFixed(2)],
       [],['Expenses by category',''],...d.catRows.map(([c,v])=>[c,v.toFixed(2)])])};
  }

  function bodyRevenue(r){
    const list=revenueByCustomer(r.start,r.end);
    const total=list.reduce((s,x)=>s+x.total,0);
    S.reportTitle='Revenue by Customer';
    const html=`
    <div class="stats">${stat('Total received',money(total))}${stat('Paying customers',String(list.length))}</div>
    ${table(['Customer','Payments','Total'],list.map(x=>`<tr><td>${esc(x.name)}</td><td class="num">${x.count}</td>${numCell(x.total)}</tr>`).join(''),
      `<tr class="total"><td>Total</td><td class="num">${list.reduce((s,x)=>s+x.count,0)}</td>${numCell(total)}</tr>`)}`;
    return {html,csv:()=>downloadCSV(`revenue-by-customer-${r.start}-to-${r.end}.csv`,
      ['Customer','Payments','Total'],[...list.map(x=>[x.name,x.count,x.total.toFixed(2)]),['Total',list.reduce((s,x)=>s+x.count,0),total.toFixed(2)]])};
  }

  function bodyAR(){
    const d=arAging();
    S.reportTitle='Outstanding Invoices — Aging';
    const labels={'0-30':'0–30 days','31-60':'31–60 days','61-90':'61–90 days','90+':'Over 90 days'};
    const order=['0-30','31-60','61-90','90+'];
    const html=`
    <div class="stats">${stat('Total outstanding',money(d.grand))}${stat('Open invoices',String(order.reduce((s,k)=>s+d.buckets[k].length,0)))}</div>
    ${order.map(k=>`
      <h3>${labels[k]} — ${money(d.totals[k])}</h3>
      ${table(['Invoice','Customer','Due','Balance'],d.buckets[k].map(x=>`<tr><td>${esc(x.number)}</td><td>${esc(x.customer)}</td><td>${esc(x.due)}</td>${numCell(x.balance)}</tr>`).join(''))}`).join('')}`;
    return {html,csv:()=>downloadCSV(`ar-aging-${new Date().toISOString().slice(0,10)}.csv`,
      ['Bucket','Invoice','Customer','Due','Balance'],
      order.flatMap(k=>d.buckets[k].map(x=>[labels[k],x.number,x.customer,x.due,x.balance.toFixed(2)])))};
  }

  function bodyWinLoss(r){
    const d=winLoss(r.start,r.end);
    S.reportTitle='Quote Win / Loss';
    const html=`
    <div class="stats">
      ${stat('Quotes',String(d.total))}
      ${stat('Won',String(d.won))}
      ${stat('Win rate',d.rate+'%')}
      ${stat('Won value',money(d.wonValue))}
      ${stat('Lost value',money(d.lostValue))}
      ${stat('Pending value',money(d.pendingValue))}
    </div>
    ${table(['Quote','Number','Status','Total'],d.detail.map(x=>`<tr><td>${esc(x.title)}</td><td>${esc(x.number)}</td><td>${esc(x.status)}</td>${numCell(x.total)}</tr>`).join(''))}`;
    return {html,csv:()=>downloadCSV(`quote-win-loss-${r.start}-to-${r.end}.csv`,
      ['Quote','Number','Status','Total'],d.detail.map(x=>[x.title,x.number,x.status,x.total.toFixed(2)]))};
  }

  function bodyLabor(r){
    const d=laborSummary(r.start,r.end);
    S.reportTitle='Labor Summary';
    const html=`
    <div class="stats">${stat('Total hours',d.totalHours.toFixed(1))}${stat('Time entries',String(d.entryCount))}${stat('People',String(d.list.length))}</div>
    ${table(['Person','Entries','Hours'],d.list.map(x=>`<tr><td>${esc(x.name)}</td><td class="num">${x.entries}</td><td class="num">${x.hours.toFixed(1)}</td></tr>`).join(''),
      `<tr class="total"><td>Total</td><td class="num">${d.entryCount}</td><td class="num">${d.totalHours.toFixed(1)}</td></tr>`)}`;
    return {html,csv:()=>downloadCSV(`labor-summary-${r.start}-to-${r.end}.csv`,
      ['Person','Entries','Hours'],[...d.list.map(x=>[x.name,x.entries,x.hours.toFixed(1)]),['Total',d.entryCount,d.totalHours.toFixed(1)]])};
  }

  function bodyTax(){
    const year=new Date().getFullYear();
    const d=taxSummary(year);
    S.reportTitle=`Year-End Tax Summary ${year}`;
    const html=`
    <div class="notice"><strong>For your accountant.</strong> Review these numbers together before filing. The Office does not file tax returns.</div>
    <div class="stats">
      ${stat('Revenue (payments)',money(d.revenue))}
      ${stat('Expenses',money(d.expenses))}
      ${stat('Payroll',money(d.labor))}
      ${stat('Net',money(d.net))}
    </div>
    <h3>Expenses by category</h3>
    ${table(['Category','Amount'],d.catRows.map(([c,v])=>`<tr><td>${esc(c)}</td>${numCell(v)}</tr>`).join(''))}
    <h3>Other tax items</h3>
    ${table(['Item','Value'],`
      <tr><td>Business miles driven</td><td class="num">${d.miles.toFixed(1)}</td></tr>
      <tr><td>Subcontractor payments (${d.subCount})</td>${numCell(d.subTotal)}</tr>
      <tr><td>Invoices sent (billed, may include unpaid)</td>${numCell(d.invoiced)}</tr>`)}`;
    return {html,csv:()=>downloadCSV(`tax-summary-${year}.csv`,
      ['Item','Value'],
      [['Revenue (payments)',d.revenue.toFixed(2)],['Expenses',d.expenses.toFixed(2)],['Payroll',d.labor.toFixed(2)],['Net',d.net.toFixed(2)],
       [],['Expenses by category',''],...d.catRows.map(([c,v])=>[c,v.toFixed(2)]),
       [],['Business miles',d.miles.toFixed(1)],['Subcontractor payments',d.subTotal.toFixed(2)]])};
  }

  // mutable slot for the active tab's CSV exporter (kept outside the frozen export)
  let currentCsv=null;
  const TABS=[
    {id:'pl',label:'Profit & Loss'},
    {id:'revenue',label:'Revenue by Customer'},
    {id:'ar',label:'Aging'},
    {id:'winloss',label:'Win / Loss'},
    {id:'labor',label:'Labor'},
    {id:'tax',label:'Tax Summary'},
  ];

  function render(){
    const r=currentRange();
    const builders={pl:()=>bodyPL(r),revenue:()=>bodyRevenue(r),ar:()=>bodyAR(),winloss:()=>bodyWinLoss(r),labor:()=>bodyLabor(r),tax:()=>bodyTax()};
    let built;
    try{built=builders[S.tab]();}catch(e){built={html:`<div class="notice warn"><strong>Report failed to load:</strong> ${esc(e.message||e)}</div>`,csv:null};}
    currentCsv=built.csv;
    const main=$('mainContent');
    if(!main)return;
    main.innerHTML=(typeof window.pageHead==='function'?window.pageHead('Reports','Plain-language summaries from your Office records. Nothing here files anything or moves money.'):'<h1>Reports</h1>')+`
    <style>
      .h38-rep-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
      .h38-rep-tabs button{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:8px 14px;font-size:14px;cursor:pointer}
      .h38-rep-tabs button.active{background:#0f172a;color:#fff;border-color:#0f172a}
      .h38-rep-range{display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin:4px 0 12px}
      .h38-rep-range label{display:grid;gap:2px;font-size:13px}
      .h38-rep-range select,.h38-rep-range input{padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px}
      .h38-report-table-wrap{overflow-x:auto;margin:8px 0}
      table.h38-report-table{width:100%;border-collapse:collapse;min-width:480px}
      table.h38-report-table th,table.h38-report-table td{padding:9px 10px;border-bottom:1px solid #e2e8f0;text-align:left;font-size:14px}
      table.h38-report-table th{background:#f8fafc;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#475569}
      table.h38-report-table td.num,table.h38-report-table th.num{text-align:right;font-variant-numeric:tabular-nums}
      table.h38-report-table tfoot td{font-weight:700;border-top:2px solid #0f172a}
      #h38-reports-print h3{margin:20px 0 6px;font-size:16px}
      .h38-rep-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      @media(max-width:640px){
        .h38-rep-tabs button{font-size:13px;padding:7px 11px}
        table.h38-report-table th,table.h38-report-table td{padding:7px 8px;font-size:13px}
      }
    </style>
    <div class="grid"><section class="card span12">
      <div class="h38-rep-tabs" role="tablist">${TABS.map(x=>`<button type="button" role="tab" data-rep-tab="${x.id}" class="${S.tab===x.id?'active':''}" aria-selected="${S.tab===x.id}">${esc(x.label)}</button>`).join('')}</div>
      <div class="h38-rep-range">
        <label>Period
          <select id="h38-rep-preset">
            <option value="this-month"${S.preset==='this-month'?' selected':''}>This month</option>
            <option value="last-month"${S.preset==='last-month'?' selected':''}>Last month</option>
            <option value="this-quarter"${S.preset==='this-quarter'?' selected':''}>This quarter</option>
            <option value="this-year"${S.preset==='this-year'?' selected':''}>This year</option>
            <option value="last-year"${S.preset==='last-year'?' selected':''}>Last year</option>
            <option value="custom"${S.preset==='custom'?' selected':''}>Custom</option>
          </select>
        </label>
        <label style="${S.preset==='custom'?'':'display:none'}" id="h38-rep-custom-start-wrap">Start <input type="date" id="h38-rep-start" value="${esc(S.start)}"></label>
        <label style="${S.preset==='custom'?'':'display:none'}" id="h38-rep-custom-end-wrap">End <input type="date" id="h38-rep-end" value="${esc(S.end)}"></label>
        <span class="muted small" style="align-self:center">${esc(r.label)}${r.start&&r.end?`: ${esc(r.start)} → ${esc(r.end)}`:''}</span>
      </div>
      <div id="h38-reports-print">${built.html}</div>
      <div class="h38-rep-actions">
        <button type="button" id="h38-rep-print">🖨 Print</button>
        <button type="button" class="secondary" id="h38-rep-csv">⬇ Download CSV</button>
      </div>
      <p class="muted small" style="margin-top:10px">Built live from this business's Office records. Estimates only — review with your accountant before tax filing.</p>
    </section></div>`;
    // wire tabs
    main.querySelectorAll('[data-rep-tab]').forEach(b=>b.onclick=()=>{S.tab=b.dataset.repTab;render();});
    // wire preset
    const preset=$('h38-rep-preset');
    preset.onchange=()=>{
      S.preset=preset.value;
      if(S.preset!=='custom'){render();}
      else{
        $('h38-rep-custom-start-wrap').style.display='';
        $('h38-rep-custom-end-wrap').style.display='';
        const r2=rangeFor('this-month');S.start=r2.start;S.end=r2.end;
        $('h38-rep-start').value=S.start;$('h38-rep-end').value=S.end;render();
      }
    };
    const cs=$('h38-rep-start'),ce=$('h38-rep-end');
    if(cs)cs.onchange=()=>{S.start=cs.value;render();};
    if(ce)ce.onchange=()=>{S.end=ce.value;render();};
    $('h38-rep-print').onclick=printReport;
    $('h38-rep-csv').onclick=()=>{const f=currentCsv;if(typeof f==='function')f();else window.toast?.('Nothing to download yet.',true);};
  }

  // ---------- override ----------
  // app-19.js defines a global renderReports; app-02.js resolves it per render call,
  // so replacing the global is enough. Also expose for app-19's parity path.
  try{renderReports=render;}catch(e){window.renderReports=render;}
  window.H38ReportsSection=Object.freeze({enabled:true,build:BUILD,render,printReport});
})();
