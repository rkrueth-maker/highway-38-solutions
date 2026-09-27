'use strict';
const assert=require('assert');
const path=require('path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const engine=path.join(root,'commercial-app','accounting-engine.js');
const bridge=path.join(root,'commercial-app','accounting-posting-bridge.js');

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();
    await page.setContent('<!doctype html><div id="toast"></div>');
    await page.evaluate(()=>{
      window.state={businessId:'B-H38',snapshot:{business:{businessId:'B-H38'},invoices:[{'Invoice ID':'INV-PAY','Business ID':'B-H38','Customer ID':'C-1','Job ID':'J-1','Invoice Number':'INV-PAY',Total:100,Balance:100,Status:'Draft'}],accountingTransactions:[],accountingExceptions:[]}};
      window.__baseOps=[];window.__toasts=[];
      window.toast=(message,bad)=>window.__toasts.push({message:String(message),bad:!!bad});
      window.queueOperation=async(action,recordType,recordId,payload,local,autoSync)=>{
        window.__baseOps.push({action,recordType,recordId,payload,local,autoSync,businessId:window.state.businessId});
        if(action==='SAVE_PARITY_ENTITY'&&payload?.entityKey&&payload?.record){
          const list=window.state.snapshot[payload.entityKey]||(window.state.snapshot[payload.entityKey]=[]),key=String(recordId),idx=list.findIndex(r=>String(r.id||r['Transaction ID']||r['Accounting Exception ID'])===key);if(idx>=0)list[idx]=structuredClone(payload.record);else list.push(structuredClone(payload.record));
        }
        if(action==='SAVE_ENTITY'&&payload?.entity==='invoices'&&payload.record){const list=window.state.snapshot.invoices,idx=list.findIndex(r=>String(r['Invoice ID']||r.id)===String(recordId));if(idx>=0)list[idx]=structuredClone(payload.record);}
        return {ok:true};
      };
    });
    await page.addScriptTag({path:engine});
    await page.addScriptTag({path:bridge});
    assert.equal(await page.evaluate(()=>window.H38_ACCOUNTING_POSTING_BRIDGE?.enabled),true);

    await page.evaluate(()=>window.queueOperation('SAVE_INVOICE','Invoice','INV-NEW',{customerId:'C-2',jobId:'J-2',lines:[{quantity:2,unitPrice:75}],tax:0},{collection:'invoices',record:{'Invoice ID':'INV-NEW','Business ID':'B-H38'},idKeys:['Invoice ID']}));
    let ledger=await page.evaluate(()=>window.state.snapshot.accountingTransactions);
    assert.equal(ledger.length,1);assert.equal(ledger[0]['Transaction ID'],'GL-INVOICE-INV-NEW');assert.equal(ledger[0]['Business ID'],'B-H38');assert.equal(ledger[0].Total,150);
    assert.equal(ledger[0].Lines.reduce((sum,l)=>sum+Number(l.debit||0)-Number(l.credit||0),0),0);

    await page.evaluate(()=>window.queueOperation('SAVE_INVOICE','Invoice','INV-NEW',{customerId:'C-2',jobId:'J-2',lines:[{quantity:2,unitPrice:75}],tax:0},null));
    ledger=await page.evaluate(()=>window.state.snapshot.accountingTransactions);
    assert.equal(ledger.filter(r=>r['Transaction ID']==='GL-INVOICE-INV-NEW').length,1,'invoice retry must not double-post');

    await page.evaluate(()=>window.queueOperation('RECORD_PAYMENT','Payment','PAY-1',{invoiceId:'INV-PAY',amount:40,method:'Check',reference:'TEST'},null,false));
    ledger=await page.evaluate(()=>window.state.snapshot.accountingTransactions);
    const pay=ledger.find(r=>r['Transaction ID']==='GL-PAYMENT-PAY-1');assert(pay);assert.equal(pay['Business ID'],'B-H38');assert.equal(pay.Total,40);assert.equal(pay.Lines[0].accountId,'ACCT-1200');

    await page.evaluate(()=>window.queueOperation('SAVE_INVOICE','Invoice','INV-DEL',{customerId:'C-3',jobId:'J-3',lines:[{quantity:1,unitPrice:200}],tax:0},null));
    await page.evaluate(()=>window.queueOperation('SAVE_ENTITY','Invoice','INV-DEL',{entity:'invoices',record:{'Invoice ID':'INV-DEL','Invoice Number':'INV-DEL','Business ID':'B-H38',Status:'Deleted',Deleted:true}},null,false));
    ledger=await page.evaluate(()=>window.state.snapshot.accountingTransactions);
    const original=ledger.find(r=>r['Transaction ID']==='GL-INVOICE-INV-DEL'),reversal=ledger.find(r=>r['Transaction ID']==='REV-INVOICE-INV-DEL');assert(original&&reversal);assert.equal(reversal.reversalOf,original.id);assert.equal(original.Total,reversal.Total);

    await page.evaluate(()=>window.queueOperation('RECORD_PAYMENT','Payment','PAY-BAD',{invoiceId:'MISSING',amount:10},null,false));
    const exception=await page.evaluate(()=>window.state.snapshot.accountingExceptions[0]);assert(exception);assert.equal(exception['Business ID'],'B-H38');assert.equal(exception.Status,'Review Required');

    await page.evaluate(()=>{window.state.businessId='B-NORTHERN';window.state.snapshot.business={businessId:'B-NORTHERN'};window.state.snapshot.invoices=[];window.state.snapshot.accountingTransactions=[];window.state.snapshot.accountingExceptions=[];});
    await page.evaluate(()=>window.queueOperation('SAVE_INVOICE','Invoice','N-INV-1',{customerId:'N-C1',jobId:'N-J1',lines:[{quantity:1,unitPrice:90}],tax:0},null));
    const northern=await page.evaluate(()=>window.state.snapshot.accountingTransactions[0]);assert.equal(northern['Business ID'],'B-NORTHERN');assert.equal(northern['Transaction ID'],'GL-INVOICE-N-INV-1');

    const unsafe=await page.evaluate(()=>window.H38_ACCOUNTING_POSTING_BRIDGE);assert.equal(unsafe.expenseAutopost,false);assert.match(unsafe.reasonExpenseAutopostDisabled,/Funding\/payment method/);
    console.log('Accounting posting bridge acceptance complete.');
  } finally {await browser.close();}
})().catch(err=>{console.error(err.stack||err);process.exit(1);});
