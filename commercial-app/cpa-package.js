/* H38 Office — One-Click CPA Package (v1.0)
 * Generates a complete, organized year-end PDF package for the accountant:
 * cover sheet, P&L, balance sheet, cash flow, expense detail, mileage log,
 * home office (both methods), 1099-NEC summary, sales tax summary, and a
 * missing-documents checklist at the back.
 * Manual-first, no AI. Per-tenant (business_id scoped). The Office never files a return.
 * Reuses tax-packet.js data functions (taxPacketData, taxPL, taxMileageTotals,
 * tax1099, taxHomeOffice, tax1099Threshold) and its hand-rolled PDF helpers
 * (taxPdfClean/Escape/Pad/Right/Wrap) — this file loads after tax-packet.js.
 */

function cpaPackageYear(){return typeof taxPacketYear==='function'?taxPacketYear():(state.taxPacketYear||new Date().getFullYear());}

/* ---------- Data assembly (builds on tax-packet.js) ---------- */

function cpaPackageData(year){
  const base=taxPacketData(year); // invoices, expenses, mileage, subPayments, settings, year, start, end
  const inYear=(row,...keys)=>within(v(row,...keys),base.start,base.end);
  const notVoided=row=>String(v(row,'Status')).toUpperCase().indexOf('VOID')<0;
  const payments=records('payments').filter(row=>inYear(row,'Created Time')&&notVoided(row));
  const vendorPayments=records('vendorPayments').filter(row=>inYear(row,'Payment Date','Created Time')&&notVoided(row));
  const checks=records('checks').filter(row=>inYear(row,'Payment Date','Created Time')&&!/VOID|CANCEL/i.test(String(v(row,'Status'))));
  const vendorBills=records('vendorBills').filter(row=>!/VOID|CANCEL/i.test(String(v(row,'Status'))));
  const bankAccounts=records('bankAccounts');
  const reconciliations=records('reconciliations');
  const payrollPeriods=records('payrollPeriods').filter(row=>inYear(row,'Pay Date','Period End','Created Time'));
  const inventoryTxns=records('inventoryTransactions');
  const priceBook=records('priceBook');
  const loans=records('loans');
  const loanPayments=records('loanPayments');
  const taxPeriods=records('taxPeriods').filter(row=>inYear(row,'Period Start','Period End','Created Time'));
  const missing=records('missingDocuments');
  const expensesNeedingReceipt=base.expenses.filter(row=>String(v(row,'Receipt Required')).toLowerCase()==='yes'&&!String(v(row,'Receipt ID')||'').trim());
  return {...base,payments,vendorPayments,checks,vendorBills,bankAccounts,reconciliations,payrollPeriods,inventoryTxns,priceBook,loans,loanPayments,taxPeriods,missing,expensesNeedingReceipt};
}

/* ---------- Balance sheet (NEW) ----------
 * Compiled from Office business records. Balances are current as of the run
 * date (the Office does not keep dated snapshots), so the PDF carries a note
 * telling the CPA to verify year-end adjustments. */

function cpaBalanceSheet(data){
  const cash=data.bankAccounts.reduce((s,r)=>s+num(v(r,'Available Balance','Ledger Balance','Balance')),0);
  const receivables=data.invoices.reduce((s,r)=>s+Math.max(0,num(v(r,'Balance'))),0);
  const stock=new Map();
  data.inventoryTxns.forEach(row=>{
    const id=v(row,'Item ID'),qty=Math.abs(num(v(row,'Quantity'))),dir=String(v(row,'Direction')).toUpperCase();
    stock.set(id,(stock.get(id)||0)+(dir==='OUT'?-qty:qty));
  });
  let inventory=0,inventoryItems=0;
  data.priceBook.forEach(row=>{
    const onHand=stock.get(v(row,'Item ID'))||0;
    if(onHand>0){inventory+=onHand*num(v(row,'Purchase Cost'));inventoryItems++;}
  });
  const payables=data.vendorBills.reduce((s,r)=>s+Math.max(0,num(v(r,'Open Balance','Balance','Amount Due','Total'))),0);
  const loanBal=data.loans.reduce((s,r)=>s+Math.max(0,num(v(r,'Balance','Remaining Balance','Outstanding Balance','Principal Balance'))),0);
  const totalAssets=cash+receivables+inventory;
  const totalLiabilities=payables+loanBal;
  return {
    cash,cashAccounts:data.bankAccounts.length,
    receivables,
    inventory,inventoryItems,
    payables,loanBal,loanCount:data.loans.length,
    totalAssets,totalLiabilities,
    equity:totalAssets-totalLiabilities
  };
}

