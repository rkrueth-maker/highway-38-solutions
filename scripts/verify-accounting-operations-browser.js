'use strict';
const assert=require('assert');
const path=require('path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const scripts=['accounting-engine.js','accounting-workspace.js','accounting-operations.js','accounting-operations-ui.js'].map(f=>path.join(root,'commercial-app',f));

function snapshot(businessId='B-H38',name='Highway 38 Solutions'){
  return {
    business:{businessId,businessName:name},
    user:{userId:'U-OWNER',roleId:'owner',roleName:'Owner',owner:true},
    users:[{'User ID':'U-OWNER',Name:'Owner','Hourly Rate':0},{'User ID':'U-TECH',Name:'Tech','Hourly Rate':25}],
    customers:[{'Customer ID':'C-1','Customer Name':businessId==='B-H38'?'H38 Test Customer':'Northern Test Customer'}],
    vendors:[{'Vendor ID':'V-1','Vendor Name':businessId==='B-H38'?'H38 Supply':'Northern Supply'}],
    invoices:[{'Invoice ID':'INV-1','Business ID':businessId,'Customer ID':'C-1','Invoice Number':'INV-1','Due Date':'2026-09-25',Total:1000,Balance:600,Status:'Partially Paid'}],
    payments:[{'Payment ID':'PAY-1','Business ID':businessId,'Invoice ID':'INV-1',Amount:100,Date:'2026-09-27'}],
    bankAccounts:[{id:'ACCT-1000','Bank Account ID':'ACCT-1000','Business ID':businessId,'Account Name':'Operating Checking','Account Type':'Checking','Ledger Balance':5000,'Available Balance':5000}],
    vendorBills:[{id:'BILL-1','Bill ID':'BILL-1','Business ID':businessId,'Vendor ID':'V-1','Vendor Name':businessId==='B-H38'?'H38 Supply':'Northern Supply','Bill Number':'100','Bill Date':'2026-09-20','Due Date':'2026-09-26',Total:200,'Open Balance':200,Status:'Approved'}],
    expenses:[{'Expense ID':'EXP-1','Business ID':businessId,'Amount':75,'Receipt Required':'Yes','Receipt ID':'','Expense Date':'2026-09-26','Job ID':'J-1'}],
    timeEntries:[{'Time Entry ID':'T-1','Business ID':businessId,'User ID':'U-TECH',Hours:8,Type:'Regular','Job ID':'J-1'}],
    reimbursements:[],mileage:[],receipts:[],deposits:[],checks:[],paymentInstructions:[],reconciliations:[],cardReconciliations:[],inventoryExceptions:[],payrollPeriods:[],payrollPreparations:[],accountingTransactions:[],accountingAccounts:[],integrationStates:[],recurringMoney:[],customerCredits:[],vendorCredits:[],refunds:[],budgets:[],bankTransactions:[],bankImportBatches:[],assets:[],loans:[]
  };
}

async function install(page,businessId='B-H38',name='Highway 38 Solutions'){
  await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:14px system-ui;margin:0}.grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:12px;padding:12px}.card{grid-column:1/-1;min-width:0;border:1px solid #bbb;padding:12px}.span4{grid-column:span 4}.span6{grid-column:span 6}.span8{grid-column:span 8}.stats,.two,.row-top,.actions{display:flex;gap:8px;flex-wrap:wrap}.row{border-top:1px solid #ddd;padding:8px 0}input,select,textarea,button{max-width:100%;box-sizing:border-box}dialog{max-width:95vw}@media(max-width:600px){.span4,.span6,.span8{grid-column:1/-1}}</style><main id="mainContent"></main><div id="toast"></div>`);
  await page.evaluate(({businessId,snap})=>{
    window.state={businessId,snapshot:snap,page:'accounting',bridgeReady:false};
    window.__ops=[];window.__toasts=[];window.__id=0;
    window.pageHead=(title,sub)=>`<header><h1>${title}</h1><p>${sub}</p></header>`;
    window.newId=prefix=>`${prefix}-TEST-${++window.__id}`;
    window.toast=(message,bad)=>window.__toasts.push({message:String(message),bad:!!bad});
    window.sync=async()=>({ok:true});
    window.renderAccounting=()=>{document.getElementById('mainContent').innerHTML='<div class="grid"><section class="card"><h1>Accounting & Bills</h1></section></div>';};
    window.queueOperation=async(action,recordType,recordId,payload,local)=>{
      window.__ops.push({action,recordType,recordId,payload,local,businessId:window.state.businessId});
      if(action==='SAVE_PARITY_ENTITY'&&payload?.entityKey&&payload?.record){
        const collection=payload.entityKey,record=structuredClone(payload.record);window.state.snapshot[collection]=Array.isArray(window.state.snapshot[collection])?window.state.snapshot[collection]:[];
        const keys=['id','Deposit ID','Customer Credit ID','Refund ID','Vendor Credit ID','Recurring Rule ID','Payroll Period ID','Reimbursement ID','Budget ID','Bank Import Batch ID','Bank Transaction ID','Transaction ID','Check ID'];
        const value=r=>keys.map(k=>r?.[k]).find(v=>v!=null&&String(v)!=='');
        const idx=window.state.snapshot[collection].findIndex(r=>String(value(r))===String(recordId));
        if(idx>=0)window.state.snapshot[collection][idx]=record;else window.state.snapshot[collection].push(record);
      }
      return {ok:true};
    };
  },{businessId,snap:snapshot(businessId,name)});
  for(const script of scripts)await page.addScriptTag({path:script});
  await page.evaluate(()=>window.renderAccounting());
}

