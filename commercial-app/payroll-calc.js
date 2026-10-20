/* H38 Payroll Calc — pure withholding math (WS3, 2026-10-20).
 * Implements IRS Pub. 15-T (2026) Percentage Method (Worksheet 1A, automated
 * tables), FICA per IRS Topic 751 / SSA 2026 wage base, and the Minnesota
 * percentage method — all from payroll-tax-tables-2026.md.
 * Federal + FICA ship ENABLED with verified tables. Minnesota and FUTA/SUTA
 * ship DISABLED (UNVERIFIED figures) until the owner confirms the section in
 * Payroll Settings; a disabled section computes 0 with a review flag, never
 * a guessed number.
 * Money discipline: integer cents internally; every component is rounded
 * ONCE, half-up to cents, at the line level. Run totals are sums of rounded
 * line values. No DOM, no state, no globals beyond the frozen export.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.H38_PAYROLL_CALC=Object.freeze(api);
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const VERSION='20261020-payroll-calc-1';

  /* ---------- money helpers (integer cents, round half-up once) ---------- */
  function toCents(v){const n=Number(v||0);if(!Number.isFinite(n))throw new Error('Amount must be a finite number.');const s=n<0?-1:1;return s*Math.floor(Math.abs(n)*100+0.5+1e-9);}
  function fromCents(c){return Math.round(Number(c||0))/100;}
  function roundCents(v){return fromCents(toCents(v));}
  function sumCents(values){return (values||[]).reduce((s,x)=>s+toCents(x),0);}

  /* ---------- percentage-method tables ----------
   * Row: [atLeast, butLessThan (null = no cap), baseTax, rateOnExcess, excessOver]
   * Federal: IRS Pub. 15-T (2026), Annual Percentage Method Tables for
   * Automated Payroll Systems — VERIFIED (official), accessed 2026-10-20. */
  const FED_STANDARD={
    mfj:[[0,19300,0,0,0],[19300,44100,0,0.10,19300],[44100,120100,2480,0.12,44100],[120100,230700,11600,0.22,120100],[230700,422850,35932,0.24,230700],[422850,531750,82048,0.32,422850],[531750,788000,116896,0.35,531750],[788000,null,206583.50,0.37,788000]],
    single:[[0,7500,0,0,0],[7500,19900,0,0.10,7500],[19900,57900,1240,0.12,19900],[57900,113200,5800,0.22,57900],[113200,209275,17966,0.24,113200],[209275,263725,41024,0.32,209275],[263725,648100,58448,0.35,263725],[648100,null,192979.25,0.37,648100]],
    hoh:[[0,15550,0,0,0],[15550,33250,0,0.10,15550],[33250,83000,1770,0.12,33250],[83000,121250,7740,0.22,83000],[121250,217300,16155,0.24,121250],[217300,271750,39207,0.32,217300],[271750,656150,56631,0.35,271750],[656150,null,191171.00,0.37,656150]]
  };
  const FED_STEP2={
    mfj:[[0,16100,0,0,0],[16100,28500,0,0.10,16100],[28500,66500,1240,0.12,28500],[66500,121800,5800,0.22,66500],[121800,217875,17966,0.24,121800],[217875,272325,41024,0.32,217875],[272325,400450,58448,0.35,272325],[400450,null,103291.75,0.37,400450]],
    single:[[0,8050,0,0,0],[8050,14250,0,0.10,8050],[14250,33250,620,0.12,14250],[33250,60900,2900,0.22,33250],[60900,108938,8983,0.24,60900],[108938,136163,20512,0.32,108938],[136163,328350,29224,0.35,136163],[328350,null,96489.63,0.37,328350]],
    hoh:[[0,12075,0,0,0],[12075,20925,0,0.10,12075],[20925,45800,885,0.12,20925],[45800,64925,3870,0.22,45800],[64925,112950,8077.50,0.24,64925],[112950,140175,19603.50,0.32,112950],[140175,332375,28315.50,0.35,140175],[332375,null,95585.50,0.37,332375]]
  };
  /* Minnesota percentage tables 2026 — CORROBORATED (vendor sources only,
   * UNVERIFIED against the MN Revenue booklet). Disabled until confirmed. */
  const MN_TABLES={
    single:[[0,4700,0,0,0],[4700,38010,0,0.0535,4700],[38010,114130,1782,0.068,38010],[114130,207850,6958,0.0785,114130],[207850,null,14315,0.0985,207850]],
    married:[[0,14700,0,0,0],[14700,63400,0,0.0535,14700],[63400,208180,2605,0.068,63400],[208180,352630,12450,0.0785,208180],[352630,null,23790,0.0985,352630]]
  };

  const DEFAULT_CONFIG={
    taxYear:2026,
    federal:{enabled:true,builtInMFJ:12900,builtInOther:8600,pre2020AllowanceValue:4300,
      source:'IRS Pub. 15-T (2026), verified 2026-10-20',
      tables:{standard:FED_STANDARD,step2:FED_STEP2}},
    fica:{enabled:true,ssRate:0.062,ssWageBase:184500,medicareRate:0.0145,additionalRate:0.009,
      additionalWithholdingThreshold:200000,
      source:'IRS Topic 751 + SSA 2026 wage base, verified 2026-10-20'},
    minnesota:{enabled:false,confirmed:false,allowanceValue:5300,
      source:'UNVERIFIED — confirm MN Revenue booklet',
      tables:MN_TABLES,
      paidLeave:{enabled:false,employeeRate:0,employerRate:0,wageCap:184500}},
    employer:{futaEnabled:false,futaRate:0.006,futaWageBase:7000,
      sutaEnabled:false,sutaRate:null,sutaWageBase:null,stateOtherRate:0,
      source:'UNVERIFIED — owner confirms FUTA/SUTA with CPA / MN DEED'}
  };

  function isPlain(o){return o&&typeof o==='object'&&!Array.isArray(o);}
  function clone(v){return v==null||typeof v!=='object'?v:Array.isArray(v)?v.map(clone):Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clone(x)]));}
  function merge(base,over){const out=clone(base);if(!isPlain(over))return out;for(const k of Object.keys(over)){const o=over[k];if(isPlain(o)&&isPlain(out[k]))out[k]=merge(out[k],o);else if(o!==undefined)out[k]=clone(o);}return out;}

  /* createConfig(overrides) — overrides may use the internal shape
   * ({federal, fica, minnesota, employer}) or the stored payrollTaxConfigs
   * record shape ({'Federal','FICA','Minnesota','Employer', ...}). */
  function createConfig(overrides){
    let o=overrides||{};
    if(isPlain(o)&&(o.Federal||o.FICA||o.Minnesota||o.Employer)){
      const mapped={};
      if(isPlain(o.Federal))mapped.federal=o.Federal;
      if(isPlain(o.FICA))mapped.fica=o.FICA;
      if(isPlain(o.Minnesota)){mapped.minnesota=o.Minnesota;
        if(o['Minnesota Confirmed']===true||o.Minnesota.confirmed===true){mapped.minnesota.confirmed=true;mapped.minnesota.enabled=true;}}
      if(isPlain(o.Employer)){mapped.employer=o.Employer;
        if(o['FUTA Confirmed']===true)mapped.employer.futaEnabled=true;
        if(o['SUTA Confirmed']===true)mapped.employer.sutaEnabled=true;}
      if(o.taxYear||o['Tax Year'])mapped.taxYear=o.taxYear||o['Tax Year'];
      o=mapped;
    }
    return merge(DEFAULT_CONFIG,o);
  }
  function defaultConfig(){return clone(DEFAULT_CONFIG);}

  function periodsPerYear(frequency){
    const f=String(frequency||'').toLowerCase();
    if(f.includes('biweek'))return 26;
    if(f.includes('semimonth'))return 24;
    if(f.includes('semiannual')||f.includes('semi-annual'))return 2;
    if(f.includes('quarter'))return 4;
    if(f.includes('month'))return 12;
    if(f.includes('week'))return 52;
    if(f.includes('dail'))return 260;
    return 26;
  }
  function statusKey(filingStatus){
    const s=String(filingStatus||'Single').toLowerCase();
    if(s.includes('head'))return 'hoh';
    if(s.includes('married')||s==='mfj')return 'mfj';
    return 'single';
  }
  function bracketRow(table,amount){
    for(const row of table){if(amount>=row[0]&&(row[1]==null||amount<row[1]))return row;}
    return table[table.length-1];
  }
  function bracketTax(table,amount){
    const row=bracketRow(table,amount);
    return {row,tax:row[2]+row[3]*Math.max(0,amount-row[4])};
  }

  /* ---------- Federal — Pub. 15-T Worksheet 1A (automated) ---------- */
  function federalDetail(input,config){
    const cfg=config||createConfig();
    const periods=periodsPerYear(input.frequency);
    const gross=roundCents(input.grossWages||0);
    const key=statusKey(input.filingStatus);
    const step2=!!input.step2Checked;
    const pre2020=input.pre2020Allowances!=null;
    const annualized=roundCents(gross*periods);
    let builtIn=0,allowanceDeduction=0,adjusted,path;
    if(pre2020){
      allowanceDeduction=roundCents(Number(input.pre2020Allowances||0)*Number(cfg.federal.pre2020AllowanceValue||4300));
      adjusted=Math.max(0,roundCents(annualized+roundCents(input.step4aAnnual||0)-allowanceDeduction-roundCents(input.step4bAnnual||0)));
      path='pre-2020 W-4 (allowances)';
    }else{
      builtIn=step2?0:(key==='mfj'?Number(cfg.federal.builtInMFJ||12900):Number(cfg.federal.builtInOther||8600));
      adjusted=Math.max(0,roundCents(annualized+roundCents(input.step4aAnnual||0)-roundCents(input.step4bAnnual||0)-builtIn));
      path=step2?'2020+ W-4, Step 2 checked':'2020+ W-4, standard';
    }
    const tables=(step2&&!pre2020)?cfg.federal.tables.step2:cfg.federal.tables.standard;
    const table=tables[key]||tables.single;
    const {row,tax}=bracketTax(table,adjusted);
    const annualTax=roundCents(tax);
    const tentative=annualTax/periods;
    const creditsPerPeriod=roundCents(input.step3CreditsAnnual||0)/periods;
    const afterCredits=Math.max(0,tentative-creditsPerPeriod);
    const amount=cfg.federal.enabled===false?0:roundCents(afterCredits+roundCents(input.extraPerPeriod||0));
    return {amount,trace:{method:'Pub. 15-T Percentage Method (automated, Worksheet 1A)',path,filingStatus:key,
      periodsPerYear:periods,periodWages:gross,annualizedWages:annualized,step4aAnnual:roundCents(input.step4aAnnual||0),
      step4bAnnual:roundCents(input.step4bAnnual||0),builtInAmount:builtIn,allowanceDeduction,
      adjustedAnnualWage:adjusted,bracketRow:{atLeast:row[0],butLessThan:row[1],baseTax:row[2],rate:row[3],excessOver:row[4]},
      annualTentativeTax:annualTax,tentativePerPeriod:roundCents(tentative),
      step3CreditsAnnual:roundCents(input.step3CreditsAnnual||0),creditsPerPeriod:roundCents(creditsPerPeriod),
      extraPerPeriod:roundCents(input.extraPerPeriod||0),withholding:amount}};
  }
  function federalWithholding(input,config){
    return federalDetail(input,config).amount;
  }

  /* ---------- FICA ---------- */
  function fica(input,config){
    const cfg=config||createConfig();
    const f=cfg.fica;
    const gross=roundCents(input.grossWages||0);
    const ytd=Math.max(0,roundCents(input.ytdWagesBefore||0));
    if(f.enabled===false)return {ss:0,medicare:0,additionalMedicare:0,employerSS:0,employerMedicare:0,trace:{enabled:false}};
    const ssTaxable=Math.max(0,Math.min(gross,Number(f.ssWageBase||0)-ytd));
    const ss=roundCents(ssTaxable*Number(f.ssRate||0));
    const medicare=roundCents(gross*Number(f.medicareRate||0));
    const threshold=Number(f.additionalWithholdingThreshold||200000);
    const excessNow=Math.max(0,ytd+gross-threshold),excessBefore=Math.max(0,ytd-threshold);
    const additionalBase=Math.max(0,excessNow-excessBefore);
    const additionalMedicare=roundCents(additionalBase*Number(f.additionalRate||0));
    return {ss,medicare,additionalMedicare,employerSS:ss,employerMedicare:medicare,
      trace:{ssTaxableWages:ssTaxable,ssWageBase:f.ssWageBase,additionalMedicareBase:additionalBase,threshold}};
  }

  /* ---------- Minnesota (disabled until owner-confirmed) ---------- */
  function stateWithholding(input,config){
    const cfg=config||createConfig();
    const mn=cfg.minnesota;
    if(!mn.enabled||!mn.confirmed)return 0;
    const periods=periodsPerYear(input.frequency);
    const gross=roundCents(input.grossWages||0);
    const annualized=gross*periods;
    const allowanceDeduction=Number(input.mnAllowances||0)*Number(mn.allowanceValue||0);
    const taxable=Math.max(0,roundCents(annualized-allowanceDeduction));
    const table=statusKey(input.filingStatus)==='mfj'?mn.tables.married:mn.tables.single;
    const {tax}=bracketTax(table,taxable);
    return roundCents(Math.max(0,tax/periods)+roundCents(input.mnAdditionalPerPeriod||0));
  }
  function stateDetail(input,config){
    const cfg=config||createConfig();
    const mn=cfg.minnesota;
    const enabled=!!(mn.enabled&&mn.confirmed);
    const periods=periodsPerYear(input.frequency);
    const gross=roundCents(input.grossWages||0);
    const annualized=roundCents(gross*periods);
    const allowanceDeduction=roundCents(Number(input.mnAllowances||0)*Number(mn.allowanceValue||0));
    const taxable=Math.max(0,roundCents(annualized-allowanceDeduction));
    let row=null,annualTax=0;
    if(enabled){const table=statusKey(input.filingStatus)==='mfj'?mn.tables.married:mn.tables.single;const r=bracketTax(table,taxable);row=r.row;annualTax=roundCents(r.tax);}
    return {amount:stateWithholding(input,cfg),enabled,
      trace:{method:'Minnesota percentage method (annualize, less allowances, table, divide by periods)',enabled,
        source:mn.source,periodsPerYear:periods,annualizedWages:annualized,mnAllowances:Number(input.mnAllowances||0),
        allowanceValue:mn.allowanceValue,allowanceDeduction,taxableAnnualWage:taxable,
        bracketRow:row?{atLeast:row[0],butLessThan:row[1],baseTax:row[2],rate:row[3],excessOver:row[4]}:null,
        annualTax,mnAdditionalPerPeriod:roundCents(input.mnAdditionalPerPeriod||0),
        reviewFlag:enabled?'':'MN withholding is OFF — state computes $0 until the owner confirms the Minnesota tables in Payroll tax tables settings.'}};
  }

  /* ---------- Employer taxes ---------- */
  function employerTaxes(input,config){
    const cfg=config||createConfig();
    const e=cfg.employer;
    const gross=roundCents(input.grossWages||0);
    const ficaWages=input.ficaWages!=null?roundCents(input.ficaWages):gross;
    const ytd=Math.max(0,roundCents(input.ytdWagesBefore||0));
    const f=fica({grossWages:ficaWages,ytdWagesBefore:ytd},cfg);
    const futa=(e.futaEnabled&&e.futaRate!=null&&e.futaWageBase!=null)
      ?roundCents(Math.max(0,Math.min(gross,Number(e.futaWageBase)-ytd))*Number(e.futaRate)):0;
    const suta=(e.sutaEnabled&&e.sutaRate!=null&&e.sutaWageBase!=null)
      ?roundCents(Math.max(0,Math.min(gross,Number(e.sutaWageBase)-ytd))*Number(e.sutaRate)):0;
    const stateOther=roundCents(gross*Number(e.stateOtherRate||0));
    return {ss:f.employerSS,medicare:f.employerMedicare,futa,suta,stateOther,
      trace:{futaEnabled:!!e.futaEnabled,sutaEnabled:!!e.sutaEnabled,
        futaReviewFlag:e.futaEnabled?'':'FUTA is OFF until the owner confirms the rate/base in Payroll tax tables settings.',
        sutaReviewFlag:e.sutaEnabled?'':'SUTA is OFF until the owner confirms their MN DEED rate/base in Payroll tax tables settings.'}};
  }

  /* ---------- Full line calculation ---------- */
  function field(source,...names){for(const name of names){if(source&&source[name]!=null&&source[name]!=='')return source[name];}return undefined;}
  function calculateLine(input,config){
    const cfg=config||createConfig();
    const emp=input.employee||{};
    const gross=roundCents(input.grossPay||0);
    const reimbursements=roundCents(input.reimbursements||0);
    const frequency=input.frequency||field(emp,'Pay Frequency')||'Biweekly';
    const ytdWagesBefore=Math.max(0,roundCents(field(input,'ytdWagesBefore')??(input.ytd?input.ytd.gross:undefined)??0));
    const contractor=!!input.contractor;
    const deductions=(input.deductions||[]).filter(d=>d&&d.active!==false).map(d=>{
      const raw=Number(d.amount||0);
      const amount=d.per==='percent-gross'?roundCents(gross*raw/100):roundCents(raw);
      return {name:String(d.name||'Deduction'),kind:d.kind==='pre-tax'?'pre-tax':'post-tax',amount,ficaExempt:d.ficaExempt===true};
    });
    const preTax=deductions.filter(d=>d.kind==='pre-tax');
    const postTax=deductions.filter(d=>d.kind==='post-tax');
    const preTaxTotal=fromCents(sumCents(preTax.map(d=>d.amount)));
    const ficaExemptTotal=fromCents(sumCents(preTax.filter(d=>d.ficaExempt).map(d=>d.amount)));
    const incomeTaxWages=Math.max(0,roundCents(gross-preTaxTotal));
    const ficaWages=Math.max(0,roundCents(gross-ficaExemptTotal));
    const reviewFlags=[];
    let withholdings={federal:0,ficaSS:0,ficaMed:0,additionalMedicare:0,state:0,other:0};
    let employer={ss:0,medicare:0,futa:0,suta:0,stateOther:0};
    let fedTrace=null,ficaTrace=null,stateTrace=null,employerTrace=null;
    if(contractor){
      reviewFlags.push('Contractor (1099) line — gross to net with NO withholding lines.');
    }else{
      const fedInput={grossWages:incomeTaxWages,frequency,
        filingStatus:field(emp,'filingStatus','Filing Status')||input.filingStatus||'Single',
        step2Checked:field(emp,'step2Checked','W-4 Step 2 Checked')===true||field(emp,'step2Checked','W-4 Step 2 Checked')==='Yes',
        step3CreditsAnnual:Number(field(emp,'step3CreditsAnnual','W-4 Step 3 Credits')||0),
        step4aAnnual:Number(field(emp,'step4aAnnual','W-4 Step 4a Other Income')||0),
        step4bAnnual:Number(field(emp,'step4bAnnual','W-4 Step 4b Deductions')||0),
        extraPerPeriod:Number(field(emp,'extraPerPeriod','Extra Withholding')||0),
        pre2020Allowances:(input.pre2020Allowances!=null?input.pre2020Allowances:(field(emp,'pre2020Allowances')!=null?field(emp,'pre2020Allowances'):(field(emp,'useModernW4')===true?null:field(emp,'Withholding Allowances'))))};
      // Modern path when the employee carries any 2020+ W-4 step field.
      const hasModern=field(emp,'W-4 Step 2 Checked')!=null||field(emp,'W-4 Step 3 Credits')!=null||field(emp,'W-4 Step 4a Other Income')!=null||field(emp,'W-4 Step 4b Deductions')!=null||emp.step2Checked!=null||emp.step3CreditsAnnual!=null;
      if(hasModern)fedInput.pre2020Allowances=null;
      if(fedInput.pre2020Allowances==null&&!hasModern&&field(emp,'Withholding Allowances')==null)fedInput.pre2020Allowances=null;
      const fed=federalDetail(fedInput,cfg);fedTrace=fed.trace;
      const fic=fica({grossWages:ficaWages,ytdWagesBefore},cfg);ficaTrace=fic.trace;
      const st=stateDetail({grossWages:incomeTaxWages,frequency,filingStatus:fedInput.filingStatus,
        mnAllowances:Number(field(emp,'mnAllowances','MN Allowances')??field(emp,'Withholding Allowances')??0),
        mnAdditionalPerPeriod:Number(field(emp,'mnAdditionalPerPeriod','MN Additional Withholding')||0)},cfg);
      stateTrace=st.trace;if(st.trace.reviewFlag)reviewFlags.push(st.trace.reviewFlag);
      withholdings={federal:fed.amount,ficaSS:fic.ss,ficaMed:fic.medicare,additionalMedicare:fic.additionalMedicare,state:st.amount,other:0};
      employer=employerTaxes({grossWages:gross,ficaWages,ytdWagesBefore},cfg);employerTrace=employer.trace;
      if(employerTrace.futaReviewFlag)reviewFlags.push(employerTrace.futaReviewFlag);
      if(employerTrace.sutaReviewFlag)reviewFlags.push(employerTrace.sutaReviewFlag);
      // MN Paid Leave — modeled, ships disabled; only when owner enabled it.
      const pl=cfg.minnesota.paidLeave;
      if(pl&&pl.enabled&&(Number(pl.employeeRate)>0||Number(pl.employerRate)>0)){
        const plBase=Math.max(0,Math.min(gross,Number(pl.wageCap||Infinity)-ytdWagesBefore));
        const plEmp=roundCents(plBase*Number(pl.employeeRate||0));
        if(plEmp>0)deductions.push({name:'MN Paid Leave (employee)',kind:'post-tax',amount:plEmp,ficaExempt:false});
        employer.stateOther=roundCents(employer.stateOther+roundCents(plBase*Number(pl.employerRate||0)));
      }
    }
    const postTaxTotal=fromCents(sumCents(deductions.filter(d=>d.kind==='post-tax').map(d=>d.amount)));
    const totalWithholdings=fromCents(sumCents(Object.values(withholdings)));
    const totalDeductions=roundCents(preTaxTotal+postTaxTotal);
    const net=fromCents(toCents(gross)+toCents(reimbursements)-toCents(totalWithholdings)-toCents(totalDeductions));
    const employerTotal=fromCents(sumCents([employer.ss,employer.medicare,employer.futa,employer.suta,employer.stateOther]));
    const employerCost=fromCents(toCents(gross)+toCents(employerTotal));
    return {grossPay:gross,reimbursements,frequency,withholdings,deductions,
      totalWithholdings,totalDeductions,net,employerTaxes:{ss:employer.ss,medicare:employer.medicare,futa:employer.futa,suta:employer.suta,stateOther:employer.stateOther},
      employerTaxTotal:employerTotal,employerCost,
      trace:{contractor,frequency,periodsPerYear:periodsPerYear(frequency),grossPay:gross,reimbursements,
        preTaxTotal,ficaExemptTotal,incomeTaxWages,ficaWages,ytdWagesBefore,
        federal:fedTrace,fica:ficaTrace,state:stateTrace,employer:employerTrace,reviewFlags}};
  }

  return {VERSION,DEFAULT_CONFIG:defaultConfig(),createConfig,defaultConfig,periodsPerYear,
    federalWithholding,federalDetail,fica,stateWithholding,stateDetail,employerTaxes,calculateLine,
    roundCents,toCents,fromCents};
});
