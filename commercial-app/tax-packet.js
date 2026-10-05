/* H38 Office — Accountant Tax Packet (v2.0)
 * Generates professional, print-ready tax documents for the accountant:
 * P&L, expense summary with receipts, IRS mileage log, 1099-NEC summary,
 * home office calculation, and a one-click year-end packet.
 * Manual-first, no AI. Per-tenant (business_id scoped). The Office never files a return.
 */

function taxPacketYear(){return state.taxPacketYear||new Date().getFullYear();}

/* 1099-NEC reporting threshold (IRS): $2,000 for payments made in 2026 and
 * later (One Big Beautiful Bill Act), $600 for payments made in 2025. */
function tax1099Threshold(year){return year>=2026?2000:600;}

function taxYearRange(year){return [`${year}-01-01`,`${year}-12-31`];}

function taxPacketData(year){
  const [start,end]=taxYearRange(year);
  const inYear=(row,...keys)=>within(v(row,...keys),start,end);
  const invoices=records('invoices').filter(row=>inYear(row,'Invoice Date','Created Time')&&String(v(row,'Status')).toUpperCase()!=='VOIDED');
  const expenses=records('expenses').filter(row=>inYear(row,'Expense Date','Created Time'));
  const mileage=records('mileageEntries').filter(row=>inYear(row,'Trip Date','Created Time'));
  const subPayments=records('subcontractorPayments').filter(row=>inYear(row,'Payment Date','Created Time'));
  const settings=(records('taxSettings')||[]).find(row=>String(v(row,'Tax Year'))===String(year))||{};
  return {year,start,end,invoices,expenses,mileage,subPayments,settings};
}

function taxPL(data){
  const revenue={};
  data.invoices.forEach(row=>{
    const cat=v(row,'Category')||'Contract Revenue';
    revenue[cat]=num(revenue[cat])+num(v(row,'Total'));
  });
  const exp={};
  data.expenses.forEach(row=>{
    const cat=v(row,'Category')||'Uncategorized';
    exp[cat]=num(exp[cat])+num(v(row,'Amount'))+num(v(row,'Tax'));
  });
  const totalRevenue=Object.values(revenue).reduce((a,b)=>a+b,0);
  const totalExpenses=Object.values(exp).reduce((a,b)=>a+b,0);
  return {revenue,expenses:exp,totalRevenue,totalExpenses,netProfit:totalRevenue-totalExpenses};
}

function taxMileageTotals(data){
  const miles=data.mileage.reduce((s,row)=>s+num(v(row,'Miles')),0);
  return {trips:data.mileage.length,miles};
}

function tax1099(data){
  const bySub={};
  data.subPayments.forEach(row=>{
    const name=v(row,'Subcontractor Name')||'Unknown';
    if(!bySub[name])bySub[name]={name,total:0,payments:0,tin:v(row,'TIN')||''};
    bySub[name].total+=num(v(row,'Amount'));
    bySub[name].payments+=1;
  });
  return Object.values(bySub).sort((a,b)=>b.total-a.total);
}

function taxHomeOffice(settings){
  const officeSqft=num(v(settings,'Office Sq Ft')),homeSqft=num(v(settings,'Home Sq Ft')),method=v(settings,'Method')||'Simplified';
  let deduction=0,detail='';
  if(method==='Simplified'){
    const capped=Math.min(officeSqft,300);
    deduction=capped*5;
    detail=`Simplified method: ${capped} sq ft (capped at 300) × $5 = $${deduction.toFixed(2)}`;
  }else{
    const pct=homeSqft>0?(officeSqft/homeSqft*100):0;
    deduction=num(v(settings,'Actual Home Expenses'))*pct/100;
    detail=`Actual method: ${officeSqft} of ${homeSqft} sq ft (${pct.toFixed(1)}%) × $${num(v(settings,'Actual Home Expenses')).toFixed(2)} home expenses = $${deduction.toFixed(2)}`;
  }
  return {officeSqft,homeSqft,method,deduction,detail};
}

