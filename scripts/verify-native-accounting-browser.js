'use strict';
const assert=require('assert');
const path=require('path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const engine=path.join(root,'commercial-app','accounting-engine.js');
const workspace=path.join(root,'commercial-app','accounting-workspace.js');

function snapshot(businessId='B-H38',name='Highway 38 Solutions'){
  return {
    business:{businessId,businessName:name},
    user:{userId:'U-OWNER',roleId:'owner',roleName:'Owner',owner:true},
    vendors:[{'Vendor ID':'V-ABC','Vendor Name':businessId==='B-H38'?'ABC Supply':'Northern Supply'}],
    vendorBills:[{id:'BILL-1','Bill ID':'BILL-1','Business ID':businessId,'Vendor ID':'V-ABC','Vendor Name':businessId==='B-H38'?'ABC Supply':'Northern Supply','Bill Number':'1832','Bill Date':'2026-09-20','Due Date':'2026-09-26',Total:742.18,'Open Balance':742.18,Status:'Draft — Review Required','Record Version':1}],
    bankAccounts:[{id:'BANK-1','Bank Account ID':'BANK-1','Business ID':businessId,'Account Name':'Operating Checking','Account Type':'Checking','Ledger Balance':5000,'Available Balance':5000}],
    bankTransactions:[{id:'BT-1','Bank Transaction ID':'BT-1','Bank Account ID':'BANK-1',Amount:-100,Status:'Cleared'}],
    invoices:[{'Invoice ID':'INV-1','Business ID':businessId,'Customer ID':'C-1','Invoice Number':'INV-1','Due Date':'2026-09-25',Total:1000,Balance:600,Status:'Partially Paid'}],
    payments:[],expenses:[],receipts:[],deposits:[],checks:[],paymentInstructions:[],reconciliations:[],cardReconciliations:[],inventoryExceptions:[],payrollPeriods:[],accountingTransactions:[],accountingAccounts:[],integrationStates:[]
  };
}

async function install(page,businessId='B-H38',name='Highway 38 Solutions'){
  await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:14px system-ui;margin:0}.grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:12px;padding:12px}.card{grid-column:1/-1;min-width:0;border:1px solid #bbb;padding:12px}.span4{grid-column:span 4}.span6{grid-column:span 6}.span8{grid-column:span 8}.stats,.two,.row-top,.actions{display:flex;gap:8px;flex-wrap:wrap}.stat{min-width:0}.row{border-top:1px solid #ddd;padding:8px 0}input,select,textarea,button{max-width:100%;box-sizing:border-box}@media(max-width:600px){.span4,.span6,.span8{grid-column:1/-1}}</style><main id="mainContent"></main><div id="toast"></div>`);
  await page.evaluate(({businessId,snap})=>{
    window.state={businessId,snapshot:snap,page:'accounting',bridgeReady:false};
    window.__ops=[];window.__toasts=[];window.__id=0;
    window.pageHead=(title,sub)=>`<header><h1>${title}</h1><p>${sub}</p></header>`;
    window.newId=prefix=>`${prefix}-TEST-${++window.__id}`;
    window.toast=(message,bad)=>window.__toasts.push({message:String(message),bad:!!bad});
    window.sync=async()=>({ok:true});
    window.openPage=key=>{window.state.page=key;if(key==='accounting')window.renderAccounting?.();};
    window.renderMoney=()=>{document.getElementById('mainContent').innerHTML='<div class="grid"><section class="card"><h1>Money</h1></section></div>';};
    window.renderAccounting=()=>{document.getElementById('mainContent').innerHTML='<div id="legacyAccounting">Legacy accounting</div>';};
    window.queueOperation=async(action,recordType,recordId,payload,local)=>{
      window.__ops.push({action,recordType,recordId,payload,local,businessId:window.state.businessId});
      if(action==='SAVE_PARITY_ENTITY'&&payload?.entityKey&&payload?.record){
        const collection=payload.entityKey,record=structuredClone(payload.record);window.state.snapshot[collection]=Array.isArray(window.state.snapshot[collection])?window.state.snapshot[collection]:[];
        const idx=window.state.snapshot[collection].findIndex(r=>String(r.id||r['Bill ID']||r['Bank Account ID']||r['Check ID']||r['Payment Instruction ID']||r['Reconciliation ID']||r['Transaction ID'])===String(recordId));
        if(idx>=0)window.state.snapshot[collection][idx]=record;else window.state.snapshot[collection].push(record);
      }
      return {ok:true};
    };
  },{businessId,snap:snapshot(businessId,name)});
  await page.addScriptTag({path:engine});
  await page.addScriptTag({path:workspace});
  await page.evaluate(()=>window.renderAccounting());
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1365,height:900}});const errors=[];page.on('pageerror',e=>errors.push(String(e.message||e)));
    await install(page);
    assert.equal(await page.locator('h1').first().innerText(),'Accounting & Bills');
    assert.match(await page.locator('#mainContent').innerText(),/Bills to Pay/);
    assert.match(await page.locator('#mainContent').innerText(),/QuickBooks Online/);
    assert.match(await page.locator('#mainContent').innerText(),/Optional — not connected/);
    assert.deepEqual(errors,[]);

    await page.locator('[data-h38-bill-action="approve"]').first().click();
    await page.waitForFunction(()=>/Approved/.test(window.state.snapshot.vendorBills[0].Status));
    await page.locator('[data-h38-bill-action="check"]').first().click();
    await page.waitForFunction(()=>window.state.snapshot.checks.length===1);
    const check=await page.evaluate(()=>window.state.snapshot.checks[0]);
    assert.equal(check.Negotiable,false);assert.match(check.Status,/Approval Required/);assert.equal(check['Business ID'],'B-H38');

    await page.locator('[data-h38-bill-action="electronic"]').first().click();
    await page.waitForFunction(()=>window.state.snapshot.paymentInstructions.length===1);
    const instruction=await page.evaluate(()=>window.state.snapshot.paymentInstructions[0]);
    assert.equal(instruction['External Transfer Occurred'],false);assert.match(instruction.Status,/Approval Required/);

    await page.locator('#h38VendorBillForm select[name="vendorId"]').selectOption('V-ABC');
    await page.locator('#h38VendorBillForm input[name="billNumber"]').fill('1844');
    await page.locator('#h38VendorBillForm input[name="billDate"]').fill('2026-09-27');
    await page.locator('#h38VendorBillForm input[name="dueDate"]').fill('2026-10-05');
    await page.locator('#h38VendorBillForm input[name="total"]').fill('250.00');
    await page.locator('#h38VendorBillForm').evaluate(form=>form.requestSubmit());
    await page.waitForFunction(()=>window.state.snapshot.vendorBills.length===2&&window.state.snapshot.accountingTransactions.length===1);
    const tx=await page.evaluate(()=>window.state.snapshot.accountingTransactions[0]);
    assert.equal(tx['Business ID'],'B-H38');assert.equal(tx.Total,250);assert.equal(tx.Lines.reduce((s,l)=>s+Number(l.debit||0)-Number(l.credit||0),0),0);

    await page.evaluate(()=>window.renderAccounting());
    await page.locator('#h38ReconcileForm select[name="bankAccountId"]').selectOption('BANK-1');
    await page.locator('#h38ReconcileForm input[name="statementDate"]').fill('2026-09-27');
    await page.locator('#h38ReconcileForm input[name="statementBalance"]').fill('4905');
    await page.locator('#h38ReconcileForm input[name="openingBalance"]').fill('5000');
    await page.locator('#h38ReconcileForm').evaluate(form=>form.requestSubmit());
    await page.waitForFunction(()=>window.state.snapshot.reconciliations.length===1);
    const rec=await page.evaluate(()=>window.state.snapshot.reconciliations[0]);
    assert.equal(rec.Difference,5);assert.equal(rec.Status,'Review Difference');

    await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.renderAccounting());
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert(overflow<=1,`phone layout overflows by ${overflow}px`);

    await page.evaluate(()=>{window.state.businessId='B-NORTHERN';window.state.snapshot={business:{businessId:'B-NORTHERN',businessName:'Northern Lakes'},user:{userId:'U-OWNER',roleId:'owner',roleName:'Owner',owner:true},vendors:[{'Vendor ID':'V-ABC','Vendor Name':'Northern Supply'}],vendorBills:[{id:'NB-1','Bill ID':'NB-1','Business ID':'B-NORTHERN','Vendor ID':'V-ABC','Vendor Name':'Northern Supply','Bill Number':'N-1','Bill Date':'2026-09-20','Due Date':'2026-09-26',Total:90,'Open Balance':90,Status:'Draft — Review Required','Record Version':1}],bankAccounts:[{id:'N-BANK','Bank Account ID':'N-BANK','Business ID':'B-NORTHERN','Account Name':'Northern Checking','Account Type':'Checking','Ledger Balance':2000,'Available Balance':2000}],bankTransactions:[],invoices:[],payments:[],expenses:[],receipts:[],deposits:[],checks:[],paymentInstructions:[],reconciliations:[],cardReconciliations:[],inventoryExceptions:[],payrollPeriods:[],accountingTransactions:[],accountingAccounts:[],integrationStates:[]};window.renderAccounting();});
    const text=await page.locator('#mainContent').innerText();assert.match(text,/Northern Supply/);assert.doesNotMatch(text,/ABC Supply/);
    await page.locator('[data-h38-bill-action="approve"]').first().click();
    const lastOp=await page.evaluate(()=>window.__ops.at(-1));assert.equal(lastOp.businessId,'B-NORTHERN');assert.equal(lastOp.payload.record['Business ID'],'B-NORTHERN');

    await page.evaluate(()=>{window.state.snapshot.user={userId:'U-STAFF',roleId:'staff',roleName:'Staff',owner:false};window.renderAccounting();});
    assert.equal(await page.locator('#legacyAccounting').count(),1,'field/staff user must fall back to permission-limited existing accounting view');
    assert.deepEqual(errors,[]);
    console.log('Native accounting browser acceptance complete.');
  } finally {await browser.close();}
})().catch(err=>{console.error(err.stack||err);process.exit(1);});
