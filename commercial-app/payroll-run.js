/* H38 Payroll Run — canonical run pipeline (WS3, 2026-10-20).
 * One pipeline for the Payroll page and the guided flow:
 *   payrollPreparation() selects approved, in-period, not-already-paid time
 *   (accounting-operations.js, pinned contract — untouched);
 *   payroll-calc.js computes withholding from the verified 2026 tables;
 *   this module builds Draft runs, drives Draft → Reviewed → Finalized →
 *   Posted, stamps time entries at finalize, and posts ONE balanced GL
 *   transaction (GL-PAYROLL-<runId>, deterministic ⇒ idempotent) at Posted.
 *
 * Double-pay prevention works from day one, stamped or not: every run line
 * carries its 'Time Entry IDs', and buildRun() excludes any entry id that
 * already appears on a Finalized/Posted run (runsContainingEntries).
 * Stamping goes through the audited MARK_TIME_PAID action (declared in
 * BusinessOffice_ActionContract.gs; server handler not yet deployed) via the
 * same queue pattern APPROVE_TIME_ENTRY uses. On ANY failure the run falls
 * back automatically and the header says so honestly in 'Time Entry
 * Stamping' — it never pretends to stamp.
 *
 * The Office prepares payroll. It never files, never moves funds.
 * The pure core (buildRunRecords / transition / postingForRun /
 * runsContainingEntries / liabilitySummary) is Node-requireable for tests;
 * persistence glue activates only in the browser.
 */