function taxPacketSection(){
  const year=taxPacketYear(),data=taxPacketData(year),pl=taxPL(data),m=taxMileageTotals(data),subs=tax1099(data),ho=taxHomeOffice(data.settings);
  const bizName=esc(state.snapshot?.business?.businessName||'');
  const years=[];for(let y=new Date().getFullYear();y>=2023;y--)years.push(y);
  const threshold1099=tax1099Threshold(year);
  const need1099=subs.filter(s=>s.total>=threshold1099);
  return `<section class="card span12" id="h38-tax-packet"><h2>Accountant Tax Packet — ${year}</h2>
  <p class="muted small">Professional year-end documents for your accountant to verify and file. The Office prepares — it never files a return.</p>
  <div class="two"><div><label>Tax year</label><select id="taxPacketYear">${years.map(y=>`<option value="${y}"${y===year?' selected':''}>${y}</option>`).join('')}</select></div>
  <div><label>&nbsp;</label><div class="actions"><button type="button" class="primary" id="printTaxPacketBtn">Print / Save Tax Packet (PDF)</button></div></div></div>
  <div class="stats">
    <div class="stat"><strong>${money(pl.totalRevenue)}</strong><span>Revenue</span></div>
    <div class="stat"><strong>${money(pl.totalExpenses)}</strong><span>Expenses</span></div>
    <div class="stat"><strong>${money(pl.netProfit)}</strong><span>Net profit</span></div>
    <div class="stat"><strong>${m.miles.toFixed(1)}</strong><span>Business miles (${m.trips} trips)</span></div>
    <div class="stat"><strong>${need1099.length}</strong><span>1099-NEC required</span></div>
    <div class="stat"><strong>${money(ho.deduction)}</strong><span>Home office deduction</span></div>
  </div>
  <h3>Profit &amp; Loss — ${year}</h3>
  ${pl.totalRevenue||pl.totalExpenses?`<div class="two"><div><h4>Revenue</h4><div class="list">${Object.entries(pl.revenue).map(([c,a])=>`<div class="row"><strong>${esc(c)}</strong><small>${money(a)}</small></div>`).join('')}</div><div class="row-top"><strong>Total revenue</strong><strong>${money(pl.totalRevenue)}</strong></div></div>
  <div><h4>Expenses</h4><div class="list">${Object.entries(pl.expenses).map(([c,a])=>`<div class="row"><strong>${esc(c)}</strong><small>${money(a)}</small></div>`).join('')}</div><div class="row-top"><strong>Total expenses</strong><strong>${money(pl.totalExpenses)}</strong></div></div></div>
  <div class="row-top" style="margin-top:8px"><strong>Net profit (loss)</strong><strong>${money(pl.netProfit)}</strong></div>`
  :empty('No revenue or expenses recorded for '+year+'. Add invoices and expenses in Money, then return here.')}
  <h3>Expense detail</h3>
  <div class="list">${data.expenses.length?data.expenses.slice(0,100).map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Description')||'Expense')}</strong><span>${money(num(v(row,'Amount'))+num(v(row,'Tax')))}</span></div><small>${esc(v(row,'Category')||'Uncategorized')} · ${dateOnly(v(row,'Expense Date'))}</small></div>`).join(''):empty('No expenses for '+year+'.')}</div>
  <h3>Mileage log — ${year} <span class="muted small">(IRS: date, miles, business purpose required)</span></h3>
  <form id="mileageEntryForm"><div class="two"><div><label>Date</label><input name="tripDate" type="date" required value="${new Date().toISOString().slice(0,10)}"></div><div><label>Miles</label><input name="miles" type="number" min="0" step="0.1" required></div></div>
  <div class="two"><div><label>From</label><input name="origin" placeholder="Home / shop"></div><div><label>To</label><input name="destination" placeholder="Job site"></div></div>
  <label>Business purpose</label><input name="purpose" required placeholder="Site visit, material pickup…">
  <div class="actions"><button>Add mileage entry</button></div></form>
  <div class="list">${data.mileage.length?data.mileage.slice(0,100).map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Purpose'))}</strong><span>${num(v(row,'Miles')).toFixed(1)} mi</span></div><small>${dateOnly(v(row,'Trip Date'))} · ${esc(v(row,'Origin')||'')} → ${esc(v(row,'Destination')||'')}</small></div>`).join(''):empty('No mileage entries for '+year+'. Log trips above or in Field → Receipt & mileage.')}</div>
  <h3>1099-NEC summary — ${year}</h3>
  <p class="muted small">Subcontractors paid $${threshold1099.toLocaleString()} or more in ${year} need a 1099-NEC. (IRS threshold: $600 for 2025 payments, $2,000 for 2026 and later.) Give this list to your accountant.</p>
  <form id="subPaymentForm"><div class="two"><div><label>Subcontractor name</label><input name="subName" required></div><div><label>TIN (optional)</label><input name="tin" placeholder="XX-XXXXXXX"></div></div>
  <div class="two"><div><label>Amount</label><input name="amount" type="number" min="0" step="0.01" required></div><div><label>Payment date</label><input name="paymentDate" type="date" required value="${new Date().toISOString().slice(0,10)}"></div></div>
  <label>Notes</label><input name="notes" placeholder="Job or invoice reference">
  <div class="actions"><button>Record subcontractor payment</button></div></form>
  <div class="list">${subs.length?subs.map(s=>`<div class="row"><div class="row-top"><strong>${esc(s.name)}</strong>${s.total>=threshold1099?pill('1099 required'):pill('under $'+threshold1099.toLocaleString())}</div><small>${money(s.total)} across ${s.payments} payment${s.payments===1?'':'s'}${s.tin?` · TIN on file`:''}</small></div>`).join(''):empty('No subcontractor payments recorded for '+year+'.')}</div>
  <h3>Home office deduction — ${year}</h3>
  <form id="homeOfficeForm"><div class="two"><div><label>Office sq ft</label><input name="officeSqft" type="number" min="0" step="1" value="${esc(v(data.settings,'Office Sq Ft')||'')}"></div><div><label>Total home sq ft</label><input name="homeSqft" type="number" min="0" step="1" value="${esc(v(data.settings,'Home Sq Ft')||'')}"></div></div>
  <div class="two"><div><label>Method</label><select name="method"><option${(v(data.settings,'Method')||'Simplified')==='Simplified'?' selected':''}>Simplified</option><option${v(data.settings,'Method')==='Actual'?' selected':''}>Actual</option></select></div><div><label>Total home expenses (actual method)</label><input name="actualExpenses" type="number" min="0" step="0.01" value="${esc(v(data.settings,'Actual Home Expenses')||'')}"></div></div>
  <div class="actions"><button>Save home office info</button></div></form>
  <p class="small">${esc(ho.detail||'Enter your office and home square footage above.')}</p>
  <div class="notice">Bring the printed packet to your accountant for verification and filing. Nothing here is filed automatically.</div>
  </section>`;
}

function bindTaxPacket(){
  const yearSel=$('taxPacketYear');
  if(yearSel)yearSel.onchange=e=>{state.taxPacketYear=num(e.target.value);renderTaxPrep();};
  const printBtn=$('printTaxPacketBtn');
  if(printBtn)printBtn.onclick=()=>printTaxPacket(taxPacketYear());
  bindForm('mileageEntryForm',async(data,form)=>{
    const id=newId('MILEAGE'),record={'Mileage ID':id,'Business ID':state.businessId,'Trip Date':requireValue(data.tripDate,'Date is required.'),'Miles':num(data.miles),'Purpose':requireValue(data.purpose,'Business purpose is required.'),'Origin':data.origin,'Destination':data.destination,'Status':'Recorded','Created Time':now(),'Updated Time':now(),'Record Version':1};
    await queueOperation('SAVE_ENTITY','Mileage',id,{entity:'mileageEntries',record},{collection:'mileageEntries',record,idKeys:['Mileage ID']});
    form.reset();toast('Mileage entry saved.');renderTaxPrep();
  });
  bindForm('subPaymentForm',async(data,form)=>{
    const id=newId('SUBPAY'),record={'Subcontractor Payment ID':id,'Business ID':state.businessId,'Subcontractor Name':requireValue(data.subName,'Name is required.'),'TIN':data.tin,'Amount':num(data.amount),'Payment Date':requireValue(data.paymentDate,'Date is required.'),'Notes':data.notes,'Tax Year':String(data.paymentDate).slice(0,4),'Created Time':now(),'Updated Time':now(),'Record Version':1};
    await queueOperation('SAVE_ENTITY','Subcontractor Payment',id,{entity:'subcontractorPayments',record},{collection:'subcontractorPayments',record,idKeys:['Subcontractor Payment ID']});
    form.reset();toast('Subcontractor payment recorded.');renderTaxPrep();
  });
  bindForm('homeOfficeForm',async(data,form)=>{
    const id='TAXSET-'+taxPacketYear(),record={'Tax Settings ID':id,'Business ID':state.businessId,'Tax Year':String(taxPacketYear()),'Office Sq Ft':num(data.officeSqft),'Home Sq Ft':num(data.homeSqft),'Method':data.method,'Actual Home Expenses':num(data.actualExpenses),'Updated Time':now(),'Record Version':1};
    await queueOperation('SAVE_ENTITY','Tax Settings',id,{entity:'taxSettings',record},{collection:'taxSettings',record,idKeys:['Tax Settings ID']});
    toast('Home office info saved.');renderTaxPrep();
  });
}

/* ---------- Print packet ---------- */

function taxPacketPrintCss(){return `<style>
  @media print{body{margin:0}.no-print{display:none!important}}
  body{font-family:Georgia,'Times New Roman',serif;color:#111;max-width:760px;margin:0 auto;padding:24px;font-size:12pt;line-height:1.5}
  h1{font-size:20pt;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:4px}
  h2{font-size:15pt;margin-top:28px;border-bottom:1px solid #999;padding-bottom:4px;page-break-after:avoid}
  h3{font-size:12pt;margin:14px 0 6px}
  table{width:100%;border-collapse:collapse;margin:8px 0}
  th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ccc;font-size:11pt}
  th{background:#f2f2f2}
  td.n,th.n{text-align:right}
  .totals td{font-weight:bold;border-top:2px solid #111}
  .meta{color:#444;font-size:10pt;margin-bottom:16px}
  .sig{margin-top:32px;display:flex;gap:40px}
  .sig div{flex:1;border-top:1px solid #111;padding-top:4px;font-size:10pt;color:#444}
  .warn{background:#fff8e1;border:1px solid #e0c36a;padding:10px 14px;font-size:10pt;margin:16px 0}
  .pagebreak{page-break-before:always}
</style>`;}

function taxPacketPrintHtml(year){
  const data=taxPacketData(year),pl=taxPL(data),m=taxMileageTotals(data),subs=tax1099(data),ho=taxHomeOffice(data.settings);
  const threshold1099=tax1099Threshold(year);
  const biz=esc(state.snapshot?.business?.businessName||'Business');
  const prepared=new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
  const catRows=obj=>Object.entries(obj).sort((a,b)=>b[1]-a[1]).map(([c,a])=>`<tr><td>${esc(c)}</td><td class="n">$${a.toFixed(2)}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tax Packet ${year} — ${biz}</title>${taxPacketPrintCss()}</head><body>
  <div class="no-print" style="margin-bottom:16px"><button onclick="window.print()" style="font-size:14pt;padding:10px 24px">Print / Save as PDF</button></div>
  <h1>${biz} — Tax Preparation Packet</h1>
  <div class="meta">Tax year ${year} · Prepared ${prepared} from H38 Business Office records · For accountant verification and filing. This packet is informational only — no return has been filed.</div>

  <h2>1. Profit &amp; Loss Statement — ${year}</h2>
  <h3>Revenue</h3>
  <table><tr><th>Category</th><th class="n">Amount</th></tr>${catRows(pl.revenue)||'<tr><td colspan="2">No revenue recorded.</td></tr>'}<tr class="totals"><td>Total revenue</td><td class="n">$${pl.totalRevenue.toFixed(2)}</td></tr></table>
  <h3>Expenses</h3>
  <table><tr><th>Category</th><th class="n">Amount</th></tr>${catRows(pl.expenses)||'<tr><td colspan="2">No expenses recorded.</td></tr>'}<tr class="totals"><td>Total expenses</td><td class="n">$${pl.totalExpenses.toFixed(2)}</td></tr></table>
  <table><tr class="totals"><td>Net profit (loss)</td><td class="n">$${pl.netProfit.toFixed(2)}</td></tr></table>

  <h2 class="pagebreak">2. Expense Detail — ${year}</h2>
  <table><tr><th>Date</th><th>Description</th><th>Category</th><th class="n">Amount</th></tr>
  ${data.expenses.length?data.expenses.map(r=>`<tr><td>${esc(dateOnly(v(r,'Expense Date')))}</td><td>${esc(v(r,'Description')||'—')}</td><td>${esc(v(r,'Category')||'Uncategorized')}</td><td class="n">$${(num(v(r,'Amount'))+num(v(r,'Tax'))).toFixed(2)}</td></tr>`).join(''):'<tr><td colspan="4">No expenses recorded.</td></tr>'}
  </table>
  <div class="warn">Receipt images are stored with each expense in the H38 Office (Money → Expenses). Attach or bring them for any expense your accountant flags.</div>

  <h2 class="pagebreak">3. Business Mileage Log — ${year}</h2>
  <div class="meta">IRS requires: date, miles driven, and business purpose for each trip. Total: ${m.miles.toFixed(1)} miles across ${m.trips} trips.</div>
  <table><tr><th>Date</th><th>From → To</th><th>Purpose</th><th class="n">Miles</th></tr>
  ${data.mileage.length?data.mileage.map(r=>`<tr><td>${esc(dateOnly(v(r,'Trip Date')))}</td><td>${esc(v(r,'Origin')||'—')} → ${esc(v(r,'Destination')||'—')}</td><td>${esc(v(r,'Purpose')||'—')}</td><td class="n">${num(v(r,'Miles')).toFixed(1)}</td></tr>`).join(''):'<tr><td colspan="4">No mileage entries recorded.</td></tr>'}
  <tr class="totals"><td colspan="3">Total business miles</td><td class="n">${m.miles.toFixed(1)}</td></tr></table>

  <h2 class="pagebreak">4. 1099-NEC Summary — ${year}</h2>
  <div class="meta">Subcontractors paid $${threshold1099.toLocaleString()} or more in ${year} generally require a Form 1099-NEC. (IRS threshold: $600 for 2025 payments, $2,000 for 2026 and later.) Confirm thresholds and filing with your accountant.</div>
  <table><tr><th>Subcontractor</th><th class="n">Payments</th><th class="n">Total paid</th><th>1099 needed</th></tr>
  ${subs.length?subs.map(s=>`<tr><td>${esc(s.name)}${s.tin?` (TIN on file)`:''}</td><td class="n">${s.payments}</td><td class="n">$${s.total.toFixed(2)}</td><td>${s.total>=threshold1099?'<strong>YES</strong>':'No'}</td></tr>`).join(''):'<tr><td colspan="4">No subcontractor payments recorded.</td></tr>'}
  </table>

  <h2>5. Home Office Deduction — ${year}</h2>
  <table><tr><th>Item</th><th>Value</th></tr>
  <tr><td>Method</td><td>${esc(ho.method)}</td></tr>
  <tr><td>Office area</td><td>${ho.officeSqft} sq ft</td></tr>
  <tr><td>Total home area</td><td>${ho.homeSqft} sq ft</td></tr>
  <tr class="totals"><td>Calculated deduction</td><td>$${ho.deduction.toFixed(2)}</td></tr></table>
  <div class="meta">${esc(ho.detail||'No home office information entered.')}</div>

  <h2 class="pagebreak">6. Accountant Review</h2>
  <div class="warn">Prepared from H38 Business Office records on ${prepared}. Figures are drafts for professional verification — confirm categorization, depreciation, inventory, and payroll tax filings with your accountant before filing.</div>
  <div class="sig"><div>Owner signature / date</div><div>Accountant signature / date</div></div>
  </body></html>`;
}

function printTaxPacket(year){
  const w=window.open('','_blank','width=900,height=700');
  if(!w){toast('Popup blocked — allow popups to print the tax packet.',true);return;}
  w.document.write(taxPacketPrintHtml(year));
  w.document.close();
}
window.printTaxPacket=printTaxPacket;