/* ---------- Cash flow statement (NEW) — simplified direct method ---------- */

function cpaCashFlow(data){
  const inYear=(row,...keys)=>within(v(row,...keys),data.start,data.end);
  const receipts=data.payments.reduce((s,r)=>s+num(v(r,'Amount')),0);
  const vendorPaid=data.expenses.reduce((s,r)=>s+num(v(r,'Amount'))+num(v(r,'Tax')),0)
    +data.vendorPayments.reduce((s,r)=>s+num(v(r,'Amount','Total')),0)
    +data.checks.reduce((s,r)=>s+num(v(r,'Amount')),0);
  const payroll=data.payrollPeriods
    .filter(row=>/PAID|COMPLETE|CLOSED|FINAL|EXPORTED/i.test(String(v(row,'Status'))))
    .reduce((s,r)=>s+num(v(r,'Net Pay','Prepared Net Amount','Total Cost')),0);
  const subPay=data.subPayments.reduce((s,r)=>s+num(v(r,'Amount')),0);
  const operatingNet=receipts-vendorPaid-payroll-subPay;
  // Investing: equipment / fixed-asset purchases recorded in year (candidate collections)
  const invItems=[];
  ['fixedAssets','assetPurchases','equipmentPurchases'].forEach(name=>{
    records(name).forEach(r=>{
      if(!inYear(r,'Purchase Date','Date','Created Time'))return;
      const amount=num(v(r,'Cost','Purchase Price','Amount','Total'));
      if(amount>0)invItems.push({name:v(r,'Description','Asset Name','Name')||name,amount});
    });
  });
  const investingOut=invItems.reduce((s,i)=>s+i.amount,0);
  // Financing: loan proceeds received in year; loan payments made in year
  const loanProceeds=data.loans.filter(r=>inYear(r,'Disbursement Date','Loan Date','Start Date','Created Time'))
    .reduce((s,r)=>s+num(v(r,'Principal','Loan Amount','Original Amount')),0);
  const loanPaid=data.loanPayments.filter(r=>inYear(r,'Payment Date','Date','Created Time'))
    .reduce((s,r)=>s+num(v(r,'Amount','Principal','Total')),0);
  const financingNet=loanProceeds-loanPaid;
  return {receipts,vendorPaid,payroll,subPay,operatingNet,invItems,investingOut,loanProceeds,loanPaid,financingNet,netChange:operatingNet-investingOut+financingNet};
}

/* ---------- Home office — both methods side by side ---------- */

function cpaHomeOfficeBoth(data){
  const settings=data.settings;
  const officeSqft=num(v(settings,'Office Sq Ft')),homeSqft=num(v(settings,'Home Sq Ft'));
  const method=v(settings,'Method')||'Simplified';
  const simpCapped=Math.min(officeSqft,300);
  const simplified={capped:simpCapped,deduction:simpCapped*5};
  const pct=homeSqft>0?(officeSqft/homeSqft*100):0;
  const actual={pct,expenses:num(v(settings,'Actual Home Expenses')),deduction:num(v(settings,'Actual Home Expenses'))*pct/100};
  return {officeSqft,homeSqft,method,simplified,actual,entered:officeSqft>0&&homeSqft>0};
}

/* ---------- Sales tax summary (NEW) ---------- */

function cpaSalesTax(data){
  const byJur={};
  data.invoices.forEach(row=>{
    if(num(v(row,'Tax','Tax Amount'))<=0)return;
    const jur=v(row,'Tax Jurisdiction','Jurisdiction','Sales Tax Jurisdiction')||'Unassigned jurisdiction';
    if(!byJur[jur])byJur[jur]={jurisdiction:jur,taxable:0,collected:0,invoices:0};
    byJur[jur].taxable+=num(v(row,'Subtotal'));
    byJur[jur].collected+=num(v(row,'Tax','Tax Amount'));
    byJur[jur].invoices++;
  });
  return Object.values(byJur).sort((a,b)=>b.collected-a.collected);
}

/* ---------- Missing documents checklist (NEW) — gap scan ---------- */