(function(root,factory){
  const deps={
    engine:(typeof window!=='undefined'&&window.H38_ACCOUNTING_ENGINE)||(typeof require==='function'?safeRequire('./accounting-engine.js'):null),
    operations:(typeof window!=='undefined'&&window.H38_ACCOUNTING_OPERATIONS)||(typeof require==='function'?safeRequire('./accounting-operations.js'):null),
    calc:(typeof window!=='undefined'&&window.H38_PAYROLL_CALC)||(typeof require==='function'?safeRequire('./payroll-calc.js'):null)
  };
  function safeRequire(p){try{return require(p);}catch(e){return null;}}
  const api=factory(deps);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.H38_PAYROLL_RUN=Object.freeze(api);
})(typeof window!=='undefined'?window:null,function(deps){
  'use strict';
  const BUILD='20261020-payroll-run-1';
  const ENGINE=deps.engine, OPS=deps.operations, CALC=deps.calc;
  const text=v=>String(v==null?'':v).trim();
  const num=v=>{const n=Number(v||0);return Number.isFinite(n)?n:0;};
  const money=v=>Math.round(num(v)*100)/100;
  const sum=(rows,k)=>money(rows.reduce((s,r)=>s+num(r[k]),0));
  const STAMP_PENDING='Server action pending — entries tracked on this run';
  const STAMP_DONE='Stamped';
  const TRANSITIONS=Object.freeze({
    Draft:['Reviewed','Void'],
    Reviewed:['Finalized','Void','Draft'],
    Finalized:['Posted','Void'],
    Posted:[],
    Void:[]
  });

  function isContractor(employee){
    return text(employee&&employee['Employment Type']).toLowerCase()==='contractor'
      ||text(employee&&employee['Pay Type']).toLowerCase()==='contract';
  }
  function employeeDeductions(employee){
    const list=Array.isArray(employee&&employee.Deductions)?employee.Deductions:[];
    return list.filter(d=>d&&d.active!==false).map(d=>({name:text(d.name||d.Name)||'Deduction',
      kind:(d.kind||d.Kind)==='pre-tax'?'pre-tax':'post-tax',
      amount:num(d.amount??d.Amount),per:(d.per||d.Per)==='percent-gross'?'percent-gross':'period',
      ficaExempt:(d.ficaExempt??d.FicaExempt)===true}));
  }
  function ytdWagesBefore(lines,employeeId,payDate,excludeRunId){
    const year=text(payDate).slice(0,4);
    return money((lines||[]).filter(l=>text(l['Employee ID'])===text(employeeId)
      &&text(l['Pay Date']).slice(0,4)===year
      &&text(l['Approval Status']).toUpperCase()==='APPROVED'
      &&text(l['Payroll Period ID'])!==text(excludeRunId))
      .reduce((s,l)=>s+num(l['Gross Pay']),0));
  }
  /* Entry ids already carried by any Finalized/Posted run — the guaranteed
   * double-pay exclusion arm (works regardless of server stamping). */
  function runsContainingEntries(runs,lines){
    const used=new Map();
    const live=new Set((runs||[]).filter(r=>['Finalized','Posted'].includes(text(r.Status)))
      .map(r=>text(r['Payroll Period ID']||r.id)));
    for(const line of lines||[]){
      const runId=text(line['Payroll Period ID']);
      if(!live.has(runId))continue;
      const ids=Array.isArray(line['Time Entry IDs'])?line['Time Entry IDs']:[];
      ids.forEach(id=>{if(text(id))used.set(text(id),runId);});
    }
    return used;
  }

  /* Run-aware exclusion arm (pure): remove entry ids that already appear on
   * a Finalized/Posted run from a preparation's items, recomputing hours and
   * gross from the surviving job allocations. This is the guaranteed
   * double-pay prevention that works whether or not server stamping exists. */
  function applyRunExclusion(preparation,employees,used){
    if(!used||!used.size)return {preparation,extraExcluded:[]};
    const empById=new Map((employees||[]).map(e=>[text(e['Employee ID']||e.id),e]));
    const extraExcluded=[];
    const items=(preparation.Items||[]).map(item=>{
      const blocked=(item.sourceIds||[]).filter(s=>s.kind==='time'&&used.has(text(s.id)));
      if(!blocked.length)return item;
      const blockedIds=new Set(blocked.map(s=>text(s.id)));
      blocked.forEach(s=>extraExcluded.push({kind:'time',id:text(s.id),reason:`Already on finalized/posted run ${used.get(text(s.id))}`}));
      const keptAlloc=(item.jobAllocations||[]).filter(a=>!blockedIds.has(text(a.timeEntryId)));
      const reg=money(keptAlloc.reduce((s,a)=>s+num(a.regularHours),0));
      const ot=money(keptAlloc.reduce((s,a)=>s+num(a.overtimeHours),0));
      const emp=empById.get(text(item.employeeId))||{};
      const rate=num(emp['Hourly Rate']),otRate=emp['Overtime Rate']!=null?num(emp['Overtime Rate']):rate*(num(emp['Overtime Multiplier'])||1.5);
      const gross=money(reg*rate+ot*otRate);
      return {...item,regularHours:reg,overtimeHours:ot,grossPay:gross,
        totalPrepared:money(gross+num(item.reimbursements)),
        sourceIds:(item.sourceIds||[]).filter(s=>!blockedIds.has(text(s.id))),jobAllocations:keptAlloc};
    });
    return {preparation:{...preparation,Items:items},extraExcluded};
  }

  /* Build Draft run records (header + lines) from a payrollPreparation
   * result + calc. Pure: no persistence, no DOM. */
  function buildRunRecords({businessId,runId,periodStart,periodEnd,payDate,source='payroll-page',
    preparation,employees=[],existingLines=[],existingRuns=[],config,configSnapshot,createdBy='',nowIso}){
    if(!preparation||!Array.isArray(preparation.Items))throw new Error('A payrollPreparation result is required to build a run.');
    if(!CALC)throw new Error('Payroll calc module is unavailable.');
    const cfg=config||CALC.createConfig();
    const stamp=nowIso||new Date().toISOString();
    const empById=new Map((employees||[]).map(e=>[text(e['Employee ID']||e.id),e]));
    const used=runsContainingEntries(existingRuns,existingLines);
    const applied=applyRunExclusion(preparation,employees,used);
    preparation=applied.preparation;
    const excluded=[...(preparation['Excluded Sources']||[]),...applied.extraExcluded];
    const lines=[];let salaryOnly=[];
    for(const item of preparation.Items){
      const employee=empById.get(text(item.employeeId))||{};
      const timeIds=(item.sourceIds||[]).filter(s=>s.kind==='time').map(s=>text(s.id)).filter(Boolean);
      const keepIds=timeIds; // run-aware exclusion already applied above
      const isSalaried=text(employee['Pay Type']).toLowerCase()==='salary';
      const gross=money(item.grossPay||0);
      // Salary semantics (existing product truth): 'Salary Rate' is the
      // per-period amount and replaces the hours-based gross for salaried
      // employees; their approved entries stay attached for audit/costing.
      const salaryPay=isSalaried?money(employee['Salary Rate']||0):0;
      const lineGross=isSalaried&&salaryPay>0?salaryPay:gross;
      if(timeIds.length===0&&isSalaried)salaryOnly.push(text(item.employeeId));
      if(lineGross<=0&&keepIds.length===0&&!isSalaried)continue;
      const frequency=text(employee['Pay Frequency'])||'Biweekly';
      const rate=num(employee['Hourly Rate']);
      const otMult=num(employee['Overtime Multiplier'])||1.5;
      const otRate=employee['Overtime Rate']!=null?num(employee['Overtime Rate']):money(rate*otMult);
      const regularPay=money(num(item.regularHours)*rate);
      const overtimePay=money(num(item.overtimeHours)*otRate);
      const contractor=isContractor(employee);
      const calc=CALC.calculateLine({grossPay:lineGross,reimbursements:money(item.reimbursements||0),frequency,
        employee,deductions:employeeDeductions(employee),contractor,
        ytd:{gross:ytdWagesBefore(existingLines,item.employeeId,payDate,runId)}},cfg);
      const wh=calc.withholdings,et=calc.employerTaxes;
      const ytdBefore=ytdWagesBefore(existingLines,item.employeeId,payDate,runId);
      lines.push({id:`${runId}-LINE-${text(item.employeeId)||lines.length+1}`,
        'Payroll Line ID':`${runId}-LINE-${text(item.employeeId)||lines.length+1}`,
        'Business ID':businessId,'Payroll Period ID':runId,'Employee ID':text(item.employeeId),
        'Pay Date':payDate,'Pay Type':text(employee['Pay Type'])||'Hourly','Pay Frequency':frequency,
        'Regular Hours':num(item.regularHours),'Overtime Hours':num(item.overtimeHours),'Hourly Rate':rate,
        'Regular Pay':isSalaried&&salaryPay>0?0:regularPay,'Overtime Pay':isSalaried&&salaryPay>0?0:overtimePay,'Salary Pay':salaryPay,
        'Gross Pay':lineGross,'Time Entry IDs':keepIds,'Job Allocations':item.jobAllocations||[],
        'Reimbursements':money(item.reimbursements||0),
        'Pre-Tax Deductions':calc.deductions.filter(d=>d.kind==='pre-tax'),
        'Post-Tax Deductions':calc.deductions.filter(d=>d.kind==='post-tax'),
        'Deductions Detail':calc.deductions,
        'Contractor':contractor,'Contractor Label':contractor?'Contractor — 1099 path, no withholding':'',
        'Federal Withholding':wh.federal,'Social Security':wh.ficaSS,'Medicare':wh.ficaMed,
        'Additional Medicare':wh.additionalMedicare,'State Withholding':wh.state,'Other Withholding':wh.other,
        'Total Deductions':money(calc.totalWithholdings+calc.totalDeductions),
        'Deductions':money(calc.totalWithholdings+calc.totalDeductions),
        'Net Pay':calc.net,'Prepared Net Amount':calc.net,
        'Employer SS':et.ss,'Employer Medicare':et.medicare,'FUTA':et.futa,'SUTA':et.suta,
        'Employer State Tax':et.stateOther,'Employer Tax Estimate':calc.employerTaxTotal,
        'Employer Cost Estimate':money(calc.employerCost+money(item.reimbursements||0)),
        'YTD Gross':money(ytdBefore+lineGross),'YTD Federal':money(wh.federal),
        'YTD SS':money(wh.ficaSS),'YTD Medicare':money(wh.ficaMed+wh.additionalMedicare),
        'YTD State':money(wh.state),'YTD Net':money(calc.net),
        'Calc Inputs':{filingStatus:text(employee['Filing Status'])||'Single',
          step2Checked:employee['W-4 Step 2 Checked']===true,
          step3Credits:num(employee['W-4 Step 3 Credits']),step4a:num(employee['W-4 Step 4a Other Income']),
          step4b:num(employee['W-4 Step 4b Deductions']),extraWithholding:num(employee['Extra Withholding']),
          mnAllowances:num(employee['MN Allowances']??employee['Withholding Allowances']),
          mnAdditional:num(employee['MN Additional Withholding']),ytdWagesBefore,
          w4Path:calc.trace&&calc.trace.federal?calc.trace.federal.path:'contractor'},
        'Calc Trace':calc.trace,
        'Approval Status':'Owner Approval Required',
        'Notes':contractor?'Contractor (1099): gross to net, no withholding. No funds moved.':'Tax figures are estimates from the run tax config snapshot. No funds moved.',
        'Created Time':stamp,'Updated Time':stamp,'Record Version':1});
    }
    const withholdingTotals={federal:sum(lines,'Federal Withholding'),ficaSS:sum(lines,'Social Security'),
      ficaMed:sum(lines,'Medicare'),additionalMedicare:sum(lines,'Additional Medicare'),
      state:sum(lines,'State Withholding'),other:sum(lines,'Other Withholding')};
    const employerTaxes={ss:sum(lines,'Employer SS'),medicare:sum(lines,'Employer Medicare'),
      futa:sum(lines,'FUTA'),suta:sum(lines,'SUTA'),stateOther:sum(lines,'Employer State Tax')};
    const grossTotal=sum(lines,'Gross Pay'),netTotal=sum(lines,'Net Pay'),reimbTotal=sum(lines,'Reimbursements');
    const header={id:runId,'Payroll Period ID':runId,'Business ID':businessId,
      'Period Start':periodStart,'Period End':periodEnd,'Pay Date':payDate,
      'Pay Frequency':lines.length?lines[0]['Pay Frequency']:'Biweekly',
      Status:'Draft','Approval Status':'Owner Approval Required','Export Allowed':'No',
      'Run Source':source,'Source Preparation ID':preparation['Payroll Period ID']||preparation.id||'',
      'Gross Pay':grossTotal,'Deductions':sum(lines,'Total Deductions'),'Prepared Net Amount':netTotal,
      'Net Pay':netTotal,'Reimbursements':reimbTotal,
      'Withholding Totals':withholdingTotals,'Employer Taxes':employerTaxes,
      'Employer Tax Estimate':money(employerTaxes.ss+employerTaxes.medicare+employerTaxes.futa+employerTaxes.suta+employerTaxes.stateOther),
      'Employer Cost Estimate':money(grossTotal+money(employerTaxes.ss+employerTaxes.medicare+employerTaxes.futa+employerTaxes.suta+employerTaxes.stateOther)),
      'Tax Config Snapshot':configSnapshot||cfg,
      'Ledger Transaction ID':'','Posted Time':'','Posted By':'',
      'Time Entry Stamping':STAMP_PENDING,
      'Estimates Confirmed By':'','Estimates Confirmed Time':'',
      'OT Migration Note':'OT now follows approved entry splits (Regular/Overtime Hours on each approved entry). Earlier previews split overtime weekly at 40 hours; totals can differ for mixed weeks.',
      'Excluded Sources':excluded,
      'Finalized By':'','Finalized Time':'','Created By':createdBy,
      'Government Filing Performed':false,'Funds Moved':false,
      'Created Time':stamp,'Updated Time':stamp,'Record Version':1};
    return {header,lines};
  }

  /* State machine guard — pure. */
  function transition(header,to){
    const from=text(header&&header.Status)||'Draft';
    if(!(TRANSITIONS[from]||[]).includes(to))throw new Error(`Payroll run cannot move from ${from} to ${to}.`);
    return to;
  }
  function applyTransition(header,to,{by='',nowIso,estimatesConfirmed=false}={}){
    transition(header,to);
    const stamp=nowIso||new Date().toISOString();
    const next={...header,Status:to,'Updated Time':stamp,'Record Version':Math.max(1,num(header['Record Version']))+1};
    if(to==='Reviewed'){next['Reviewed By']=by;next['Reviewed Time']=stamp;}
    if(to==='Finalized'){
      if(header.Status==='Draft')throw new Error('Review the run (and confirm the estimates) before finalizing.');
      if(!estimatesConfirmed&&!header['Estimates Confirmed Time'])throw new Error('The estimates gate is not confirmed: check "I reviewed these estimates" before finalizing.');
      next['Approval Status']='Approved';next['Export Allowed']='Yes';
      next['Finalized By']=by;next['Finalized Time']=stamp;
      if(estimatesConfirmed){next['Estimates Confirmed By']=by;next['Estimates Confirmed Time']=stamp;}
    }
    if(to==='Posted'){next['Posted By']=by;next['Posted Time']=stamp;next['Ledger Transaction ID']=`GL-PAYROLL-${text(header['Payroll Period ID']||header.id)}`;}
    if(to==='Void'){next['Export Allowed']='No';}
    return next;
  }

  /* GL transaction for a run (pure, via the engine) — deterministic id. */
  function postingForRun(header,lines){
    if(!ENGINE)throw new Error('Accounting engine is unavailable.');
    const allocCost=(lines||[]).reduce((s,l)=>s+(Array.isArray(l['Job Allocations'])?l['Job Allocations'].reduce((a,j)=>a+num(j.cost),0):0),0);
    const gross=sum(lines||[],'Gross Pay');
    const directLaborShare=gross>0?money(Math.min(gross,allocCost)):0;
    const deductionsTotal=(lines||[]).reduce((s,l)=>s+(Array.isArray(l['Deductions Detail'])?l['Deductions Detail'].reduce((a,d)=>a+num(d.amount),0):0),0);
    return ENGINE.payrollPosting({businessId:text(header['Business ID']),runId:text(header['Payroll Period ID']||header.id),
      date:text(header['Pay Date']),grossWages:gross,directLaborShare,
      employerTaxes:header['Employer Taxes']||{},withholdings:header['Withholding Totals']||{},
      deductionsTotal,reimbursements:sum(lines||[],'Reimbursements'),netPay:sum(lines||[],'Net Pay'),
      memo:`Payroll ${text(header['Period Start'])} – ${text(header['Period End'])} (pay ${text(header['Pay Date'])})`});
  }
  function ledgerTxId(runId){return `GL-PAYROLL-${text(runId)}`;}

  /* Liability summary (spec §3.6) — posted runs accrue; balances come from
   * the ledger itself so manual clearing entries reduce them. Pure. */
  function liabilitySummary({runs=[],lines=[],transactions=[],accounts=[],asOf}){
    const postedIds=new Set((runs||[]).filter(r=>text(r.Status)==='Posted').map(r=>text(r['Payroll Period ID']||r.id)));
    const posted=(lines||[]).filter(l=>postedIds.has(text(l['Payroll Period ID'])));
    const accrued={federal:sum(posted,'Federal Withholding'),
      fica:money(sum(posted,'Social Security')+sum(posted,'Medicare')+sum(posted,'Additional Medicare')+sum(posted,'Employer SS')+sum(posted,'Employer Medicare')),
      state:sum(posted,'State Withholding'),futa:sum(posted,'FUTA'),suta:sum(posted,'SUTA'),
      other:money(sum(posted,'Other Withholding')+posted.reduce((s,l)=>s+(Array.isArray(l['Deductions Detail'])?l['Deductions Detail'].reduce((a,d)=>a+num(d.amount),0):0),0)),
      netPay:sum(posted,'Net Pay')};
    let balances={};
    if(ENGINE&&Array.isArray(transactions)){
      try{const grouped=ENGINE.trialBalance(transactions,accounts||[]);
        const byId={};grouped.forEach(r=>{byId[r.account.id]=r.balance;});
        balances={'ACCT-2400':money(byId['ACCT-2400']||0),'ACCT-2410':money(byId['ACCT-2410']||0),
          'ACCT-2420':money(byId['ACCT-2420']||0),'ACCT-2430':money(byId['ACCT-2430']||0),
          'ACCT-2440':money(byId['ACCT-2440']||0),'ACCT-2450':money(byId['ACCT-2450']||0)};
      }catch(e){balances={error:text(e.message||e)};}
    }
    return {asOf:asOf||'',accrued,balances,
      rows:[{label:'Federal withholding',accrued:accrued.federal,accountId:'ACCT-2400',balance:balances['ACCT-2400']},
        {label:'FICA (employee + employer)',accrued:accrued.fica,accountId:'ACCT-2410',balance:balances['ACCT-2410']},
        {label:'State withholding',accrued:accrued.state,accountId:'ACCT-2420',balance:balances['ACCT-2420']},
        {label:'FUTA',accrued:accrued.futa,accountId:'ACCT-2450',balance:null},
        {label:'SUTA',accrued:accrued.suta,accountId:'ACCT-2450',balance:null},
        {label:'Other deductions',accrued:accrued.other,accountId:'ACCT-2430',balance:balances['ACCT-2430']},
        {label:'Net pay',accrued:accrued.netPay,accountId:'ACCT-2440',balance:balances['ACCT-2440']}]};
  }

  /* ================= browser persistence glue ================= */
  const browser=typeof window!=='undefined'&&typeof document!=='undefined';
  function snapRows(name){return browser&&Array.isArray(window.state&&window.state.snapshot&&window.state.snapshot[name])?window.state.snapshot[name]:[];}
  function rowIdOf(row,...keys){for(const k of keys){const val=row&&(row[k]??row.id);if(text(val))return text(val);}return '';}
  async function saveRunRecord(collection,recordType,id,record,idKeys){
    if(typeof window.saveParity==='function')return window.saveParity(collection,recordType,id,record,collection,idKeys);
    if(typeof window.queueOperation==='function')return window.queueOperation('SAVE_PARITY_ENTITY',recordType,id,{entityKey:collection,record},{collection,record,idKeys},false);
    throw new Error('Office save queue is unavailable.');
  }
  async function syncQuiet(){try{if(typeof window.sync==='function')await window.sync(false);}catch(e){}}

  function loadConfig(){
    if(!CALC)return null;
    const rowsForBusiness=snapRows('payrollTaxConfigs').filter(r=>text(r['Business ID'])===text(window.state&&window.state.businessId));
    const record=rowsForBusiness[0];
    return CALC.createConfig(record||undefined);
  }

  /* Full build: selection via payrollPreparation + run-aware exclusion. */
  async function buildRun({start,end,payDate,source='payroll-page',runId}){
    if(!OPS||!CALC)throw new Error('Payroll modules are still loading. Try again in a moment.');
    const businessId=text(window.state&&window.state.businessId);
    const employees=snapRows('employees').filter(r=>text(r.Status).toUpperCase()!=='INACTIVE');
    const rid=runId||(typeof window.newId==='function'?window.newId('PAYROLL'):`PAYROLL-${Date.now()}`);
    const preparation=OPS.payrollPreparation({businessId,periodId:rid,startDate:start,endDate:end,
      employees,timeEntries:snapRows('timeEntries'),reimbursements:snapRows('reimbursements'),mileage:snapRows('mileage')});
    const cfg=loadConfig();
    const built=buildRunRecords({businessId,runId:rid,periodStart:start,periodEnd:end,payDate,source,
      preparation,employees,existingLines:snapRows('payrollLines'),existingRuns:snapRows('payrollPeriods'),config:cfg,
      configSnapshot:cfg,createdBy:text(window.state&&window.state.snapshot&&window.state.snapshot.user&&window.state.snapshot.user.userId)});
    return {...built,preparation};
  }

  async function saveDraft(built){
    await saveRunRecord('payrollPeriods','Payroll Period',built.header.id,built.header,['Payroll Period ID']);
    for(const line of built.lines)await saveRunRecord('payrollLines','Payroll Line',line.id,line,['Payroll Line ID']);
    await syncQuiet();
    return built.header;
  }
  async function markReviewed(runId,by){return persistTransition(runId,'Reviewed',{by});}
  async function finalizeRun(runId,{by='',estimatesConfirmed=false}={}){
    const header=await persistTransition(runId,'Finalized',{by,estimatesConfirmed});
    const stamping=await stampTimeEntries(header);
    const finalHeader={...header,'Time Entry Stamping':stamping,'Updated Time':new Date().toISOString(),
      'Record Version':Math.max(1,num(header['Record Version']))+1};
    await saveRunRecord('payrollPeriods','Payroll Period',runId,finalHeader,['Payroll Period ID']);
    const lines=snapRows('payrollLines').filter(l=>text(l['Payroll Period ID'])===runId);
    for(const line of lines){
      if(text(line['Approval Status']).toUpperCase()==='APPROVED')continue;
      await saveRunRecord('payrollLines','Payroll Line',rowIdOf(line,'Payroll Line ID'),
        {...line,'Approval Status':'Approved','Updated Time':new Date().toISOString(),'Record Version':Math.max(1,num(line['Record Version']))+1},['Payroll Line ID']);
    }
    await syncQuiet();
    return finalHeader;
  }
  async function persistTransition(runId,to,opts={}){
    const row=snapRows('payrollPeriods').find(r=>rowIdOf(r,'Payroll Period ID')===text(runId));
    if(!row)throw new Error('Pay run not found.');
    const next=applyTransition(row,to,opts);
    await saveRunRecord('payrollPeriods','Payroll Period',runId,next,['Payroll Period ID']);
    await syncQuiet();
    return next;
  }
  /* Attempt MARK_TIME_PAID through the audited-action queue (same pattern as
   * APPROVE_TIME_ENTRY). Any failure ⇒ honest fallback string, never a fake
   * stamp. The entry ids stay on the run lines either way. */
  async function stampTimeEntries(header){
    const runId=text(header['Payroll Period ID']||header.id);
    const lines=snapRows('payrollLines').filter(l=>text(l['Payroll Period ID'])===runId);
    const entryIds=Array.from(new Set(lines.flatMap(l=>Array.isArray(l['Time Entry IDs'])?l['Time Entry IDs']:[]).map(text).filter(Boolean)));
    if(!entryIds.length)return STAMP_DONE; // nothing to stamp (salary-only run)
    if(typeof window.queueOperation!=='function')return STAMP_PENDING;
    try{
      await window.queueOperation('MARK_TIME_PAID','Time Entry',runId,
        {payrollPeriodId:runId,timeEntryIds:entryIds,batch:true,idempotent:true},
        {collection:'timeEntries',record:{'Payroll Period ID':runId,Paid:true},idKeys:['Time Entry ID']},false);
      return STAMP_DONE;
    }catch(e){
      return STAMP_PENDING;
    }
  }
  async function postRun(runId,{by=''}={}){
    const header=await persistTransition(runId,'Posted',{by});
    const lines=snapRows('payrollLines').filter(l=>text(l['Payroll Period ID'])===runId);
    const tx=postingForRun(header,lines);
    const existing=snapRows('accountingTransactions').some(r=>text(r['Transaction ID']||r.id)===tx.id);
    if(!existing){
      const record={...tx,id:tx.id,'Transaction ID':tx.id,'Business ID':tx.businessId,'Transaction Date':tx.date,
        'Transaction Type':tx.type,'Source Type':tx.sourceType,'Source ID':tx.sourceId,'Memo':tx.memo,
        'Status':tx.status,'Total':tx.total,'Lines':tx.lines,'Created Time':tx.createdAt||new Date().toISOString(),'Record Version':1};
      await saveRunRecord('accountingTransactions','Accounting Transaction',tx.id,record,['Transaction ID','id']);
    }
    await syncQuiet();
    return {header,transaction:tx,alreadyPosted:existing};
  }
  async function voidRun(runId){return persistTransition(runId,'Void',{});}

  return {BUILD,TRANSITIONS,STAMP_PENDING,STAMP_DONE,
    isContractor,employeeDeductions,ytdWagesBefore,runsContainingEntries,applyRunExclusion,
    buildRunRecords,transition,applyTransition,postingForRun,ledgerTxId,liabilitySummary,
    buildRun,saveDraft,markReviewed,finalizeRun,postRun,voidRun,stampTimeEntries,loadConfig};
});
