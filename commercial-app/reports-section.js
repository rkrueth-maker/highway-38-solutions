/* H38 Office — Reports Section (WS3 report library, 2026-10-20)
 * The 8-report library (spec §5.3):
 *   R1 Profit & Loss (ledger)        R5 Job costing / profitability
 *   R2 Balance sheet summary         R6 Payroll summary
 *   R3 AR aging (engine buckets)     R7 Sales tax summary
 *   R4 Sales by customer (accrual)   R8 Expenses by category
 * Ledger reports read accountingTransactions normalized exactly like the
 * Accounting workspace, so R1/R2 tie to the Accounting page by construction;
 * every report prints its range, date field, and tie-out/gap notes instead
 * of hiding differences. The old cash-mixed P&L is kept, relabeled
 * "Cash snapshot (operational)". Quote Win/Loss + Labor Summary remain as
 * operational extras. Manual-first, no AI. Nothing here files or pays.
 */
(function(){
  'use strict';
  if(typeof window==='undefined'||typeof document==='undefined')return;
  const BUILD='20261021-data-limit-2';

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
      case 'last-quarter':{const q=Math.floor(m/3);const lq=q===0?3:q-1,ly=q===0?y-1:y;return{start:new Date(ly,lq*3,1).toISOString().slice(0,10),end:new Date(ly,lq*3+3,0).toISOString().slice(0,10),label:'Last quarter'};}
      case 'this-year': return {start:`${y}-01-01`,end:`${y}-12-31`,label:'YTD'};
      case 'last-year': return {start:`${y-1}-01-01`,end:`${y-1}-12-31`,label:'Last year'};
      case 'custom': return {start:customStart||'',end:customEnd||'',label:'Custom range'};
      case 'all': return {start:'',end:'',label:'All dates'};
      default: return {start:iso(first(m)),end:iso(last(m)),label:'This month'};
    }
  }

  // ---------- state ----------
  const S={tab:'pl',preset:'this-month',start:'',end:'',label:''};
  function currentRange(){
    // 'All dates' is the no-range state: empty start/end, which inRange()
    // treats as unbounded — the same representation a blank Custom range uses.
    if(S.preset==='all')return {start:'',end:'',label:'All dates'};
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

  /* R3 aging now comes from the accounting engine (spec §5.3): buckets
   * current/1-30/31-60/61-90/90+ by Due Date as of the range end — the same
   * math as the Accounting page. The old reports-only bucket logic
   * (0-30 from Invoice Date) is retired. */
  function arAging(start,end){
    const asOf=end||new Date().toISOString().slice(0,10);
    const inv=rows('invoices').filter(r=>notVoid(r)&&recN(r,'Balance')>0);
    const customers=rows('customers');
    const name=id=>{const c=customers.find(r=>t(rec(r,'Customer ID'))===t(id));return rec(c,'Customer Name')||'—';};
    const A=window.H38_ACCOUNTING_ENGINE;
    const buckets={'current':[],'1-30':[],'31-60':[],'61-90':[],'90+':[]};
    if(A){
      const aged=A.arAging(inv,asOf);
      aged.items.forEach(it=>{
        buckets[it.bucket].push({number:rec(it.row,'Invoice Number')||rec(it.row,'Invoice ID'),customer:name(rec(it.row,'Customer ID')),due:it.dueDate||'—',balance:it.balance,total:recN(it.row,'Total')});
      });
      const totals={};for(const k in buckets)totals[k]=buckets[k].reduce((s,x)=>s+x.balance,0);
      return {buckets,totals,grand:aged.total,asOf};
    }
    // Engine unavailable (loader group not run): no aging rather than wrong aging.
    return {buckets,totals:{current:0,'1-30':0,'31-60':0,'61-90':0,'90+':0},grand:0,asOf,engineMissing:true};
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
    const mileage=rows('mileageEntries').filter(r=>inRange(rec(r,'Trip Date','Date','Created Time'),start,end));
    const miles=mileage.reduce((s,r)=>s+recN(r,'Miles','Distance'),0);
    const subs=rows('subcontractorPayments').filter(r=>inRange(rec(r,'Payment Date','Created Time'),start,end));
    const subTotal=subs.reduce((s,r)=>s+recN(r,'Amount'),0);
    return {...pl,catRows,year,miles,subTotal,subCount:subs.length};
  }

  // ---------- WS3 ledger helpers (R1/R2/R8) ----------
  // Normalized exactly as accounting-workspace.js accountingData() does, so
  // the ledger reports tie to the Accounting page by construction.
  function ledgerTxs(){
    return rows('accountingTransactions').map(r=>({id:rec(r,'Transaction ID')||t(r.id),businessId:t(window.state?.businessId),
      date:day(rec(r,'Transaction Date','date')),type:rec(r,'Transaction Type','type'),sourceType:rec(r,'Source Type','sourceType'),
      sourceId:rec(r,'Source ID','sourceId'),memo:rec(r,'Memo','memo'),status:rec(r,'Status','status')||'Posted',
      lines:Array.isArray(r.Lines)?r.Lines:(Array.isArray(r.lines)?r.lines:[])}))
      .filter(x=>x.id&&x.date&&x.lines.length>=2);
  }
  function engineOrNull(){return window.H38_ACCOUNTING_ENGINE||null;}

  // ---------- R4: Sales by customer (accrual) ----------
  function salesByCustomer(start,end){
    const customers=rows('customers');
    const name=id=>{const c=customers.find(r=>t(rec(r,'Customer ID'))===t(id));return rec(c,'Customer Name')||'Unknown customer';};
    const inv=rows('invoices').filter(r=>inRange(rec(r,'Invoice Date','Created Time'),start,end)&&notVoid(r));
    const invById=new Map(inv.map(r=>[t(rec(r,'Invoice ID')),r]));
    const allInvById=new Map(rows('invoices').map(r=>[t(rec(r,'Invoice ID')),r]));
    const per={};
    const ensure=cid=>per[cid]||(per[cid]={id:cid,name:name(cid),invoiced:0,tax:0,collected:0,openStored:0,count:0});
    inv.forEach(r=>{const p=ensure(rec(r,'Customer ID')||'unknown');p.invoiced+=recN(r,'Total');p.tax+=recN(r,'Tax','Tax Amount');p.count++;});
    rows('payments').filter(r=>inRange(rec(r,'Payment Date','Created Time'),start,end)&&notVoid(r)).forEach(pay=>{
      const linked=allInvById.get(t(rec(pay,'Invoice ID')));
      const cid=rec(linked,'Customer ID')||rec(pay,'Customer ID');if(!cid)return;
      ensure(cid).collected+=recN(pay,'Amount');
    });
    // Stored-Balance cross-check (all dates — Balance is a current field).
    rows('invoices').filter(r=>notVoid(r)).forEach(r=>{const p=per[rec(r,'Customer ID')];if(p)p.openStored+=recN(r,'Balance');});
    const list=Object.values(per).map(p=>({...p,open:p.invoiced-p.collected})).sort((a,b)=>b.invoiced-a.invoiced);
    return {list,invoicedTotal:list.reduce((s,x)=>s+x.invoiced,0),collectedTotal:list.reduce((s,x)=>s+x.collected,0)};
  }

  // ---------- R6: Payroll summary ----------
  function payrollSummary(start,end){
    const periods=new Map(rows('payrollPeriods').map(p=>[t(rec(p,'Payroll Period ID')),p]));
    const lines=rows('payrollLines').filter(l=>{
      const run=periods.get(t(rec(l,'Payroll Period ID')));
      return run&&['Finalized','Posted'].includes(t(rec(run,'Status')))&&inRange(rec(l,'Pay Date'),start,end);
    });
    const employees=rows('employees');
    const name=id=>{const e=employees.find(r=>t(rec(r,'Employee ID'))===t(id));return rec(e,'Display Name')||id||'Unknown';};
    const per={};
    lines.forEach(l=>{
      const id=rec(l,'Employee ID')||'unknown';
      const p=per[id]||(per[id]={name:name(id),hours:0,gross:0,federal:0,fica:0,state:0,deductions:0,net:0,employerTax:0,cost:0,runs:0});
      p.hours+=recN(l,'Regular Hours')+recN(l,'Overtime Hours');p.gross+=recN(l,'Gross Pay');
      p.federal+=recN(l,'Federal Withholding');p.fica+=recN(l,'Social Security')+recN(l,'Medicare')+recN(l,'Additional Medicare');
      p.state+=recN(l,'State Withholding');p.deductions+=recN(l,'Total Deductions');p.net+=recN(l,'Net Pay');
      p.employerTax+=recN(l,'Employer Tax Estimate');p.cost+=recN(l,'Employer Cost Estimate');p.runs++;
    });
    const list=Object.values(per).sort((a,b)=>b.gross-a.gross);
    const runsUsed=Array.from(new Set(lines.map(l=>t(rec(l,'Payroll Period ID'))))).map(id=>periods.get(id)).filter(Boolean)
      .map(p=>({id:rec(p,'Payroll Period ID'),payDate:day(rec(p,'Pay Date')),status:t(rec(p,'Status')),gross:recN(p,'Gross Pay'),net:recN(p,'Net Pay'),ledger:rec(p,'Ledger Transaction ID')||'—'}));
    const tot=list.reduce((s,x)=>({gross:s.gross+x.gross,net:s.net+x.net,federal:s.federal+x.federal,fica:s.fica+x.fica,state:s.state+x.state,deductions:s.deductions+x.deductions,employerTax:s.employerTax+x.employerTax,cost:s.cost+x.cost}),{gross:0,net:0,federal:0,fica:0,state:0,deductions:0,employerTax:0,cost:0});
    return {list,tot,runsUsed,lineCount:lines.length};
  }

  // ---------- R7: Sales tax summary ----------
  function salesTaxSummary(start,end){
    const inv=rows('invoices').filter(r=>inRange(rec(r,'Invoice Date','Created Time'),start,end)&&notVoid(r));
    const per={};
    inv.forEach(r=>{
      const jur=rec(r,'Tax Jurisdiction','Jurisdiction','Sales Tax Jurisdiction')||'Unassigned';
      const p=per[jur]||(per[jur]={jurisdiction:jur,taxable:0,collected:0,count:0});
      const tax=recN(r,'Tax','Tax Amount');
      if(tax>0)p.taxable+=recN(r,'Subtotal');
      p.collected+=tax;p.count++;
    });
    const collectedView=Object.values(per).sort((a,b)=>b.collected-a.collected);
    const prepared=rows('taxPeriods').filter(r=>inRange(rec(r,'Period Start'),start,end)||inRange(rec(r,'Period End'),start,end))
      .map(r=>({jurisdiction:rec(r,'Jurisdiction')||'—',start:day(rec(r,'Period Start')),end:day(rec(r,'Period End')),
        taxable:recN(r,'Taxable Sales'),collected:recN(r,'Tax Collected'),adjustments:recN(r,'Tax Adjustments'),
        liability:recN(r,'Estimated Liability'),paid:recN(r,'Payment Recorded')}));
    // Reconcile each prepared period against the collected view for ITS range.
    const diffs=prepared.map(p=>{
      const inP=inv.filter(r=>inRange(rec(r,'Invoice Date','Created Time'),p.start,p.end));
      const viewCollected=inP.reduce((s,r)=>s+recN(r,'Tax','Tax Amount'),0);
      return {...p,viewCollected,diff:Math.round((viewCollected-p.collected)*100)/100};
    }).filter(d=>Math.abs(d.diff)>0.005);
    return {collectedView,prepared,diffs,collectedTotal:collectedView.reduce((s,x)=>s+x.collected,0)};
  }

  // ---------- R8: Expenses by category ----------
  function expensesByCategory(start,end){
    const exp=rows('expenses').filter(r=>inRange(rec(r,'Expense Date','Created Time'),start,end));
    const cats={};
    exp.forEach(r=>{const c=rec(r,'Category')||'Uncategorized';const p=cats[c]||(cats[c]={category:c,total:0,count:0,rows:[]});
      const amt=recN(r,'Amount')+recN(r,'Tax');p.total+=amt;p.count++;
      p.rows.push({date:day(rec(r,'Expense Date','Created Time')),payee:rec(r,'Vendor','Payee','Vendor Name'),desc:rec(r,'Description','Memo'),job:rec(r,'Job ID'),amount:amt});});
    const list=Object.values(cats).sort((a,b)=>b.total-a.total);
    const total=list.reduce((s,x)=>s+x.total,0);
    list.forEach(p=>p.pct=total?Math.round(p.total/total*1000)/10:0);
    // Ledger comparison: only expenses that reached the GL (autopost is off
    // by design) — the gap is printed, never hidden.
    let ledgerTotal=null;const A=engineOrNull();
    if(A){try{const tx=ledgerTxs().filter(x=>inRange(x.date,start,end));
      ledgerTotal=A.trialBalance(tx,rows('accountingAccounts')).filter(r=>['cogs','expense'].includes(r.account.type)).reduce((s,r)=>s+r.balance,0);
      ledgerTotal=Math.round(ledgerTotal*100)/100;}catch(e){ledgerTotal=null;}}
    return {list,total,count:exp.length,ledgerTotal};
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
  // ---------- R1: Profit & Loss (ledger) ----------
  function bodyLedgerPL(r){
    S.reportTitle='Profit & Loss (ledger)';
    const A=engineOrNull();
    if(!A)return {html:`<div class="notice warn"><strong>Ledger unavailable.</strong> The accounting engine did not load, so the ledger P&L cannot be computed. The Cash snapshot tab still works from operational records.</div>`,csv:null};
    const tx=ledgerTxs().filter(x=>inRange(x.date,r.start,r.end));
    let pnl,detail=[];
    try{pnl=A.profitAndLoss(tx,rows('accountingAccounts'));detail=A.trialBalance(tx,rows('accountingAccounts'));}catch(e){return {html:`<div class="notice warn"><strong>P&L failed:</strong> ${esc(e.message||e)}</div>`,csv:null};}
    const byType=type=>detail.filter(x=>x.account.type===type);
    const section=(title,rowsList)=>rowsList.length?`<h3>${esc(title)}</h3>${table(['Account','Amount'],rowsList.map(x=>`<tr><td>${esc(x.account.code)} — ${esc(x.account.name)}</td>${numCell(x.balance)}</tr>`).join(''))}`:'';
    const html=`
    <p class="muted small">Source: general ledger (accountingTransactions), <strong>Transaction Date</strong> in range · ${tx.length} transactions. This is the same ledger the Accounting page reads — net income here must equal the Accounting page P&L card and the Balance Sheet current earnings for the same range.</p>
    <div class="stats">
      ${stat('Income',money(pnl.income))}${stat('Direct job costs (COGS)',money(pnl.cogs))}${stat('Gross profit',money(pnl.grossProfit))}
      ${stat('Operating expenses',money(pnl.operatingExpenses))}${stat('Net income',money(pnl.netIncome))}
    </div>
    ${section('Income',[...byType('income'),...byType('other-income')])}
    ${section('Cost of goods sold',byType('cogs'))}
    ${section('Operating expenses',[...byType('expense'),...byType('other-expense')])}
    ${table(['Line','Amount'],`
      <tr><td>Income</td>${numCell(pnl.income)}</tr>
      <tr><td>Cost of goods sold</td>${numCell(-pnl.cogs)}</tr>
      <tr><td>Operating expenses</td>${numCell(-pnl.operatingExpenses)}</tr>
      <tr><td>Other income / (expense)</td>${numCell(pnl.otherIncome-pnl.otherExpense)}</tr>`,
      `<tr class="total"><td>Net income</td>${numCell(pnl.netIncome)}</tr>`)}`;
    return {html,csv:()=>downloadCSV(`profit-loss-ledger-${r.start}-to-${r.end}.csv`,
      ['Account','Type','Amount'],
      [...detail.map(x=>[`${x.account.code} — ${x.account.name}`,x.account.type,x.balance.toFixed(2)]),['Net income','',pnl.netIncome.toFixed(2)]])};
  }

  // ---------- R2: Balance sheet summary (point-in-time at range end) ----------
  function bodyBalanceSheet(r){
    S.reportTitle='Balance Sheet';
    const A=engineOrNull();
    if(!A)return {html:`<div class="notice warn"><strong>Ledger unavailable.</strong> The accounting engine did not load.</div>`,csv:null};
    const end=r.end||new Date().toISOString().slice(0,10);
    const tx=ledgerTxs().filter(x=>!end||x.date<=end);
    let bs,detail=[];
    try{bs=A.balanceSheet(tx,rows('accountingAccounts'));detail=A.trialBalance(tx,rows('accountingAccounts'));}catch(e){return {html:`<div class="notice warn"><strong>Balance sheet failed:</strong> ${esc(e.message||e)}</div>`,csv:null};}
    const byType=type=>detail.filter(x=>x.account.type===type);
    const section=(title,rowsList)=>rowsList.length?`<h3>${esc(title)}</h3>${table(['Account','Balance'],rowsList.map(x=>`<tr><td>${esc(x.account.code)} — ${esc(x.account.name)}</td>${numCell(x.balance)}</tr>`).join(''))}`:'';
    const html=`
    <p class="muted small">Point-in-time: all ledger activity <strong>on or before ${esc(end)}</strong> (the range start is ignored for this report). Check: assets − liabilities − equity must be $0.00.</p>
    <div class="stats">
      ${stat('Assets',money(bs.assets))}${stat('Liabilities',money(bs.liabilities))}${stat('Equity incl. current earnings',money(bs.equity))}
      ${stat('Balance difference (must be 0)',money(bs.difference))}
    </div>
    ${bs.difference===0?'<div class="notice"><strong>Balanced ✓</strong> — assets equal liabilities + equity.</div>':`<div class="notice warn"><strong>Out of balance by ${money(bs.difference)}.</strong> Review the ledger before relying on these numbers.</div>`}
    ${section('Assets',byType('asset'))}${section('Liabilities',byType('liability'))}${section('Equity',byType('equity'))}
    <p class="muted small">Current earnings (${money(bs.retainedCurrentEarnings)}) are included in equity above. The Accounts Receivable line ties to the AR Aging grand total when the range end is today.</p>`;
    return {html,csv:()=>downloadCSV(`balance-sheet-${end}.csv`,
      ['Account','Type','Balance'],
      [...detail.map(x=>[`${x.account.code} — ${x.account.name}`,x.account.type,x.balance.toFixed(2)]),['Assets','',bs.assets.toFixed(2)],['Liabilities','',bs.liabilities.toFixed(2)],['Equity (incl. earnings)','',bs.equity.toFixed(2)],['Difference','',bs.difference.toFixed(2)]])};
  }

  // ---------- R4 body ----------
  function bodySales(r){
    const d=salesByCustomer(r.start,r.end);
    S.reportTitle='Sales by Customer';
    const A=engineOrNull();let ledgerIncome=null;
    if(A){try{ledgerIncome=A.profitAndLoss(ledgerTxs().filter(x=>inRange(x.date,r.start,r.end)),rows('accountingAccounts')).income;}catch(e){}}
    const diff=ledgerIncome==null?null:Math.round((d.invoicedTotal-ledgerIncome)*100)/100;
    const html=`
    <p class="muted small">Accrual view: invoices by <strong>Invoice Date</strong> in range (${d.list.reduce((s,x)=>s+x.count,0)} invoices). “Open (stored)” cross-checks each customer's stored invoice Balance — differences against invoiced − collected are listed, not hidden.</p>
    <div class="stats">${stat('Invoiced',money(d.invoicedTotal))}${stat('Collected',money(d.collectedTotal))}${stat('Customers',String(d.list.length))}</div>
    ${ledgerIncome==null?'':`<p class="muted small">Tie-out: invoiced ${money(d.invoicedTotal)} vs ledger income (R1) ${money(ledgerIncome)} — difference ${money(diff)} is revenue posted to the ledger outside invoices (or invoices not yet posted).</p>`}
    ${table(['Customer','Invoiced','Tax','Collected','Open (invoiced − collected)','Open (stored Balance)'],d.list.map(x=>`<tr><td>${esc(x.name)}</td>${numCell(x.invoiced)}${numCell(x.tax)}${numCell(x.collected)}${numCell(x.open)}${numCell(x.openStored)}${Math.abs(x.open-x.openStored)>0.005?' <span class="pill warn">Δ</span>':''}</tr>`).join(''),
      `<tr class="total"><td>Total</td>${numCell(d.invoicedTotal)}<td></td>${numCell(d.collectedTotal)}<td></td><td></td></tr>`)}`;
    return {html,csv:()=>downloadCSV(`sales-by-customer-${r.start}-to-${r.end}.csv`,
      ['Customer','Invoiced','Tax','Collected','Open (calc)','Open (stored)'],
      d.list.map(x=>[x.name,x.invoiced.toFixed(2),x.tax.toFixed(2),x.collected.toFixed(2),x.open.toFixed(2),x.openStored.toFixed(2)]))};
  }

  // ---------- R5 body: Job costing ----------
  function bodyJobs(r){
    S.reportTitle='Job Costing / Profitability';
    const OPS=window.H38_ACCOUNTING_OPERATIONS;
    if(!OPS)return {html:`<div class="notice warn"><strong>Job costing unavailable.</strong> The accounting operations module did not load.</div>`,csv:null};
    const jobs=rows('jobs');
    const mileageRows=rows('mileageEntries').length?rows('mileageEntries'):rows('mileage');
    const data={timeEntries:rows('timeEntries'),expenses:rows('expenses'),vendorBills:rows('vendorBills'),purchaseOrders:rows('purchaseOrders'),mileage:mileageRows,invoices:rows('invoices'),payments:rows('payments')};
    const out=[];
    jobs.forEach(j=>{
      const jid=rec(j,'Job ID')||t(j.id);if(!jid)return;
      let jc;try{jc=OPS.jobCost(jid,data);}catch(e){return;}
      if(!jc.invoicedRevenue&&!jc.cost&&!jc.collectedRevenue)return;
      out.push({job:rec(j,'Project Title')||rec(j,'Job Number')||jid,id:jid,...jc});
    });
    out.sort((a,b)=>b.grossProfit-a.grossProfit);
    const tot=out.reduce((s,x)=>({rev:s.rev+x.invoicedRevenue,cost:s.cost+x.cost,gp:s.gp+x.grossProfit}),{rev:0,cost:0,gp:0});
    const html=`
    <p class="muted small">Per-job revenue and cost from records linked by <strong>Job ID</strong> (all dates in the snapshot; range does not filter job costing in v1). Jobs with costs but no invoice — and invoices with no costs — are shown, not dropped.</p>
    <div class="stats">${stat('Invoiced',money(tot.rev))}${stat('Total cost',money(tot.cost))}${stat('Gross profit',money(tot.gp))}${stat('Jobs',String(out.length))}</div>
    ${table(['Job','Invoiced','Collected','Cost','Gross profit','Margin'],out.map(x=>`<tr><td>${esc(x.job)}</td>${numCell(x.invoicedRevenue)}${numCell(x.collectedRevenue)}${numCell(x.cost)}${numCell(x.grossProfit)}<td class="num">${Math.round(x.grossMargin*1000)/10}%</td></tr>`).join(''),
      `<tr class="total"><td>Total</td>${numCell(tot.rev)}<td></td>${numCell(tot.cost)}${numCell(tot.gp)}<td></td></tr>`)}
    <p class="muted small">Rate note: job costing prices labor at each time entry's <strong>Hourly Cost</strong>, while payroll pays the employee's pay rate — totals across all jobs will differ from payroll job allocations for that reason. Verify one job by hand-summing its linked records.</p>`;
    return {html,csv:()=>downloadCSV(`job-costing.csv`,
      ['Job','Job ID','Invoiced','Collected','Cost','Gross profit','Margin %'],
      out.map(x=>[x.job,x.id,x.invoicedRevenue.toFixed(2),x.collectedRevenue.toFixed(2),x.cost.toFixed(2),x.grossProfit.toFixed(2),(Math.round(x.grossMargin*1000)/10).toFixed(1)]))};
  }

  // ---------- R6 body: Payroll summary ----------
  function bodyPayroll(r){
    const d=payrollSummary(r.start,r.end);
    S.reportTitle='Payroll Summary';
    const html=`
    <p class="muted small">Source: payroll lines on runs with Status <strong>Finalized or Posted</strong> only (Draft/Reviewed excluded), by <strong>Pay Date</strong> in range · ${d.lineCount} lines. Period totals must equal the run headers' stored totals; Posted runs must also equal their GL-PAYROLL ledger entry.</p>
    <div class="stats">${stat('Gross',money(d.tot.gross))}${stat('Net',money(d.tot.net))}${stat('Employer taxes',money(d.tot.employerTax))}${stat('Employer cost',money(d.tot.cost))}</div>
    ${table(['Employee','Hours','Gross','Federal','FICA','State','Deductions','Net','Employer cost'],d.list.map(x=>`<tr><td>${esc(x.name)}</td><td class="num">${x.hours.toFixed(2)}</td>${numCell(x.gross)}${numCell(x.federal)}${numCell(x.fica)}${numCell(x.state)}${numCell(x.deductions)}${numCell(x.net)}${numCell(x.cost)}</tr>`).join(''),
      `<tr class="total"><td>Total</td><td></td>${numCell(d.tot.gross)}${numCell(d.tot.federal)}${numCell(d.tot.fica)}${numCell(d.tot.state)}${numCell(d.tot.deductions)}${numCell(d.tot.net)}${numCell(d.tot.cost)}</tr>`)}
    <h3>Runs included</h3>
    ${table(['Run','Pay date','Status','Gross','Net','Ledger entry'],d.runsUsed.map(x=>`<tr><td>${esc(x.id)}</td><td>${esc(x.payDate)}</td><td>${esc(x.status)}</td>${numCell(x.gross)}${numCell(x.net)}<td>${esc(x.ledger)}</td></tr>`).join(''))}`;
    return {html,csv:()=>downloadCSV(`payroll-summary-${r.start}-to-${r.end}.csv`,
      ['Employee','Hours','Gross','Federal','FICA','State','Deductions','Net','Employer cost'],
      d.list.map(x=>[x.name,x.hours.toFixed(2),x.gross.toFixed(2),x.federal.toFixed(2),x.fica.toFixed(2),x.state.toFixed(2),x.deductions.toFixed(2),x.net.toFixed(2),x.cost.toFixed(2)]))};
  }

  // ---------- R7 body: Sales tax ----------
  function bodySalesTax(r){
    const d=salesTaxSummary(r.start,r.end);
    S.reportTitle='Sales Tax Summary';
    const html=`
    <div class="notice warn"><strong>Collected figures are only as complete as invoice tax capture.</strong> Invoices created without a tax amount report $0 here — this summary never files or pays anything.</div>
    <p class="muted small">Collected view: invoices by <strong>Invoice Date</strong> in range. Taxable = Subtotal of invoices with tax &gt; 0.</p>
    <div class="stats">${stat('Tax collected (invoices)',money(d.collectedTotal))}${stat('Jurisdictions',String(d.collectedView.length))}${stat('Prepared periods',String(d.prepared.length))}</div>
    ${table(['Jurisdiction','Taxable sales','Tax collected','Invoices'],d.collectedView.map(x=>`<tr><td>${esc(x.jurisdiction)}</td>${numCell(x.taxable)}${numCell(x.collected)}<td class="num">${x.count}</td></tr>`).join(''),
      `<tr class="total"><td>Total</td><td></td>${numCell(d.collectedTotal)}<td></td></tr>`)}
    <h3>Prepared periods (Tax page records, as-is)</h3>
    ${table(['Jurisdiction','Period','Taxable','Collected','Adjustments','Est. liability','Paid'],d.prepared.map(x=>`<tr><td>${esc(x.jurisdiction)}</td><td>${esc(x.start)} → ${esc(x.end)}</td>${numCell(x.taxable)}${numCell(x.collected)}${numCell(x.adjustments)}${numCell(x.liability)}${numCell(x.paid)}</tr>`).join(''))}
    ${d.diffs.length?`<h3>Reconciliation differences (collected view vs prepared record)</h3>${table(['Jurisdiction','Period','Collected (invoices)','Collected (prepared)','Difference'],d.diffs.map(x=>`<tr><td>${esc(x.jurisdiction)}</td><td>${esc(x.start)} → ${esc(x.end)}</td>${numCell(x.viewCollected)}${numCell(x.collected)}${numCell(x.diff)}</tr>`).join(''))}`:'<p class="muted small">No reconciliation differences between the collected view and prepared periods in range.</p>'}`;
    return {html,csv:()=>downloadCSV(`sales-tax-${r.start}-to-${r.end}.csv`,
      ['Jurisdiction','Taxable sales','Tax collected','Invoices'],
      d.collectedView.map(x=>[x.jurisdiction,x.taxable.toFixed(2),x.collected.toFixed(2),x.count]))};
  }

  // ---------- R8 body: Expenses by category ----------
  function bodyExpenses(r){
    const d=expensesByCategory(r.start,r.end);
    S.reportTitle='Expenses by Category';
    const gap=d.ledgerTotal==null?null:Math.round((d.total-d.ledgerTotal)*100)/100;
    const html=`
    <p class="muted small">Source: expense records by <strong>Expense Date</strong> in range · ${d.count} records. Amount = Amount + Tax, the same rule the Money list uses.</p>
    <div class="stats">${stat('Operational total',money(d.total))}${d.ledgerTotal==null?'':stat('Ledger total (COGS + expense accounts)',money(d.ledgerTotal))}${stat('Categories',String(d.list.length))}</div>
    ${gap==null?'':`<p class="muted small">Gap: ${money(Math.abs(gap))} of operational expenses are <strong>not yet posted to the ledger</strong> (expense autopost is off by design — expenses post only through an explicit ledger entry).</p>`}
    ${table(['Category','Count','% of total','Amount'],d.list.map(x=>`<tr><td>${esc(x.category)}</td><td class="num">${x.count}</td><td class="num">${x.pct.toFixed(1)}%</td>${numCell(x.total)}</tr>`).join(''),
      `<tr class="total"><td>Total</td><td class="num">${d.count}</td><td></td>${numCell(d.total)}</tr>`)}
    ${d.list.map(x=>`<h3>${esc(x.category)} — detail</h3>${table(['Date','Payee / vendor','Description','Job','Amount'],x.rows.map(y=>`<tr><td>${esc(y.date)}</td><td>${esc(y.payee)}</td><td>${esc(y.desc)}</td><td>${esc(y.job)}</td>${numCell(y.amount)}</tr>`).join(''))}`).join('')}`;
    return {html,csv:()=>downloadCSV(`expenses-by-category-${r.start}-to-${r.end}.csv`,
      ['Category','Date','Payee','Description','Job','Amount'],
      d.list.flatMap(x=>x.rows.map(y=>[x.category,y.date,y.payee,y.desc,y.job,y.amount.toFixed(2)])))};
  }

  function bodyPL(r){
    const d=plData(r.start,r.end);
    S.reportTitle='Cash snapshot (operational)';
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

  function bodyAR(r){
    const d=arAging(r.start,r.end);
    S.reportTitle='AR Aging';
    const labels={'current':'Current (not yet due)','1-30':'1–30 days overdue','31-60':'31–60 days','61-90':'61–90 days','90+':'Over 90 days'};
    const order=['current','1-30','31-60','61-90','90+'];
    const html=`
    <p class="muted small">Engine aging by <strong>Due Date</strong> as of ${esc(d.asOf||r.end||'today')} — the same buckets as the Accounting page. Grand total must equal Σ Balance over open invoices.</p>
    ${d.engineMissing?'<div class="notice warn"><strong>Accounting engine unavailable</strong> — aging not computed rather than computed with different math.</div>':''}
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

  function bodyTax(r){
    // Use the year from the selected range (the Period picker), not always
    // the current calendar year — e.g. Last year / This year / a Custom range.
    const year=r&&r.start?String(r.start).slice(0,4):String(new Date().getFullYear());
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
    {id:'bs',label:'Balance Sheet'},
    {id:'ar',label:'AR Aging'},
    {id:'sales',label:'Sales by Customer'},
    {id:'jobs',label:'Job Costing'},
    {id:'payroll',label:'Payroll Summary'},
    {id:'salestax',label:'Sales Tax'},
    {id:'expenses',label:'Expenses by Category'},
    {id:'cash',label:'Cash snapshot (operational)'},
    {id:'revenue',label:'Revenue by Customer'},
    {id:'winloss',label:'Quote Win / Loss'},
    {id:'labor',label:'Labor Summary'},
    {id:'tax',label:'Year-End Tax Summary'},
  ];

  function render(){
    const r=currentRange();
    const builders={pl:()=>bodyLedgerPL(r),bs:()=>bodyBalanceSheet(r),ar:()=>bodyAR(r),sales:()=>bodySales(r),jobs:()=>bodyJobs(r),payroll:()=>bodyPayroll(r),salestax:()=>bodySalesTax(r),expenses:()=>bodyExpenses(r),cash:()=>bodyPL(r),revenue:()=>bodyRevenue(r),winloss:()=>bodyWinLoss(r),labor:()=>bodyLabor(r),tax:()=>bodyTax(r)};
    let built;
    try{built=builders[S.tab]();}catch(e){built={html:`<div class="notice warn"><strong>Report failed to load:</strong> ${esc(e.message||e)}</div>`,csv:null};}
    currentCsv=built.csv;
    const h38ReportsHead={page:'reports',title:'Reports',purpose:'Plain-language answers about your money and work. Nothing here files or moves anything.',primary:{label:'Run a report',handler:()=>{const b=document.querySelector('.h38-rep-tabs button');if(b){b.scrollIntoView({behavior:'smooth',block:'center'});b.focus({preventScroll:true});}}},more:[{label:'Saved snapshots',handler:()=>{window.toast?.('Use Print or Download CSV on a report to save a snapshot of it.');}},{label:'Accountant package',handler:()=>{if(typeof window.openPage==='function')window.openPage('tax');}}]};
    const main=$('mainContent');
    if(!main)return;
    main.innerHTML=(window.H38Flow?window.H38Flow.screenHeader(h38ReportsHead):(typeof window.pageHead==='function'?window.pageHead('Reports',h38ReportsHead.purpose):'<h1>Reports</h1>'))+`
    <style>
      .h38-rep-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
      .h38-rep-tabs button{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:8px 14px;font-size:14px;cursor:pointer;white-space:normal;overflow:visible;text-overflow:clip}
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
            <option value="last-quarter"${S.preset==='last-quarter'?' selected':''}>Last quarter</option>
            <option value="this-year"${S.preset==='this-year'?' selected':''}>YTD</option>
            <option value="last-year"${S.preset==='last-year'?' selected':''}>Last year</option>
            <option value="custom"${S.preset==='custom'?' selected':''}>Custom</option>
            <option value="all"${S.preset==='all'?' selected':''}>All dates</option>
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
    if(window.H38Flow)window.H38Flow.bindScreenHeader(main,h38ReportsHead);
    window.H38_TALLY?.mountBrief?.('reports');
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
