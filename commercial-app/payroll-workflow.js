/* H38 Payroll Workflow — presentation + exports for STORED payroll lines.
 * WS3 (2026-10-20): all tax math moved to payroll-calc.js and all run
 * building to payroll-run.js. The legacy estimators (H38_TAX,
 * h38EstimateFederal/FICA/MNState, h38BracketTax, h38CalculatePaycheck) and
 * the weekly-40 OT helper (h38WeekKey) are DELETED — withholding is computed
 * once, at run build time, from the Pub. 15-T (2026) tables, and stored on
 * the payroll lines. Everything here only READS stored line fields for pay
 * stubs, paycheck sheets, CSV and NACHA export.
 * All tax figures on a run are estimates until the owner confirms them
 * (run header 'Estimates Confirmed Time'). The Office never files returns
 * or moves funds. Consult an accountant or payroll service for filings.
 * Build: 20261020-payroll-presentation-1
 */

'use strict';

/* ---------- Download helper ---------- */
function h38DownloadFile(filename, content, mimeType){
  const blob=new Blob([content],{type:mimeType||'text/plain'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();
  setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},500);
}

function h38PayFrequencyPeriods(freq){
  if(window.H38_PAYROLL_CALC)return window.H38_PAYROLL_CALC.periodsPerYear(freq);
  const f=String(freq||'Biweekly').toLowerCase();
  if(f.includes('biweek'))return 26;
  if(f.includes('semimonth'))return 24;
  if(f.includes('month'))return 12;
  if(f.includes('week'))return 52;
  return 26;
}

/* ---------- Pay stub HTML (print-friendly) — reads stored line fields ---------- */
function h38PayStubHTML(business, employee, period, line){
  const empName=esc(v(employee,'Display Name')||'Employee');
  const bizName=esc(v(business,'businessName','name','Name')||'Highway 38 Business Office');
  const periodLabel=`${esc(dateOnly(v(period,'Period Start')))} – ${esc(dateOnly(v(period,'Period End')))}`;
  const confirmed=!!v(period,'Estimates Confirmed Time');
  const snap=v(period,'Tax Config Snapshot');
  const configSource=(snap&&(snap.federal&&snap.federal.source||snap.Sources&&(snap.Sources.federal||snap.Sources.fica)))||'';
  const row=(label,cur,ytd)=>`<tr><td>${label}</td><td class="r">${money(cur)}</td><td class="r">${money(ytd)}</td></tr>`;
  const dedDetail=Array.isArray(v(line,'Deductions Detail'))?v(line,'Deductions Detail'):[];
  const reimb=num(v(line,'Reimbursements'));
  return `<div class="paystub">
    <div class="paystub-head"><div><h2>${bizName}</h2><p class="muted">${confirmed?'Pay Stub':'Pay Stub — ESTIMATE. Not an official tax document.'}</p></div>
    <div class="r"><strong>Pay Date</strong><br>${esc(dateOnly(v(period,'Pay Date')))}</div></div>
    <div class="paystub-meta"><div><strong>Employee:</strong> ${empName}<br><strong>Filing status:</strong> ${esc(v(employee,'Filing Status')||'Single')}</div>
    <div><strong>Pay period:</strong> ${periodLabel}<br><strong>Pay type:</strong> ${esc(v(employee,'Pay Type')||'Hourly')}</div></div>
    ${v(line,'Contractor')?'<p class="muted small"><strong>Contractor — 1099 path.</strong> No withholding was taken from this payment.</p>':''}
    <table class="paystub-table"><thead><tr><th>Earnings</th><th class="r">Current</th><th class="r">YTD</th></tr></thead><tbody>
    ${row(`Regular (${num(v(line,'Regular Hours')).toFixed(2)} hrs @ ${money(v(line,'Hourly Rate'))})`,v(line,'Regular Pay'),'') }
    ${num(v(line,'Overtime Hours'))>0?row(`Overtime (${num(v(line,'Overtime Hours')).toFixed(2)} hrs)`,v(line,'Overtime Pay'),'') :''}
    ${num(v(line,'Salary Pay'))>0?row('Salary',v(line,'Salary Pay'),'') :''}
    ${reimb>0?row('Reimbursements (not taxed)',reimb,''):''}
    <tr class="total"><td><strong>Gross Pay</strong></td><td class="r"><strong>${money(v(line,'Gross Pay'))}</strong></td><td class="r"><strong>${money(v(line,'YTD Gross'))}</strong></td></tr>
    </tbody></table>
    <table class="paystub-table"><thead><tr><th>Deductions (estimated)</th><th class="r">Current</th><th class="r">YTD</th></tr></thead><tbody>
    ${row('Federal income tax',v(line,'Federal Withholding'),v(line,'YTD Federal'))}
    ${row('Social Security (6.2%)',v(line,'Social Security'),v(line,'YTD SS'))}
    ${row('Medicare (1.45%)',v(line,'Medicare'),v(line,'YTD Medicare'))}
    ${num(v(line,'Additional Medicare'))>0?row('Additional Medicare (0.9%)',v(line,'Additional Medicare'),''):''}
    ${row('MN state tax',v(line,'State Withholding'),v(line,'YTD State'))}
    ${num(v(line,'Other Withholding'))>0?row('Other withholding',v(line,'Other Withholding'),''):''}
    ${dedDetail.map(d=>row(esc(d.name||'Deduction')+(d.kind==='pre-tax'?' (pre-tax)':' (post-tax)'),d.amount,'')).join('')}
    <tr class="total"><td><strong>Total Deductions</strong></td><td class="r"><strong>${money(v(line,'Total Deductions'))}</strong></td><td class="r"></td></tr>
    </tbody></table>
    <div class="paystub-net"><span><strong>Net Pay</strong></span><span><strong>${money(v(line,'Net Pay'))}</strong></span></div>
    <p class="muted small paystub-disc">Tax figures are estimates for planning only and are not a substitute for a payroll tax service. Consult your accountant before filing.${confirmed&&configSource?` Withholding tables: ${esc(configSource)}`:''}</p>
  </div>`;
}

