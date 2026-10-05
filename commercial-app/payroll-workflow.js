/* H38 Payroll Workflow — tax estimates, pay stubs, exports.
 * All tax figures are ESTIMATES for planning only. The Office never files
 * returns or moves funds. Consult an accountant or payroll service for filings.
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

/* ---------- Tax tables (2026 estimates) ---------- */
const H38_TAX = {
  // Standard deduction (annual, estimate)
  standardDeduction:{single:15000, married:30000, head:22500},
  // Value of one classic W-4 allowance (annual)
  allowanceValue: 4400,
  // Federal brackets 2026 estimate [top, rate] — single filer baseline
  federalBrackets:[
    [11925,0.10],[48475,0.12],[103350,0.22],[197300,0.24],[250525,0.32],[626350,0.35],[Infinity,0.37]
  ],
  federalBracketsMarried:[
    [23850,0.10],[96950,0.12],[206700,0.22],[394600,0.24],[501050,0.32],[751600,0.35],[Infinity,0.37]
  ],
  // FICA
  ssRate:0.062, ssWageBase:184500,
  medicareRate:0.0145, medicareExtraRate:0.009, medicareExtraThreshold:200000,
  // Minnesota 2026 estimate — single brackets [top, rate]
  mnBrackets:[
    [31690,0.0535],[104090,0.068],[193240,0.0785],[Infinity,0.0985]
  ],
  // Employer
  futaRate:0.006, futaWageBase:7000,
  sutaRate:0.02, sutaWageBase:43000 // MN 2026 approx; configurable per business
};

function h38BracketTax(taxable, brackets){
  let tax=0, prev=0;
  for(const [top,rate] of brackets){
    if(taxable<=prev)break;
    tax+=(Math.min(taxable,top)-prev)*rate;
    prev=top;
  }
  return tax;
}

/* Estimate federal withholding for one pay period.
 * method: annualize gross -> subtract standard deduction + allowances -> bracket -> divide by periods */
function h38EstimateFederal(grossPay, employee, periodsPerYear){
  const filing=String(v(employee,'Filing Status')||'Single').toLowerCase();
  const married=filing.includes('married');
  const annual=grossPay*periodsPerYear;
  const deduction=(married?H38_TAX.standardDeduction.married:H38_TAX.standardDeduction.single)
    + num(v(employee,'Withholding Allowances'))*H38_TAX.allowanceValue;
  const taxable=Math.max(0, annual-deduction);
  const brackets=married?H38_TAX.federalBracketsMarried:H38_TAX.federalBrackets;
  const annualTax=h38BracketTax(taxable,brackets);
  return Math.max(0, annualTax/periodsPerYear + num(v(employee,'Extra Withholding')));
}

function h38EstimateFICA(grossPay, ytdGross){
  const ssTaxable=Math.max(0, Math.min(grossPay, H38_TAX.ssWageBase-Math.max(0,ytdGross)));
  const ss=ssTaxable*H38_TAX.ssRate;
  const medBase=grossPay*H38_TAX.medicareRate;
  const extraBase=Math.max(0, (ytdGross+grossPay)-H38_TAX.medicareExtraThreshold);
  const extraAlready=Math.max(0, ytdGross-H38_TAX.medicareExtraThreshold);
  const medExtra=Math.max(0,extraBase-extraAlready)*H38_TAX.medicareExtraRate;
  return {ss:Math.round(ss*100)/100, medicare:Math.round((medBase+medExtra)*100)/100};
}

function h38EstimateMNState(grossPay, employee, periodsPerYear){
  const annual=grossPay*periodsPerYear;
  const deduction=H38_TAX.standardDeduction.single
    + num(v(employee,'Withholding Allowances'))*H38_TAX.allowanceValue;
  const taxable=Math.max(0, annual-deduction);
  const annualTax=h38BracketTax(taxable,H38_TAX.mnBrackets);
  return Math.max(0, annualTax/periodsPerYear);
}

function h38PayFrequencyPeriods(freq){
  const f=String(freq||'Biweekly').toLowerCase();
  if(f.includes('week')&&!f.includes('bi'))return 52;
  if(f.includes('biweek'))return 26;
  if(f.includes('semimonth'))return 24;
  if(f.includes('month'))return 12;
  return 26;
}