function cpaMissingDocs(data){
  const items=[];
  const push=(area,item)=>items.push({area,item});
  // 1. Bank statements / reconciliations
  data.bankAccounts.forEach(acct=>{
    const acctId=String(v(acct,'Bank Account ID','Account ID','id')||'');
    const name=v(acct,'Account Name')||'bank account';
    const recs=data.reconciliations.filter(r=>{
      const rid=String(v(r,'Bank Account ID','Account ID','Account')||'');
      if(rid&&acctId&&rid!==acctId)return false;
      return within(v(r,'Statement Date','Created Time'),data.start,data.end);
    });
    if(!recs.length)push('Banking','Bank statement / reconciliation for "'+name+'" ('+data.year+')');
  });
  // 2. Required receipt images not attached
  data.expensesNeedingReceipt.forEach(r=>push('Receipts','Receipt image for '+(v(r,'Description')||'expense')+' — '+money(num(v(r,'Amount'))+num(v(r,'Tax')))+' on '+dateOnly(v(r,'Expense Date'))));
  // 3. Missing TIN/W-9 for subs who need a 1099
  const thr=tax1099Threshold(data.year);
  tax1099(data).filter(s=>s.total>=thr&&!String(s.tin||'').trim())
    .forEach(s=>push('1099-NEC','TIN / W-9 for '+s.name+' ('+money(s.total)+' paid — 1099-NEC required)'));
  // 4. Sales tax periods with no payment recorded
  data.taxPeriods
    .filter(row=>String(v(row,'Tax Type')).toLowerCase().indexOf('sales')>=0&&num(v(row,'Payment Recorded'))<=0)
    .forEach(row=>push('Sales tax','Sales tax payment not recorded: '+(v(row,'Jurisdiction')||'jurisdiction')+' '+dateOnly(v(row,'Period Start'))+' to '+dateOnly(v(row,'Period End'))+' (estimated liability '+money(v(row,'Estimated Liability'))+')'));
  // 5. Items already tracked as missing in the Office
  data.missing.filter(row=>!/CLOSED|RESOLVED|DONE/i.test(String(v(row,'Status'))))
    .forEach(row=>push(v(row,'Area')||'General','Already tracked: '+(v(row,'Document Type')||'document')+(v(row,'Due Date')?' — due '+dateOnly(v(row,'Due Date')):'')+(v(row,'Description')?' — '+v(row,'Description'):'')));
  // 6. Home office info never entered
  if(!num(v(data.settings,'Office Sq Ft'))&&!num(v(data.settings,'Home Sq Ft')))
    push('Home office','Home office square footage for '+data.year+' (enter it in the Tax Center, Accountant Tax Packet section)');
  return items;
}

/* ---------- Tax Center section (injected into the Tax / Tax Center page) ---------- */

function cpaPackageSection(){
  const year=cpaPackageYear();
  let stats='';
  try{
    const data=cpaPackageData(year),pl=taxPL(data),bs=cpaBalanceSheet(data),miss=cpaMissingDocs(data);
    stats=`<div class="stats">
      <div class="stat"><strong>${money(pl.netProfit)}</strong><span>Net profit</span></div>
      <div class="stat"><strong>${money(bs.totalAssets)}</strong><span>Assets (business records)</span></div>
      <div class="stat"><strong>${money(bs.totalLiabilities)}</strong><span>Liabilities</span></div>
      <div class="stat"><strong>${money(bs.equity)}</strong><span>Equity (plug)</span></div>
      <div class="stat"><strong>${miss.length}</strong><span>Missing document items</span></div>
    </div>`;
  }catch(e){stats=`<div class="notice warn">Package preview unavailable: ${typeof esc==='function'?esc(e.message||e):String(e.message||e)}</div>`;}
  return `<section class="card span12" id="h38-cpa-package"><h2>One-Click CPA Package — ${year}</h2>
  <p class="muted small">A complete, organized year-end package for your accountant: cover sheet, P&amp;L, balance sheet, cash flow, expense detail, mileage log, home office (both methods), 1099-NEC summary, sales tax summary, and a missing-documents checklist. The Office prepares — it never files a return.</p>
  ${stats}
  <div class="actions"><button type="button" class="primary" id="downloadCpaPackageBtn">Generate CPA Package (PDF)</button></div>
  <div class="notice">Give the downloaded package to your accountant for verification and filing. Balance-sheet balances are current Office balances as of the run date — your CPA should confirm year-end adjustments (depreciation, accruals, payroll tax filings).</div>
  </section>`;
}