/* ---------- Amount in words (check face) ---------- */
function h38AmountToWords(amount){
  const ones=['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const scales=['','Thousand','Million','Billion'];
  const totalCents=Math.round(Math.abs(num(amount))*100);
  let dollars=Math.floor(totalCents/100);
  const centPart=totalCents%100;
  function threeDigits(n){
    const parts=[];
    const hundreds=Math.floor(n/100), rest=n%100;
    if(hundreds)parts.push(ones[hundreds]+' Hundred');
    if(rest>=20){parts.push(tens[Math.floor(rest/10)]+(rest%10?' '+ones[rest%10]:''));}
    else if(rest>0){parts.push(ones[rest]);}
    return parts.join(' ');
  }
  let words='';
  if(dollars===0)words='Zero';
  else{
    const chunks=[];
    let d=dollars,scale=0;
    while(d>0){chunks.push({n:d%1000,scale});d=Math.floor(d/1000);scale++;}
    words=chunks.reverse().map(c=>c.n?threeDigits(c.n)+(scales[c.scale]?' '+scales[c.scale]:''):'').filter(Boolean).join(' ');
  }
  return `${words} and ${String(centPart).padStart(2,'0')}/100 Dollars`;
}

/* ---------- Paycheck sheet: check face (for bank-supplied check-on-top
 * stock) + earnings stub below. The Office prints ONLY the variable fields.
 * The MICR line, bank name, routing and account numbers are pre-printed on
 * the business's bank stock — the Office never prints them. ---------- */
function h38PaycheckSheetHTML(business, employee, period, line, check){
  const empName=esc(v(employee,'Display Name')||v(check,'Payee Name')||'Employee');
  const payDate=esc(dateOnly(v(period,'Pay Date')||v(check,'Check Date')));
  const amount=num(v(line,'Net Pay'));
  const amountFig='$'+amount.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const amountWords=esc(h38AmountToWords(amount))+' ****';
  const memo=esc(`Payroll ${dateOnly(v(period,'Period Start'))} – ${dateOnly(v(period,'Period End'))}`);
  const ox=Number(v(check,'Offset X Mm'))||0, oy=Number(v(check,'Offset Y Mm'))||0;
  const stub=h38PayStubHTML(business,employee,period,line);
  return `<section class="paycheck-sheet">
    <div class="paycheck-face"><div class="paycheck-cal" style="transform:translate(${ox}mm,${oy}mm)">
      <div class="paycheck-date"><span class="paycheck-flabel">Date</span> ${payDate}</div>
      <div class="paycheck-payee">${empName}</div>
      <div class="paycheck-amount"><strong>${amountFig}</strong></div>
      <div class="paycheck-words">${amountWords}</div>
      <div class="paycheck-memo"><span class="paycheck-flabel">Memo</span> ${memo}</div>
      <div class="paycheck-sig"><div class="paycheck-sigline"></div><span class="paycheck-flabel">Authorized signature — sign by hand</span></div>
    </div></div>
    <div class="paycheck-stubhead"><span><strong>Pay stub</strong> · Check #${esc(v(check,'Check Number'))} · Pay date ${payDate}</span><span>Keep for your records</span></div>
    ${stub}
  </section>`;
}

/* ---------- CSV export (for bank / accountant) — stored line fields ---------- */
function h38PayrollCSV(period, lines, employees){
  const head='Employee,Employee ID,Regular Hours,Overtime Hours,Gross Pay,Federal WH,Social Security,Medicare,Additional Medicare,State WH,Other WH,Employee Deductions,Reimbursements,Total Deductions,Net Pay,Pay Date';
  const rows=lines.map(line=>{
    const emp=employees.find(e=>rowId(e,'Employee ID')===v(line,'Employee ID'));
    const name=(v(emp,'Display Name')||v(line,'Employee ID')||'').replace(/,/g,' ');
    const dedDetail=Array.isArray(v(line,'Deductions Detail'))?v(line,'Deductions Detail'):[];
    const dedTotal=dedDetail.reduce((s,d)=>s+num(d.amount),0);
    return [name,v(line,'Employee ID'),v(line,'Regular Hours'),v(line,'Overtime Hours'),v(line,'Gross Pay'),v(line,'Federal Withholding'),v(line,'Social Security'),v(line,'Medicare'),v(line,'Additional Medicare'),v(line,'State Withholding'),v(line,'Other Withholding'),Math.round(dedTotal*100)/100,v(line,'Reimbursements'),v(line,'Total Deductions'),v(line,'Net Pay'),v(period,'Pay Date')].join(',');
  });
  return head+'\n'+rows.join('\n');
}

/* ---------- NACHA export (PPD direct deposit) — FAILS CLOSED ----------
 * The destination routing number and the business EIN are owner-entered
 * config on the business record ('Bank Routing' + 'EIN'). There are NO
 * placeholder values: when either is absent the export throws and the UI
 * prompts for settings instead of producing a file with fake numbers. */
function h38Pad(str,len,padChar,left){
  str=String(str==null?'':str).slice(0,len);
  while(str.length<len)str=left?padChar+str:str+padChar;
  return str;
}
function h38NachaDate(dateStr){
  const d=dateStr?String(dateStr).slice(0,10):new Date().toISOString().slice(0,10);
  return d.replace(/-/g,'').slice(2); // YYMMDD
}
function h38BusinessBankConfig(business){
  const routing=String(v(business,'Bank Routing','bankRouting','Routing Number')||'').replace(/\D/g,'');
  const ein=String(v(business,'ein','EIN','Tax ID','Federal EIN')||'').replace(/\D/g,'');
  return {routing,ein,ok:routing.length===9&&ein.length===9};
}
/* Generate a NACHA PPD file for direct deposit credits.
 * employee bank fields: 'Bank Routing', 'Bank Account', 'Account Type' (checking/savings) */
function h38PayrollNACHA(business, period, lines, employees){
  const bank=h38BusinessBankConfig(business);
  if(!bank.ok){
    throw new Error('NACHA export is blocked: add the business bank routing number and EIN in business settings first. The Office never uses placeholder bank numbers.');
  }
  const L=[];
  const bizName=h38Pad(v(business,'businessName','name','Name')||'H38 Business',16,' ',false).toUpperCase();
  const bizName23=h38Pad(v(business,'businessName','name','Name')||'H38 Business',23,' ',false).toUpperCase();
  const bizId=h38Pad(bank.ein,9,'0',true);
  const effDate=h38NachaDate(v(period,'Pay Date'));
  const nowD=new Date();
  const yy=String(nowD.getFullYear()).slice(2);
  const fileDate=yy+h38Pad(nowD.getMonth()+1,2,'0',true)+h38Pad(nowD.getDate(),2,'0',true);
  const fileTime=h38Pad(nowD.getHours(),2,'0',true)+h38Pad(nowD.getMinutes(),2,'0',true);
  const destDfi=bank.routing; // owner-entered destination routing (9 digits)
  const originDfi=h38Pad(destDfi.slice(0,8),8,'0',true);
  // File Header Record (1) — 94 chars
  L.push('1'+'01'+h38Pad(destDfi,9,' ',false)+h38Pad(originDfi+'0',9,' ',false)
    +fileDate+fileTime+'A'+'094'+'10'+'1'
    +h38Pad('H38 PAYROLL',23,' ',false)+bizName23+' '.repeat(8)+'  ');
  // Batch Header Record (5) — 94 chars
  const batchNum='0000001';
  L.push('5'+'225'+bizName+' '.repeat(20)+h38Pad(bizId,10,' ',false)+'PPD'
    +h38Pad('PAYROLL',10,' ',false)+' '.repeat(6)+effDate+'   '+'1'+originDfi+batchNum);
  let entryCount=0,totalDebit=0,totalCredit=0,entryHash=0;
  const traceBase=Number(String(Date.now()).slice(-7));
  lines.forEach((line,idx)=>{
    const emp=employees.find(e=>rowId(e,'Employee ID')===v(line,'Employee ID'))||{};
    const routing=String(v(emp,'Bank Routing')||'').replace(/\D/g,'');
    const account=h38Pad(v(emp,'Bank Account')||'',17,' ',false);
    if(!routing||routing.length!==9)return; // skip without valid routing
    const acctType=String(v(emp,'Account Type')||'checking').toLowerCase().startsWith('s')?'32':'22';
    const amountCents=Math.round(num(v(line,'Net Pay'))*100);
    if(amountCents<=0)return;
    const empName=h38Pad(v(emp,'Display Name')||'Employee',22,' ',false).toUpperCase();
    const empId=h38Pad(v(emp,'Employee ID')||'',15,' ',false);
    entryCount++;totalCredit+=amountCents;entryHash+=Number(routing.slice(0,8));
    const trace=originDfi+h38Pad(traceBase+idx,7,'0',true);
    // Entry Detail Record (6) — 94 chars
    L.push('6'+acctType+routing.slice(0,8)+routing.slice(8,9)+account
      +h38Pad(amountCents,10,'0',true)+empId+empName+'  '+'1'+trace);
    // Addenda Record (7) — 94 chars
    L.push('7'+'05'+h38Pad('PAYROLL '+effDate,80,' ',false)+'0001'+h38Pad(traceBase+idx,7,'0',true));
  });
  entryHash=entryHash%10000000000;
  const addendaCount=entryCount; // one addenda per entry
  const totalRecords=entryCount+addendaCount;
  // Batch Control Record (8) — 94 chars
  L.push('8'+'225'+h38Pad(totalRecords,6,'0',true)+h38Pad(entryHash,10,'0',true)
    +h38Pad(totalDebit,12,'0',true)+h38Pad(totalCredit,12,'0',true)
    +h38Pad(bizId,10,' ',false)+' '.repeat(19)+' '.repeat(6)+originDfi+batchNum);
  // File Control Record (9) — 94 chars
  const blockCount=Math.ceil((L.length+1)/10);
  L.push('9'+h38Pad(1,6,'0',true)+h38Pad(blockCount,6,'0',true)+h38Pad(totalRecords,8,'0',true)
    +h38Pad(entryHash,10,'0',true)+h38Pad(totalDebit,12,'0',true)+h38Pad(totalCredit,12,'0',true)+' '.repeat(39));
  // Block fill to multiple of 10
  while(L.length%10!==0)L.push('9'.repeat(94));
  return L.join('\n');
}