/* Full per-employee payroll calculation. Returns a line object. */
function h38CalculatePaycheck(employee, regularHours, overtimeHours, ytd){
  const rate=num(v(employee,'Hourly Rate'));
  const salary=String(v(employee,'Pay Type')).toLowerCase()==='salary'?num(v(employee,'Salary Rate')):0;
  const otMult=num(v(employee,'Overtime Multiplier'))||1.5;
  const regularPay=Math.round(regularHours*rate*100)/100;
  const overtimePay=Math.round(overtimeHours*rate*otMult*100)/100;
  const grossPay=Math.round((regularPay+overtimePay+salary)*100)/100;
  const periods=h38PayFrequencyPeriods(v(employee,'Pay Frequency'));
  const ytdGross=num(ytd&&ytd.gross)||0;

  const federal=Math.round(h38EstimateFederal(grossPay,employee,periods)*100)/100;
  const fica=h38EstimateFICA(grossPay,ytdGross);
  const state=Math.round(h38EstimateMNState(grossPay,employee,periods)*100)/100;
  const totalDeductions=Math.round((federal+fica.ss+fica.medicare+state)*100)/100;
  const netPay=Math.round((grossPay-totalDeductions)*100)/100;

  // Employer cost
  const empSS=Math.round(Math.min(grossPay,Math.max(0,H38_TAX.ssWageBase-ytdGross))*H38_TAX.ssRate*100)/100;
  const empMed=Math.round(grossPay*H38_TAX.medicareRate*100)/100;
  const futaTaxable=Math.max(0,Math.min(grossPay,H38_TAX.futaWageBase-ytdGross));
  const futa=Math.round(futaTaxable*H38_TAX.futaRate*100)/100;
  const sutaTaxable=Math.max(0,Math.min(grossPay,H38_TAX.sutaWageBase-ytdGross));
  const suta=Math.round(sutaTaxable*H38_TAX.sutaRate*100)/100;
  const employerTax=Math.round((empSS+empMed+futa+suta)*100)/100;
  const employerCost=Math.round((grossPay+employerTax)*100)/100;

  return {
    regularHours:Math.round(regularHours*100)/100, overtimeHours:Math.round(overtimeHours*100)/100,
    hourlyRate:rate, regularPay, overtimePay, salaryPay:Math.round(salary*100)/100,
    grossPay, federalWithholding:federal, socialSecurity:fica.ss, medicare:fica.medicare,
    stateWithholding:state, totalDeductions, netPay,
    employerSS:empSS, employerMedicare:empMed, futa, suta,
    employerTax, employerCost,
    ytdGross:ytdGross+grossPay,
    ytdFederal:Math.round(((ytd&&ytd.federal)||0)+federal*100)/100,
    ytdSS:Math.round(((ytd&&ytd.ss)||0)+fica.ss*100)/100,
    ytdMedicare:Math.round(((ytd&&ytd.medicare)||0)+fica.medicare*100)/100,
    ytdState:Math.round(((ytd&&ytd.state)||0)+state*100)/100,
    ytdNet:Math.round(((ytd&&ytd.net)||0)+netPay*100)/100
  };
}

/* Group time entries by ISO week (Mon-Sun) for overtime calc */
function h38WeekKey(dateStr){
  const d=new Date(String(dateStr).slice(0,10)+'T12:00:00');
  const day=(d.getDay()+6)%7; // Monday=0
  d.setDate(d.getDate()-day);
  return d.toISOString().slice(0,10);
}