function bindCpaPackage(){
  const btn=document.getElementById('downloadCpaPackageBtn');
  if(btn&&!btn.dataset.h38CpaBound){btn.dataset.h38CpaBound='1';btn.onclick=()=>downloadCpaPackagePdf(cpaPackageYear());}
}

/* ---------- PDF lines (10 sections, same line conventions as tax-packet.js) ---------- */

function cpaPdfLines(year){
  const data=cpaPackageData(year);
  const pl=taxPL(data),bs=cpaBalanceSheet(data),cf=cpaCashFlow(data);
  const m=taxMileageTotals(data),subs=tax1099(data),ho=cpaHomeOfficeBoth(data);
  const st=cpaSalesTax(data),miss=cpaMissingDocs(data);
  const threshold1099=tax1099Threshold(year);
  const biz=state.snapshot&&state.snapshot.business?String(state.snapshot.business.businessName||'Business'):'Business';
  const prepared=new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
  const usd=n=>'$'+Number(n||0).toFixed(2);
  const L=[];
  const title=t=>L.push({t,font:'H',size:16,bold:1,gap:6});
  const head=t=>L.push({t,font:'H',size:12.5,bold:1,gap:14});
  const sub=t=>L.push({t,font:'H',size:10.5,bold:1,gap:9});
  const body=t=>L.push({t,font:'H',size:9.5,gap:5});
  const row=t=>L.push({t,font:'C',size:8.8,gap:5});
  const rowB=t=>L.push({t,font:'C',size:8.8,bold:1,gap:5});
  const cats=obj=>Object.entries(obj).sort((a,b)=>b[1]-a[1]);

  /* 1. Cover sheet */
  title('CPA Package');
  title(biz+' - Tax Year '+year);
  L.push({t:'',font:'H',size:9.5,gap:10});
  body('Prepared: '+prepared);
  body('Prepared from H38 Business Office records.');
  body('This package is informational only - no tax return has been filed.');
  L.push({t:'',font:'H',size:9.5,gap:6});
  body('Contents:');
  body('  2. Profit & Loss Statement');
  body('  3. Balance Sheet');
  body('  4. Cash Flow Statement');
  body('  5. Expense Detail with Receipts');
  body('  6. Business Mileage Log');
  body('  7. Home Office Deduction');
  body('  8. 1099-NEC Summary');
  body('  9. Sales Tax Summary');
  body('  10. Missing Documents Checklist');
  taxPdfWrap('Disclaimer: figures are drafts compiled from Office records for professional verification. Confirm categorization, depreciation, inventory valuation, payroll tax filings, and all year-end adjustments with your accountant before filing.',100).forEach(t=>body(t));

  /* 2. Profit & Loss */
  head('2. Profit & Loss Statement - '+year);
  sub('Revenue');
  if(cats(pl.revenue).length)cats(pl.revenue).forEach(([c,a])=>row(taxPdfPad(c,58)+taxPdfRight(usd(a),16)));
  else row('  No revenue recorded for '+year+'.');
  rowB(taxPdfPad('Total revenue',58)+taxPdfRight(usd(pl.totalRevenue),16));
  sub('Expenses');
  if(cats(pl.expenses).length)cats(pl.expenses).forEach(([c,a])=>row(taxPdfPad(c,58)+taxPdfRight(usd(a),16)));
  else row('  No expenses recorded for '+year+'.');
  rowB(taxPdfPad('Total expenses',58)+taxPdfRight(usd(pl.totalExpenses),16));
  rowB(taxPdfPad('Net profit (loss)',58)+taxPdfRight(usd(pl.netProfit),16));

  /* 3. Balance Sheet */
  head('3. Balance Sheet');
  sub('Assets');
  row(taxPdfPad('Cash ('+bs.cashAccounts+' bank account'+(bs.cashAccounts===1?'':'s')+')',58)+taxPdfRight(usd(bs.cash),16));
  row(taxPdfPad('Accounts receivable (unpaid invoices)',58)+taxPdfRight(usd(bs.receivables),16));
  row(taxPdfPad('Inventory ('+bs.inventoryItems+' items on hand)',58)+taxPdfRight(usd(bs.inventory),16));
  rowB(taxPdfPad('Total assets',58)+taxPdfRight(usd(bs.totalAssets),16));
  sub('Liabilities');
  row(taxPdfPad('Accounts payable (open vendor bills)',58)+taxPdfRight(usd(bs.payables),16));
  row(taxPdfPad('Loans ('+bs.loanCount+' recorded)',58)+taxPdfRight(usd(bs.loanBal),16));
  rowB(taxPdfPad('Total liabilities',58)+taxPdfRight(usd(bs.totalLiabilities),16));
  rowB(taxPdfPad('Equity (assets - liabilities)',58)+taxPdfRight(usd(bs.equity),16));
  taxPdfWrap('Compiled from Office business records (cash basis). Balances are current as of the run date - verify year-end adjustments (depreciation, accruals, payroll) with your CPA.',100).forEach(t=>body(t));

  /* 4. Cash Flow */
  head('4. Cash Flow Statement - '+year+' (direct method)');
  sub('Operating activities');
  row(taxPdfPad('Receipts from customers',58)+taxPdfRight(usd(cf.receipts),16));
  row(taxPdfPad('Payments to vendors & suppliers',58)+taxPdfRight('('+usd(cf.vendorPaid)+')',16));
  row(taxPdfPad('Payments to employees (paid payroll)',58)+taxPdfRight('('+usd(cf.payroll)+')',16));
  row(taxPdfPad('Payments to subcontractors',58)+taxPdfRight('('+usd(cf.subPay)+')',16));
  rowB(taxPdfPad('Net cash from operating activities',58)+taxPdfRight(usd(cf.operatingNet),16));
  sub('Investing activities');
  if(cf.invItems.length)cf.invItems.forEach(i=>row(taxPdfPad(i.name,58)+taxPdfRight('('+usd(i.amount)+')',16)));
  else row('  No equipment / fixed-asset purchases recorded for '+year+'.');
  rowB(taxPdfPad('Net cash from investing activities',58)+taxPdfRight('('+usd(cf.investingOut)+')',16));
  sub('Financing activities');
  row(taxPdfPad('Loan proceeds received',58)+taxPdfRight(usd(cf.loanProceeds),16));
  row(taxPdfPad('Loan payments made',58)+taxPdfRight('('+usd(cf.loanPaid)+')',16));
  rowB(taxPdfPad('Net cash from financing activities',58)+taxPdfRight(usd(cf.financingNet),16));
  rowB(taxPdfPad('Net change in cash (from activity)',58)+taxPdfRight(usd(cf.netChange),16));
  taxPdfWrap('Owner draws / contributions are not tracked separately by the Office - confirm equity movements with your CPA. Reconcile timing differences between recorded cash activity and bank statements.',100).forEach(t=>body(t));

  /* 5. Expense detail */
  head('5. Expense Detail with Receipts - '+year);
  if(data.expenses.length)data.expenses.slice(0,120).forEach(r=>{
    const missingR=String(v(r,'Receipt Required')).toLowerCase()==='yes'&&!String(v(r,'Receipt ID')||'').trim();
    row(taxPdfPad(dateOnly(v(r,'Expense Date')),11)+taxPdfPad(v(r,'Description')||'Expense',30)+taxPdfPad(v(r,'Category')||'Uncategorized',20)+taxPdfRight(usd(num(v(r,'Amount'))+num(v(r,'Tax'))),11)+(missingR?'  RECEIPT MISSING':''));
  });
  else row('  No expenses recorded for '+year+'.');
  body('Receipt images are stored with each expense in the H38 Office (Money - Expenses, and Documents).');
  if(data.expensesNeedingReceipt.length)body(data.expensesNeedingReceipt.length+' expense(s) are flagged as missing required receipts - see the Missing Documents Checklist (section 10).');

  /* 6. Mileage */
  head('6. Business Mileage Log - '+year);
  body('IRS requires date, miles, and business purpose for each trip. Total: '+m.miles.toFixed(1)+' miles across '+m.trips+' trips.');
  if(data.mileage.length)data.mileage.slice(0,120).forEach(r=>row(taxPdfPad(dateOnly(v(r,'Trip Date')),11)+taxPdfPad((v(r,'Origin')||'-')+' -> '+(v(r,'Destination')||'-'),30)+taxPdfPad(v(r,'Purpose')||'-',22)+taxPdfRight(num(v(r,'Miles')).toFixed(1),11)));
  else row('  No mileage entries recorded for '+year+'.');

  /* 7. Home office — both methods */
  head('7. Home Office Deduction - '+year);
  row(taxPdfPad('Office area',40)+ho.officeSqft+' sq ft');
  row(taxPdfPad('Total home area',40)+ho.homeSqft+' sq ft');
  if(!ho.entered){body('No home office information entered for '+year+'. Enter it in the Tax Center, Accountant Tax Packet section.');}
  sub('Simplified method'+(ho.method==='Simplified'?' (selected)':''));
  row(taxPdfPad('Office sq ft (capped at 300)',40)+ho.simplified.capped+' sq ft');
  row(taxPdfPad('Rate',40)+'$5 per sq ft');
  rowB(taxPdfPad('Simplified deduction',40)+usd(ho.simplified.deduction));
  sub('Actual method'+(ho.method==='Actual'?' (selected)':''));
  row(taxPdfPad('Business-use percentage',40)+ho.actual.pct.toFixed(1)+'%');
  row(taxPdfPad('Total home expenses entered',40)+usd(ho.actual.expenses));
  rowB(taxPdfPad('Actual-method deduction',40)+usd(ho.actual.deduction));
  body('Your CPA should confirm the method and the business-use percentage.');

  /* 8. 1099-NEC */
  head('8. 1099-NEC Summary - '+year);
  taxPdfWrap('Subcontractors paid $'+threshold1099.toLocaleString()+' or more in '+year+' generally require a Form 1099-NEC. (IRS threshold: $600 for 2025 payments, $2,000 for 2026 and later.) Confirm with your accountant.',100).forEach(t=>body(t));
  if(subs.length)subs.forEach(x=>row(taxPdfPad(x.name+(x.tin?' (TIN on file)':' (TIN MISSING)'),44)+taxPdfRight(String(x.payments),6)+taxPdfRight(usd(x.total),14)+taxPdfRight(x.total>=threshold1099?'YES':'No',6)));
  else row('  No subcontractor payments recorded for '+year+'.');

  /* 9. Sales tax */
  head('9. Sales Tax Summary - '+year);
  if(st.length)st.forEach(j=>row(taxPdfPad(j.jurisdiction,40)+taxPdfRight(String(j.invoices),6)+taxPdfRight(usd(j.taxable),14)+taxPdfRight(usd(j.collected),14)));
  else row('  No taxable sales with collected tax recorded for '+year+'.');
  if(st.length){row(taxPdfPad('Total taxable sales',40)+taxPdfPad('',6)+taxPdfRight(usd(st.reduce((s,j)=>s+j.taxable,0)),14));rowB(taxPdfPad('Total tax collected',40)+taxPdfPad('',6)+taxPdfRight(usd(st.reduce((s,j)=>s+j.collected,0)),14));}
  if(data.taxPeriods.length){
    sub('Prepared tax periods');
    data.taxPeriods.forEach(r=>row(taxPdfPad(v(r,'Jurisdiction')||'Jurisdiction',34)+taxPdfPad(dateOnly(v(r,'Period Start'))+' to '+dateOnly(v(r,'Period End')),26)+taxPdfRight(usd(v(r,'Estimated Liability')),14)));
  }else body('No tax periods were prepared in the Office for '+year+'.');
  body('No tax return is filed and no tax payment is initiated by the Office.');

  /* 10. Missing documents checklist */
  head('10. Missing Documents Checklist');
  if(miss.length)miss.forEach((x,i)=>row(taxPdfPad(String(i+1)+'. ['+x.area+']',18)+x.item));
  else body('No missing documents found — everything the Office tracks is on file.');
  L.push({t:'',font:'H',size:9.5,gap:16});
  taxPdfWrap('Prepared from H38 Business Office records on '+prepared+'. Figures are drafts for professional verification - confirm categorization, depreciation, inventory, and payroll tax filings with your accountant before filing. The Office prepares; it never files a return.',100).forEach(t=>body(t));
  L.push({t:'',font:'H',size:9.5,gap:16});
  row(taxPdfPad('Owner signature / date',37)+'   '+taxPdfPad('Accountant signature / date',37));
  row(taxPdfPad('__________________________',37)+'   '+taxPdfPad('__________________________',37));
  return {lines:L,biz,year};
}