async function openOperation(page,kind){
  assert(await page.locator(`[data-h38-accounting-op="${kind}"]`).count()>0,`${kind} owner action must be rendered`);
  await page.evaluate(k=>window.H38_ACCOUNTING_OPERATIONS_UI.open(k),kind);
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1365,height:900}});const errors=[];page.on('pageerror',e=>errors.push(String(e.message||e)));
    await install(page);
    assert.match(await page.locator('#mainContent').innerText(),/Daily money operations/);
    assert.match(await page.locator('#mainContent').innerText(),/1 expense missing required receipts/);
    assert((await page.locator('[data-h38-accounting-op]').count())>=8,'owner operation buttons must be visible');

    await openOperation(page,'deposit');
    await page.locator('#h38OpsDeposit select[name="bank"]').selectOption('ACCT-1000');
    await page.locator('#h38OpsDeposit input[name="payments"]').fill('PAY-1');
    await page.locator('#h38OpsDeposit input[name="gross"]').fill('100');
    await page.locator('#h38OpsDeposit input[name="fees"]').fill('3');
    await page.locator('#h38OpsDeposit').evaluate(form=>form.requestSubmit());
    await page.waitForFunction(()=>window.state.snapshot.deposits.length===1);
    assert.equal(await page.evaluate(()=>window.state.snapshot.accountingTransactions.length),0,'prepared deposit must not post before review');
    await page.evaluate(()=>window.renderAccounting());
    const depositId=await page.evaluate(()=>window.state.snapshot.deposits[0]['Deposit ID']||window.state.snapshot.deposits[0].id);
    await page.evaluate(id=>window.H38_ACCOUNTING_OPERATIONS_UI.recordDeposit(id),depositId);
    await page.waitForFunction(()=>window.state.snapshot.accountingTransactions.length===1&&/Recorded/.test(window.state.snapshot.deposits[0].Status));
    const depositTx=await page.evaluate(()=>window.state.snapshot.accountingTransactions[0]);
    assert.equal(depositTx['Business ID'],'B-H38');assert.equal(depositTx.Lines.reduce((s,l)=>s+Number(l.debit||0)-Number(l.credit||0),0),0);

    await page.evaluate(()=>window.renderAccounting());
    await openOperation(page,'refund');
    await page.locator('#h38OpsRefund select[name="customer"]').selectOption('C-1');
    await page.locator('#h38OpsRefund select[name="bank"]').selectOption('ACCT-1000');
    await page.locator('#h38OpsRefund input[name="amount"]').fill('25');
    await page.locator('#h38OpsRefund').evaluate(form=>form.requestSubmit());
    await page.waitForFunction(()=>window.state.snapshot.refunds.length===1);
    const refund=await page.evaluate(()=>window.state.snapshot.refunds[0]);
    assert.equal(refund['External Transfer Occurred'],false);assert.match(refund.Status,/Approval Required/);

    await page.evaluate(()=>window.renderAccounting());
    await openOperation(page,'payroll');
    await page.locator('#h38OpsPayroll input[name="start"]').fill('2026-09-21');
    await page.locator('#h38OpsPayroll input[name="end"]').fill('2026-09-27');
    await page.locator('#h38OpsPayroll').evaluate(form=>form.requestSubmit());
    await page.waitForFunction(()=>window.state.snapshot.payrollPreparations.length===1);
    const payroll=await page.evaluate(()=>window.state.snapshot.payrollPreparations[0]);
    assert.equal(payroll['Government Filing Performed'],false);assert.equal(payroll['Gross Pay'],200);

    await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.renderAccounting());
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);assert(overflow<=1,`phone layout overflows by ${overflow}px`);

    await page.evaluate(({snap})=>{window.state.businessId='B-NORTHERN';window.state.snapshot=snap;window.renderAccounting();},{snap:snapshot('B-NORTHERN','Northern Lakes')});
    const body=await page.locator('#mainContent').innerText();assert.match(body,/Daily money operations/);assert.doesNotMatch(body,/H38 Supply/);
    await openOperation(page,'customerCredit');
    await page.locator('#h38OpsCustomerCredit select[name="customer"]').selectOption('C-1');
    await page.locator('#h38OpsCustomerCredit input[name="amount"]').fill('10');
    await page.locator('#h38OpsCustomerCredit input[name="reason"]').fill('Test adjustment');
    await page.locator('#h38OpsCustomerCredit').evaluate(form=>form.requestSubmit());
    await page.waitForFunction(()=>window.state.snapshot.customerCredits.length===1);
    const last=await page.evaluate(()=>window.__ops.at(-1));assert.equal(last.businessId,'B-NORTHERN');assert.equal(last.payload.record['Business ID'],'B-NORTHERN');

    await page.evaluate(()=>{window.state.snapshot.user={userId:'U-STAFF',roleId:'staff',roleName:'Staff',owner:false};window.renderAccounting();});
    assert.equal(await page.locator('[data-h38-accounting-operations]').count(),0,'staff must not see owner money operations');
    assert.deepEqual(errors,[]);
    console.log('Accounting operations browser acceptance complete.');
  }finally{await browser.close();}
})().catch(err=>{console.error(err.stack||err);process.exit(1);});
