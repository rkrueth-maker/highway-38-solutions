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
  /* Lazy fallbacks: in the browser the loader group guarantees order, but
   * resolving through window at call time keeps posting/liability working
   * even if the accounting group loaded after this module. */
  function engine(){return ENGINE||(typeof window!=='undefined'?window.H38_ACCOUNTING_ENGINE:null);}
  function ops(){return OPS||(typeof window!=='undefined'?window.H38_ACCOUNTING_OPERATIONS:null);}
  function calcMod(){return CALC||(typeof window!=='undefined'?window.H38_PAYROLL_CALC:null);}
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

  /* ================= read-side time-entry normalization =================
   * Phase D fix (D3): the server canonicalizes saved timeEntries — 'Date'
   * and 'Employee ID' are stripped at save time; the persisted shape is
   * {Time Entry ID, User ID (the recorder's account id), Start Time,
   * End Time, Hours, Approval Status, …}. payrollPreparation() (pinned)
   * reads the work date only from Date/date/'Work Date' and links entries
   * by 'Employee ID'/'User ID', so raw server rows can never be selected.
   * This normalizer bridges the two contracts READ-SIDE only (inputs are
   * never mutated, nothing is written back):
   *   (a) 'Date' is derived from the 'Start Time' date part when absent;
   *   (b) 'Employee ID' is supplied from the strongest linkage key that
   *       actually exists, in order: the entry's own 'Employee ID'; the
   *       entry's 'User ID' matched against an employee's 'User ID' (the
   *       People page "Linked user" field — the designed link); the
   *       entry's 'Display Name' matched exactly against exactly one
   *       employee's 'Display Name' (legacy rows carry the name only).
   *   (c) entries with no unambiguous link are flagged
   *       (__h38PayrollUnlinked) — never guessed onto a person — and
   *       prepareSelection() rewrites their preparation exclusion reason
   *       to the honest 'Not linked to an employee record'. */
  const UNLINKED_REASON='Not linked to an employee record';
  function employeeIdOf(emp){return text(emp&&(emp['Employee ID']||emp.employeeId||emp.id));}
  function normalizeTimeEntries(entries,employees){
    const byId=new Map(),byUser=new Map(),byName=new Map();
    const push=(map,key,emp)=>{if(!key)return;const list=map.get(key)||[];list.push(emp);map.set(key,list);};
    for(const emp of employees||[]){
      const id=employeeIdOf(emp);if(!id)continue;
      push(byId,id,emp);
      push(byUser,text(emp['User ID']||emp.userId),emp);
      push(byName,text(emp['Display Name']||emp['Employee Name']||emp.Name).toLowerCase(),emp);
    }
    const unique=list=>list&&list.length===1?list[0]:null;
    return (entries||[]).map(entry=>{
      const out={...(entry||{})};
      if(!text(out.Date||out.date||out['Work Date'])){
        const stamp=text(out['Start Time']||out.startTime||out['Start Date']);
        const day=stamp.slice(0,10);
        if(/^\d{4}-\d{2}-\d{2}$/.test(day)&&!Number.isNaN(Date.parse(day)))out.Date=day;
      }
      let emp=null,via='';
      const directId=text(out['Employee ID']||out.employeeId);
      if(directId&&byId.has(directId)){emp=byId.get(directId)[0];via='Employee ID';}
      if(!emp){const uid=text(out['User ID']||out.userId);const hit=uid?unique(byUser.get(uid)):null;if(hit){emp=hit;via='User ID';}}
      if(!emp){const nm=text(out['Display Name']||out['Employee Name']||out.Name).toLowerCase();const hit=nm?unique(byName.get(nm)):null;if(hit){emp=hit;via='Display Name';}}
      if(emp){out['Employee ID']=employeeIdOf(emp);out.__h38PayrollLink=via;}
      else out.__h38PayrollUnlinked=true;
      return out;
    });
  }
  /* Selection bridge (pure apart from the pinned preparation call):
   * normalize → payrollPreparation → honest exclusion reasons. Returns
   * {preparation, unlinkedCount, unlinkedIds} so callers can warn plainly
   * instead of misdiagnosing unlinked time as "not approved". */
  function prepareSelection({businessId,periodId,startDate,endDate,employees=[],timeEntries=[],reimbursements=[],mileage=[]}){
    const O=ops();if(!O)throw new Error('Payroll operations module is unavailable.');
    const normalized=normalizeTimeEntries(timeEntries,employees);
    const unlinkedIds=new Set(normalized.filter(e=>e.__h38PayrollUnlinked)
      .map(e=>text(e['Time Entry ID']||e.id)).filter(Boolean));
    const preparation=O.payrollPreparation({businessId,periodId,startDate,endDate,employees,
      timeEntries:normalized,reimbursements,mileage});
    if(unlinkedIds.size&&Array.isArray(preparation['Excluded Sources'])){
      preparation['Excluded Sources']=preparation['Excluded Sources'].map(x=>
        x&&x.kind==='time'&&unlinkedIds.has(text(x.id))&&x.reason==='Employee not in payroll selection'
          ?{...x,reason:UNLINKED_REASON}:x);
    }
    return {preparation,unlinkedCount:unlinkedIds.size,unlinkedIds:[...unlinkedIds]};
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
    preparation,employees=[],existingLines=[],existingRuns=[],config,configSnapshot,createdBy='',nowIso,sourcePreparationId=''}){
    if(!preparation||!Array.isArray(preparation.Items))throw new Error('A payrollPreparation result is required to build a run.');
    const CALC=calcMod();
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
        /* D10 root cause: this literal once carried the shorthand
         * `ytdWagesBefore`, which resolved to the module FUNCTION of that
         * name (the numeric local is `ytdBefore`). A function inside the
         * record makes IndexedDB's structured clone throw DataCloneError
         * inside queueOperation's put(), so the first payrollLines save
         * rejected, saveDraft aborted, and no line was ever queued — while
         * the header (no such field) saved fine. Keep every value in this
         * record plain, cloneable data. */
        'Calc Inputs':{filingStatus:text(employee['Filing Status'])||'Single',
          step2Checked:employee['W-4 Step 2 Checked']===true,
          step3Credits:num(employee['W-4 Step 3 Credits']),step4a:num(employee['W-4 Step 4a Other Income']),
          step4b:num(employee['W-4 Step 4b Deductions']),extraWithholding:num(employee['Extra Withholding']),
          mnAllowances:num(employee['MN Allowances']??employee['Withholding Allowances']),
          mnAdditional:num(employee['MN Additional Withholding']),ytdWagesBefore:ytdBefore,
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
      'Run Source':source,
      /* 'Source Preparation ID' names the payrollPreparations record this
       * run was seeded from — set ONLY when one actually seeded it. The
       * preparation result's own period id is this run's id, so deriving
       * the field from it made every header point at itself (D10). */
      ...(text(sourcePreparationId)?{'Source Preparation ID':text(sourcePreparationId)}:{}),
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
    const ENGINE=engine();if(!ENGINE)throw new Error('Accounting engine is unavailable.');
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
    const ENG=engine();
    if(ENG&&Array.isArray(transactions)){
      try{const grouped=ENG.trialBalance(transactions,accounts||[]);
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
    const C=calcMod();if(!C)return null;
    const rowsForBusiness=snapRows('payrollTaxConfigs').filter(r=>text(r['Business ID'])===text(window.state&&window.state.businessId));
    const record=rowsForBusiness[0];
    return C.createConfig(record||undefined);
  }

  /* Full build: selection via payrollPreparation + run-aware exclusion. */
  async function buildRun({start,end,payDate,source='payroll-page',runId}){
    const O=ops(),C=calcMod();
    if(!O||!C)throw new Error('Payroll modules are still loading. Try again in a moment.');
    const businessId=text(window.state&&window.state.businessId);
    const employees=snapRows('employees').filter(r=>text(r.Status).toUpperCase()!=='INACTIVE');
    const rid=runId||(typeof window.newId==='function'?window.newId('PAYROLL'):`PAYROLL-${Date.now()}`);
    const selection=prepareSelection({businessId,periodId:rid,startDate:start,endDate:end,
      employees,timeEntries:snapRows('timeEntries'),reimbursements:snapRows('reimbursements'),mileage:snapRows('mileage')});
    const preparation=selection.preparation;
    const cfg=loadConfig();
    const built=buildRunRecords({businessId,runId:rid,periodStart:start,periodEnd:end,payDate,source,
      preparation,employees,existingLines:snapRows('payrollLines'),existingRuns:snapRows('payrollPeriods'),config:cfg,
      configSnapshot:cfg,createdBy:text(window.state&&window.state.snapshot&&window.state.snapshot.user&&window.state.snapshot.user.userId)});
    return {...built,preparation,unlinkedCount:selection.unlinkedCount,unlinkedIds:selection.unlinkedIds};
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
   * APPROVE_TIME_ENTRY), then VERIFY with a fresh read of the entries: a
   * queued action being accepted is NOT proof the server stamped anything.
   * The server side is the audited business_office_mark_time_paid RPC
   * (migration 20261020204500): owner/administrator only, the run must be
   * Finalized or Posted, and an entry already paid under another run aborts
   * the batch. If the stamp is not present on the re-read, the honest
   * outcome is STAMP_PENDING.
   * The header may read 'Stamped' only when the stamp is actually present
   * on the entries, using the same markers payrollPreparation treats as
   * paid: Paid === true, or the entry's 'Payroll Period ID' naming this run.
   * The entry ids stay on the run lines either way (double-pay guard). */
  function entryStamped(entry,runId){
    return !!entry&&(entry.Paid===true||text(entry['Payroll Period ID'])===text(runId));
  }
  async function stampTimeEntries(header){
    const runId=text(header['Payroll Period ID']||header.id);
    const lines=snapRows('payrollLines').filter(l=>text(l['Payroll Period ID'])===runId);
    const entryIds=Array.from(new Set(lines.flatMap(l=>Array.isArray(l['Time Entry IDs'])?l['Time Entry IDs']:[]).map(text).filter(Boolean)));
    if(!entryIds.length)return STAMP_DONE; // nothing to stamp (salary-only run)
    if(typeof window.queueOperation==='function'){
      try{
        await window.queueOperation('MARK_TIME_PAID','Time Entry',runId,
          {payrollPeriodId:runId,timeEntryIds:entryIds,batch:true,idempotent:true},
          {collection:'timeEntries',record:{'Payroll Period ID':runId,Paid:true},idKeys:['Time Entry ID']},false);
      }catch(e){/* the re-read below decides the label honestly */}
    }
    await syncQuiet();
    const byId=new Map(snapRows('timeEntries').map(e=>[rowIdOf(e,'Time Entry ID'),e]));
    return entryIds.every(id=>entryStamped(byId.get(id),runId))?STAMP_DONE:STAMP_PENDING;
  }
  async function postRun(runId,{by=''}={}){
    const row=snapRows('payrollPeriods').find(r=>rowIdOf(r,'Payroll Period ID')===text(runId));
    if(!row)throw new Error('Pay run not found.');
    /* Validate the Finalized → Posted transition WITHOUT saving it: the
     * header may flip to Posted (and gain its 'Ledger Transaction ID') only
     * AFTER the GL transaction is safely stored. The old order transitioned
     * first, so a GL failure — or an empty line set — still left a "Posted"
     * header claiming a ledger entry that did not exist (D10). */
    const header=applyTransition(row,'Posted',{by});
    /* Build the GL from the PERSISTED lines (reloaded from the snapshot)
     * and prove they still add up to the header before writing anything.
     * A mismatch fails loudly and the run stays Finalized. */
    const lines=snapRows('payrollLines').filter(l=>text(l['Payroll Period ID'])===text(runId));
    const linesGross=sum(lines,'Gross Pay'),linesNet=sum(lines,'Net Pay');
    if(!lines.length||linesGross!==money(header['Gross Pay'])||linesNet!==money(header['Net Pay'])){
      const msg=`The lines stored for this run add up to gross ${money(linesGross)} / net ${money(linesNet)}, but the run header says gross ${money(header['Gross Pay'])} / net ${money(header['Net Pay'])}. Nothing was posted. Re-save or rebuild the run so its lines are stored, then post again.`;
      try{if(typeof window!=='undefined'&&window.H38Flow&&typeof window.H38Flow.fail==='function')window.H38Flow.fail({what:'Pay run was not posted to the books.',why:msg});}catch(e){}
      throw new Error(msg);
    }
    const tx=postingForRun(header,lines);
    const existing=snapRows('accountingTransactions').some(r=>text(r['Transaction ID']||r.id)===tx.id);
    if(!existing){
      const record={...tx,id:tx.id,'Transaction ID':tx.id,'Business ID':tx.businessId,'Transaction Date':tx.date,
        'Transaction Type':tx.type,'Source Type':tx.sourceType,'Source ID':tx.sourceId,'Memo':tx.memo,
        'Status':tx.status,'Total':tx.total,'Lines':tx.lines,'Created Time':tx.createdAt||new Date().toISOString(),'Record Version':1};
      /* If this save errors, postRun rejects here: the run stays Finalized
       * (the list shows it as not posted) and the error surfaces — never a
       * silent fake Posted. */
      await saveRunRecord('accountingTransactions','Accounting Transaction',tx.id,record,['Transaction ID','id']);
    }
    await saveRunRecord('payrollPeriods','Payroll Period',text(runId),header,['Payroll Period ID']);
    await syncQuiet();
    return {header,transaction:tx,alreadyPosted:existing};
  }
  async function voidRun(runId){return persistTransition(runId,'Void',{});}

  return {BUILD,TRANSITIONS,STAMP_PENDING,STAMP_DONE,
    isContractor,employeeDeductions,ytdWagesBefore,runsContainingEntries,applyRunExclusion,
    normalizeTimeEntries,prepareSelection,UNLINKED_REASON,
    buildRunRecords,transition,applyTransition,postingForRun,ledgerTxId,liabilitySummary,
    buildRun,saveDraft,markReviewed,finalizeRun,postRun,voidRun,stampTimeEntries,loadConfig};
});