/* ---------- Direct PDF export (no print dialog, no external library) ----------
 * Same hand-rolled PDF writer as tax-packet.js: Helvetica / Courier, US letter,
 * footer with page numbers. */

function cpaPdfString(year){
  const {lines}=cpaPdfLines(year);
  const pageW=612,pageH=792,margin=54,topY=726,bottomY=60;
  const heights=l=>Math.round(l.size*1.5)+(l.gap||0);
  const pages=[[]];let y=topY;
  for(const line of lines){const h=heights(line);if(y-h<bottomY&&pages[pages.length-1].length){pages.push([]);y=topY;}pages[pages.length-1].push({line,y});y-=h;}
  const fontFor=l=>(l.font==='C'?(l.bold?'/F4':'/F3'):(l.bold?'/F2':'/F1'));
  const contents=pages.map((items,idx)=>{
    const ops=['0.4 g','BT /F1 7.5 Tf '+margin+' 36 Td ('+taxPdfEscape('H38 Business Office - CPA Package '+year+' - Page '+(idx+1)+' of '+pages.length)+') Tj ET','0 g'];
    for(const {line,y:ly} of items){if(!line.t)continue;ops.push('BT '+fontFor(line)+' '+line.size+' Tf '+margin+' '+ly+' Td ('+taxPdfEscape(line.t)+') Tj ET');}
    return ops.join('\n');
  });
  const objects=[];
  objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
  const kids=contents.map((_,i)=>String(7+i*2)+' 0 R').join(' ');
  objects[2]='<< /Type /Pages /Kids ['+kids+'] /Count '+contents.length+' >>';
  objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[4]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
  objects[5]='<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>';
  objects[6]='<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>';
  contents.forEach((content,i)=>{
    objects[7+i*2]='<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+pageW+' '+pageH+'] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> >> /Contents '+(8+i*2)+' 0 R >>';
    objects[8+i*2]='<< /Length '+content.length+' >>\nstream\n'+content+'\nendstream';
  });
  let pdf='%PDF-1.4\n';const offsets=[0];
  for(let n=1;n<objects.length;n++){offsets[n]=pdf.length;pdf+=n+' 0 obj\n'+objects[n]+'\nendobj\n';}
  const xrefPos=pdf.length;
  pdf+='xref\n0 '+objects.length+'\n0000000000 65535 f \n';
  for(let n=1;n<objects.length;n++)pdf+=String(offsets[n]).padStart(10,'0')+' 00000 n \n';
  pdf+='trailer\n<< /Size '+objects.length+' /Root 1 0 R >>\nstartxref\n'+xrefPos+'\n%%EOF';
  return pdf;
}

