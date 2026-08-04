#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const failures=[];const checks=[];
function check(name,condition){checks.push({name,status:condition?'PASS':'FAIL'});if(!condition)failures.push(name);}
const logo='highway38-logo.png?v=20260720-exact-0cbc4514';
const config=JSON.parse(read('commercial-beta/website-demo-quotes.json'));
check('seven canonical website quotes',Array.isArray(config.quotes)&&config.quotes.length===7);
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
const index=read('commercial-app/index.html'),delivery=read('commercial-app/app-20.js'),deliveryCss=read('commercial-app/quote-delivery.css'),launcher=read('open-business-office.html'),handoff=read('apps-script/commercial-office-beta/CommercialBeta_Office.html'),setup=read('apps-script/commercial-office-beta/CommercialBeta_Setup.html'),live=read('scripts/verify-commercial-delivery-acceptance.js'),workflow=read('.github/workflows/commercial-google-native-beta.yml');
check('Office header approved logo',index.includes(`../assets/${logo}`)&&index.includes('id="approvedOfficeLogo"')&&index.includes('alt="Highway 38 Solutions"'));
check('Office installed icon approved logo',read('commercial-app/manifest.webmanifest').includes(`../assets/${logo}`));
check('secure launcher approved logo',launcher.includes(`assets/${logo}`)&&launcher.includes('id="approvedLauncherLogo"'));
check('authorized handoff approved logo',handoff.includes(`https://highway38solutions.com/assets/${logo}`)&&handoff.includes('id="approvedLogo"'));
check('setup approved logo',setup.includes(`https://highway38solutions.com/assets/${logo}`));
check('printable preview approved logo',delivery.includes(`const H38_APPROVED_LOGO='/assets/${logo}'`)&&delivery.includes('class="quote-logo"')&&delivery.includes('Print / Save PDF'));
check('print layout exists',deliveryCss.includes('@media print')&&deliveryCss.includes('.quote-document'));
check('Generic customer auto selection',delivery.includes("option.textContent.trim()==='Generic Quote Customer'"));
check('delivery script runs public website examples',live.includes('contractor-quote-complete.html')&&live.includes("['landscape','drainage','seasonal']"));
check('delivery script preserves records',live.includes('preserved.push(quote.quoteId)')&&live.includes('demoRecordsPreserved:true'));
check('delivery script makes no delete or archive calls',!/\b(delete|archive)(Quote|Entity|Record)?\b/i.test(live));
check('delivery script enforces safety',live.includes("externalActionsEnabled===false")&&live.includes('automaticApproval:false')&&live.includes('automaticSend:false')&&live.includes('fundsMoved:false'));
check('release workflow invokes delivery acceptance',workflow.includes('verify-commercial-delivery-acceptance.js'));
console.log(JSON.stringify({status:failures.length?'FAIL':'PASS',checks,failures},null,2));
if(failures.length)process.exit(1);
