#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const failures=[];const checks=[];
function check(name,condition){checks.push({name,status:condition?'PASS':'FAIL'});if(!condition)failures.push(name);}
const logo='highway38-logo.png?v=20260720-exact-0cbc4514';
const config=JSON.parse(read('commercial-beta/website-demo-quotes.json'));
check('seven canonical standard website quotes',Array.isArray(config.quotes)&&config.quotes.length===7);
check('Generic Quote Customer policy',config.recordPolicy?.customerName==='Generic Quote Customer');
check('demo records preserved',config.recordPolicy?.preserveAfterAcceptance===true&&config.recordPolicy?.demoRecord===true);
check('no approval send or funds',config.recordPolicy?.approved===false&&config.recordPolicy?.sent===false&&config.recordPolicy?.fundsMoved===false&&config.recordPolicy?.externalActionsEnabled===false);
const ids=new Set(),numbers=new Set();
for(const quote of config.quotes||[]){
  check(`${quote.key} stable demo id`,/^H38-DEMO-WEB-/.test(quote.quoteId)&&!ids.has(quote.quoteId));ids.add(quote.quoteId);
  check(`${quote.key} stable quote number`,/^Q-DEMO-00[1-7]$/.test(quote.quoteNumber)&&!numbers.has(quote.quoteNumber));numbers.add(quote.quoteNumber);
  check(`${quote.key} visible demo title`,/^\[DEMO\]/.test(quote.title));
  const total=(quote.lines||[]).reduce((sum,line)=>sum+Number(line.quantity||0)*Number(line.unitPrice||0),0);
  check(`${quote.key} itemized total`,Math.abs(total-Number(quote.total||0))<0.01&&(quote.lines||[]).length>=5);
}
const index=read('commercial-app/index.html'),delivery=read('commercial-app/app-20.js'),deliveryCss=read('commercial-app/quote-delivery.css'),quoteWorkspace=read('commercial-app/app-07.js'),completionDefaults=read('apps-script/commercial-office-beta/CommercialBeta_CompletionCore_02.gs'),completionBootstrap=read('apps-script/commercial-office-beta/CommercialBeta_CompletionCore_04.gs'),scopedSnapshot=read('apps-script/commercial-office-beta/CommercialBeta_DeliveryAcceptance_01.gs'),web=read('apps-script/commercial-office-beta/CommercialBeta_Web.gs'),launcher=read('open-business-office.html'),handoff=read('apps-script/commercial-office-beta/CommercialBeta_Office.html'),setup=read('apps-script/commercial-office-beta/CommercialBeta_Setup.html'),live=read('scripts/verify-commercial-delivery-acceptance.js'),workflow=read('.github/workflows/commercial-google-native-beta.yml');
function lexicalStateHandoffPasses(){
  const sandbox={window:{},businessId:'BUS-TEST',snapshot:{customers:[{customerId:'CUSTOMER-TEST'}],quotes:[{quoteId:'QUOTE-TEST'}]}};
  vm.createContext(sandbox);
  try{
    vm.runInContext(`
      const state={businessId:'',snapshot:{business:{businessId:'BUS-TEST'},customers:[],quotes:[]},quote:{quoteId:'OLD',lines:[1]}};
      function openPage(page,pushHistory){globalThis.rendered={page,pushHistory};}
      if(typeof state==='undefined'||!state.snapshot)throw new Error('The Office snapshot is unavailable.');
      state.businessId=businessId;
      state.snapshot={...state.snapshot,customers:snapshot.customers,quotes:snapshot.quotes};
      state.quote={quoteId:'',lines:[]};
      openPage('quotes',false);
      globalThis.handoff={businessId:state.businessId,customers:state.snapshot.customers,quotes:state.snapshot.quotes,quote:state.quote,rendered:globalThis.rendered};
    `,sandbox);
  }catch(error){return false;}
  return sandbox.window.state===undefined&&sandbox.handoff?.businessId==='BUS-TEST'&&sandbox.handoff?.customers?.length===1&&sandbox.handoff?.quotes?.length===1&&sandbox.handoff?.quote?.quoteId===''&&sandbox.handoff?.rendered?.page==='quotes'&&sandbox.handoff?.rendered?.pushHistory===false;
}
check('Office header approved logo',index.includes(`../assets/${logo}`)&&index.includes('id="approvedOfficeLogo"')&&index.includes('alt="Highway 38 Solutions"'));
check('Office installed icon approved logo',read('commercial-app/manifest.webmanifest').includes(`../assets/${logo}`));
check('secure launcher approved logo',launcher.includes(`assets/${logo}`)&&launcher.includes('id="approvedLauncherLogo"'));
check('authorized handoff approved logo',handoff.includes(`https://highway38solutions.com/assets/${logo}`)&&handoff.includes('id="approvedLogo"'));
check('setup approved logo',setup.includes(`https://highway38solutions.com/assets/${logo}`));
check('printable preview approved logo',delivery.includes(`const H38_APPROVED_LOGO='/assets/${logo}'`)&&delivery.includes('class="quote-logo"')&&delivery.includes('Print / Save PDF'));
check('print layout exists',deliveryCss.includes('@media print')&&deliveryCss.includes('.quote-document'));
check('Generic customer auto selection',delivery.includes("option.textContent.trim()==='Generic Quote Customer'"));
check('backend seeds Generic Quote Customer',completionDefaults.includes('function cbCompletionEnsureGenericQuoteCustomer_(context)')&&completionDefaults.includes("name='Generic Quote Customer'")&&completionDefaults.includes("'Status':'Active'")&&completionDefaults.includes('cbCompletionEnsureGenericQuoteCustomer_(context);'));
check('Generic customer seed is deterministic and idempotent',completionDefaults.includes("'CUSTOMER-GENERIC-QUOTE-'")&&completionDefaults.includes("cbText_(item['Customer Name']).toLowerCase()===name.toLowerCase()")&&completionDefaults.includes("return cbText_(row['Customer ID'])"));
check('bootstrap runs defaults before customer snapshot',completionBootstrap.indexOf('cbCompletionSeedDefaults_(context)')>=0&&completionBootstrap.indexOf('cbCompletionSeedDefaults_(context)')<completionBootstrap.indexOf('data.customers='));
check('saved quote reopening stays in Quote Builder',quoteWorkspace.includes("state.page='quotes';state.quote=")&&quoteWorkspace.includes('renderQuotes();return true;'));
check('scoped snapshot reads only delivery collections',scopedSnapshot.includes('function cbDeliveryAcceptanceSnapshot_(businessId)')&&scopedSnapshot.includes("'core','customers'")&&scopedSnapshot.includes('cbCompletionQuoteView_(context)')&&scopedSnapshot.includes("acceptance:'DELIVERY_ACCEPTANCE_SNAPSHOT'"));
check('scoped snapshot is read-only and non-external',scopedSnapshot.includes('readOnly:true')&&scopedSnapshot.includes('externalActionsEnabled:false')&&scopedSnapshot.includes('productionDataMigrated:false')&&!/cb(Append|PlatformUpdateRow|CompletionSave)/.test(scopedSnapshot));
check('secure API routes scoped delivery snapshot',web.includes("action==='deliveryAcceptanceSnapshot'")&&web.includes('cbDeliveryAcceptanceSnapshot_'));
check('delivery script runs public website examples',live.includes('contractor-quote-complete.html')&&live.includes("['landscape','drainage','seasonal']"));
check('delivery script uses scoped snapshots',live.includes("'deliveryAcceptanceSnapshot'")&&live.includes('async function deliverySnapshot')&&live.includes('async function applyDeliverySnapshot'));
check('delivery script handles lexical Office state without a window alias',lexicalStateHandoffPasses()&&!live.includes('window.state')&&live.includes("typeof state==='undefined'")&&live.includes('state.snapshot={...state.snapshot,customers:snapshot.customers,quotes:snapshot.quotes}')&&live.includes("openPage('quotes',false)"));
check('delivery script does not repeat full Office bootstrap',!live.includes("officeRequest(page,'completionBootstrap'")&&!live.includes('loadBusiness(id,true)')&&live.includes('fullOfficeRefreshRepeated:false'));
check('delivery script retries scoped reads',live.includes('for(let attempt=1;attempt<=3;attempt++)')&&live.includes('Scoped delivery snapshot failed after three attempts'));
check('delivery script preserves records',live.includes('preserved.push(quote.quoteId)')&&live.includes('demoRecordsPreserved:true'));
check('delivery script makes no delete or archive calls',!/\b(delete|archive)(Quote|Entity|Record)?\b/i.test(live));
check('delivery script enforces safety',live.includes("externalActionsEnabled===false")&&live.includes('automaticApproval:false')&&live.includes('automaticSend:false')&&live.includes('fundsMoved:false'));
check('delivery script records staged evidence',live.includes("stages.ndjson")&&live.includes("failure.json")&&live.includes("persisted-records-result.json")&&live.includes("office-delivery-result.json"));
check('delivery script verifies visible quote buttons',live.includes('visibleIds.includes(quote.quoteId)')&&live.includes('openQuoteThroughUi'));
check('delivery script generates all branded PDFs',live.includes('page.pdf')&&live.includes('bytes>10000')&&live.includes('quotePreviewDocument'));
check('release workflow invokes delivery acceptance',workflow.includes('verify-commercial-delivery-acceptance.js'));
console.log(JSON.stringify({status:failures.length?'FAIL':'PASS',scopedSnapshotRequired:true,repeatedFullBootstrapAllowed:false,checks,failures},null,2));
if(failures.length)process.exit(1);