function downloadCpaPackagePdf(year){
  year=year==null?cpaPackageYear():year;
  try{
    const text=cpaPdfString(year);
    const bytes=new Uint8Array(text.length);
    for(let i=0;i<text.length;i++)bytes[i]=text.charCodeAt(i)&0xff;
    const blob=new Blob([bytes],{type:'application/pdf'});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;anchor.download='H38-CPA-Package-'+year+'.pdf';
    document.body.appendChild(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
    toast('CPA package PDF downloaded. Give it to your accountant for verification and filing.');
  }catch(error){
    toast('CPA package export failed: '+(error&&error.message?error.message:String(error)),true);
  }
}
window.downloadCpaPackagePdf=downloadCpaPackagePdf;

window.H38CpaPackage={
  version:'20261011-cpa-package-1',
  generate:function(year){return downloadCpaPackagePdf(year==null?cpaPackageYear():year);},
  data:cpaPackageData,
  balanceSheet:cpaBalanceSheet,
  cashFlow:cpaCashFlow,
  salesTax:cpaSalesTax,
  missingDocs:cpaMissingDocs
};

/* ---------- Wire into the Tax Center page ----------
 * RenderTaxPrep (app-19.js) is wrapped so the CPA card renders right after
 * the Accountant Tax Packet card. Same pattern as accounting-workspace.js. */

(function cpaPackageInit(){
  if(typeof window==='undefined')return;
  function install(){
    const orig=window.renderTaxPrep;
    if(typeof orig!=='function'){setTimeout(install,500);return;}
    window.renderTaxPrep=function(){
      orig.apply(this,arguments);
      try{
        const anchor=document.getElementById('h38-tax-packet');
        if(anchor&&!document.getElementById('h38-cpa-package'))anchor.insertAdjacentHTML('afterend',cpaPackageSection());
        else if(!document.getElementById('h38-cpa-package')){
          const grid=document.querySelector('#mainContent .grid');
          if(grid)grid.insertAdjacentHTML('beforeend',cpaPackageSection());
        }
        bindCpaPackage();
      }catch(e){if(typeof console!=='undefined')console.warn('CPA package section:',e&&e.message||e);}
    };
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);
  else install();
})();