/* ---------- Pay stub HTML (print-friendly) ---------- */
function h38PayStubHTML(business, employee, period, line){
  const empName=esc(v(employee,'Display Name')||'Employee');
  const bizName=esc(v(business,'businessName','name','Name')||'Highway 38 Business Office');
  const periodLabel=`${esc(dateOnly(v(period,'Period Start')))} – ${esc(dateOnly(v(period,'Period End')))}`;
  const row=(label,cur,ytd)=>`<tr><td>${label}</td><td class="r">${money(cur)}</td><td class="r">${money(ytd)}</td></tr>`;
  return `<div class="paystub">
    <div class="paystub-head"><div><h2>${bizName}</h2><p class="muted">Pay Stub — ESTIMATE. Not an official tax document.</p></div>
    <div class="r"><strong>Pay Date</strong><br>${esc(dateOnly(v(period,'Pay Date')))}</div></div>
    <div class="paystub-meta"><div><strong>Employee:</strong> ${empName}<br><strong>Filing status:</strong> ${esc(v(employee,'Filing Status')||'Single')}</div>
    <div><strong>Pay period:</strong> ${periodLabel}<br><strong>Pay type:</strong> ${esc(v(employee,'Pay Type')||'Hourly')}</div></div>
    <table class="paystub-table"><thead><tr><th>Earnings</th><th class="r">Current</th><th class="r">YTD</th></tr></thead><tbody>
    ${row(`Regular (${num(v(line,'Regular Hours')).toFixed(2)} hrs @ ${money(v(line,'Hourly Rate'))})`,v(line,'Regular Pay'),'') }
    ${num(v(line,'Overtime Hours'))>0?row(`Overtime (${num(v(line,'Overtime Hours')).toFixed(2)} hrs)`,v(line,'Overtime Pay'),'') :''}
    ${num(v(line,'Salary Pay'))>0?row('Salary',v(line,'Salary Pay'),'') :''}
    <tr class="total"><td><strong>Gross Pay</strong></td><td class="r"><strong>${money(v(line,'Gross Pay'))}</strong></td><td class="r"><strong>${money(v(line,'YTD Gross'))}</strong></td></tr>
    </tbody></table>
    <table class="paystub-table"><thead><tr><th>Deductions (estimated)</th><th class="r">Current</th><th class="r">YTD</th></tr></thead><tbody>
    ${row('Federal income tax',v(line,'Federal Withholding'),v(line,'YTD Federal'))}
    ${row('Social Security (6.2%)',v(line,'Social Security'),v(line,'YTD SS'))}
    ${row('Medicare (1.45%)',v(line,'Medicare'),v(line,'YTD Medicare'))}
    ${row('MN state tax',v(line,'State Withholding'),v(line,'YTD State'))}
    <tr class="total"><td><strong>Total Deductions</strong></td><td class="r"><strong>${money(v(line,'Total Deductions'))}</strong></td><td class="r"></td></tr>
    </tbody></table>
    <div class="paystub-net"><span><strong>Net Pay</strong></span><span><strong>${money(v(line,'Net Pay'))}</strong></span></div>
    <p class="muted small paystub-disc">Tax figures are estimates for planning only and are not a substitute for a payroll tax service. Consult your accountant before filing.</p>
  </div>`;
}

/* ---------- CSV export (for bank / accountant) ---------- */
function h38PayrollCSV(period, lines, employees){
  const head='Employee,Employee ID,Regular Hours,Overtime Hours,Gross Pay,Federal WH,Social Security,Medicare,State WH,Total Deductions,Net Pay,Pay Date';
  const rows=lines.map(line=>{
    const emp=employees.find(e=>rowId(e,'Employee ID')===v(line,'Employee ID'));
    const name=(v(emp,'Display Name')||v(line,'Employee ID')||'').replace(/,/g,' ');
    return [name,v(line,'Employee ID'),v(line,'Regular Hours'),v(line,'Overtime Hours'),v(line,'Gross Pay'),v(line,'Federal Withholding'),v(line,'Social Security'),v(line,'Medicare'),v(line,'State Withholding'),v(line,'Total Deductions'),v(line,'Net Pay'),v(period,'Pay Date')].join(',');
  });
  return head+'\n'+rows.join('\n');
}

/* ---------- NACHA export (PPD direct deposit) ---------- */
function h38Pad(str,len,padChar,left){
  str=String(str==null?'':str).slice(0,len);
  while(str.length<len)str=left?padChar+str:str+padChar;
  return str;
}
function h38NachaDate(dateStr){
  const d=dateStr?String(dateStr).slice(0,10):new Date().toISOString().slice(0,10);
  return d.replace(/-/g,'').slice(2); // YYMMDD
}
/* Generate a NACHA PPD file for direct deposit credits.
 * employee bank fields: 'Bank Routing', 'Bank Account', 'Account Type' (checking/savings) */
function h38PayrollNACHA(business, period, lines, employees){
  const L=[];
  const bizName=h38Pad(v(business,'businessName','name','Name')||'H38 Business',16,' ',false).toUpperCase();
  const bizName23=h38Pad(v(business,'businessName','name','Name')||'H38 Business',23,' ',false).toUpperCase();
  const bizId=h38Pad(String(v(business,'ein','EIN')||'123456789').replace(/\D/g,''),9,'0',true);
  const effDate=h38NachaDate(v(period,'Pay Date'));
  const nowD=new Date();
  const yy=String(nowD.getFullYear()).slice(2);
  const fileDate=yy+h38Pad(nowD.getMonth()+1,2,'0',true)+h38Pad(nowD.getDate(),2,'0',true);
  const fileTime=h38Pad(nowD.getHours(),2,'0',true)+h38Pad(nowD.getMinutes(),2,'0',true);
  const destDfi='121042882'; // placeholder — replace with bank's routing
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
