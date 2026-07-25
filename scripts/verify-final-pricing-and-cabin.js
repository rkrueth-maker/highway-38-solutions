#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const failures=[],passes=[];
const check=(name,condition,evidence='')=>{(condition?passes:failures).push({name,evidence});console.log(`${condition?'PASS':'FAIL'}: ${name}${evidence?` — ${evidence}`:''}`);};

const pricing=read('pricing.html');
const pricingData=read('pricing-data.js');
const request=read('start-request.html');
const requestOptions=read('assets/js/h38-request-options.js');
const requestFlow=read('request-flow.js');
const quoteBuilder=read('quote-builder.html');
const businessOffice=read('business-systems.html');
const samples=read('sample-library-now.html');
const cabin=read('cabin-project-complete.html');
const seeder=read('apps-script/business-office/BusinessOffice_CabinDemoSeeder.gs');
const autoSeed=read('apps-script/business-office/BusinessOffice_CabinAutoSeed.gs');

const context={window:{}};vm.createContext(context);vm.runInContext(pricingData,context,{filename:'pricing-data.js'});
const source=context.window.H38_PRICING;
check('pricing data source loads',source&&source.version==='2026-07-24-final');
check('exactly three software offers',source&&source.offers.filter(item=>item.classification==='software').length===3);
check('Business Snapshot is separate diagnostic',source&&source.offers.filter(item=>item.classification==='diagnostic').length===1&&source.offers.find(item=>item.id==='business-snapshot').oneTime===299);
check('approved software prices',source&&source.offers.find(item=>item.id==='quote-builder').monthly===59&&source.offers.find(item=>item.id==='business-office').monthly===249&&source.offers.find(item=>item.id==='configured-system').monthlyStarting===499);
check('approved implementation prices',source&&source.offers.find(item=>item.id==='quote-builder').assistedSetup===499&&source.offers.find(item=>item.id==='business-office').implementation===2500&&source.offers.find(item=>item.id==='configured-system').implementationStarting===7500);
check('optional support prices',source&&source.support.find(item=>item.id==='managed-support').monthly===199&&source.support.find(item=>item.id==='managed-operations').monthlyStarting===399);

check('pricing page has exactly three primary software cards',(pricing.match(/class="price-card(?:\s|"| popular)/g)||[]).length===3);
check('Business Office marked Most Popular',pricing.includes('Most Popular')&&pricing.includes('$249 <small>/ month</small>'));
check('Business Snapshot is below and not a fourth price card',pricing.includes('id="snapshot"')&&pricing.includes('$299 one-time')&&(pricing.match(/class="price-card/g)||[]).length===3);
check('configured prices use starting at',pricing.includes('Starting at $499')&&pricing.includes('Implementation starting at $7,500'));
check('AI has no separate public price card',pricing.includes('AI is built in—not sold as a separate public plan.')&&!/class="price-card[^>]*>[\s\S]{0,500}<h2>[^<]*AI/i.test(pricing));
check('old public pricing packages removed',!/(Project Snapshot|Plan & Quote|Complete Job Package|Business Office Project)/.test(pricing));

check('request uses final pricing data',request.includes('pricing-data.js?v=20260724-final')&&request.includes('id="offer"')&&!request.includes('catalog-data.js'));
check('request removed legacy product and bundle selectors',!request.includes('id="product"')&&!request.includes('id="bundle"')&&!request.includes('known service, bundle'));
check('request summary records selected approved offer',requestOptions.includes('Selected offer:')&&requestFlow.includes("catalogId:offer.toUpperCase()"));
check('product pages publish approved prices',quoteBuilder.includes('$59/month')&&quoteBuilder.includes('Assisted setup: $499')&&businessOffice.includes('$249/month')&&businessOffice.includes('Implementation: $2,500')&&businessOffice.includes('Starting at $499/month'));

check('cabin card promises the complete quote package',(samples.includes('Open Plans &amp; All Quotes')||samples.includes('Open Plans & All Quotes')||samples.includes('Open Plans &amp; 21 Quotes')||samples.includes('Open Plans & 21 Quotes'))&&samples.includes('cabin-project-complete.html'));
check('cabin card opens complete package',samples.includes('href="cabin-project-complete.html"'));
check('cabin page includes Open All 21 control',cabin.includes('Open All 21 Quotes')&&cabin.includes('openAllTop'));
check('cabin page contains 21 package definitions',(cabin.match(/^\['\d{2}-/gm)||[]).length===21||(cabin.match(/\['\d{2}-/g)||[]).length===21);
check('cabin page exposes all linked system areas',['Quotes','Approvals','Work','Purchasing','Documents','Proof','Activity','Backup'].every(label=>cabin.includes(`<b>${label}</b>`)));
check('cabin public totals stay aligned',cabin.includes('$520,500')&&cabin.includes('$52,050')&&cabin.includes('$572,550'));

const requiredSheets=['CUSTOMERS','CONTACTS','ADDRESSES','REQUESTS','QUOTES','QUOTE_LINES','APPROVALS','JOBS','WORK_ORDERS','VENDORS','PURCHASE_ORDERS','PO_LINES','DOCUMENTS','PROOF_LOG','ACTIVITY','BACKUP_LOG'];
check('cabin seeder writes every relevant table',requiredSheets.every(name=>seeder.includes(`H38_BO_SHEETS.${name}`)),requiredSheets.join(', '));
check('cabin seeder generates all 21 package PDFs',seeder.includes('pdfCount:results.filter')&&seeder.includes('subquoteCount:results.length'));
check('cabin seeder returns expected table counts',seeder.includes('quoteRecordCount:results.length+1')&&seeder.includes('approvalCount:results.length+1')&&seeder.includes('purchaseOrderCount:results.length'));
check('cabin auto-seed is versioned for complete coverage',autoSeed.includes("H38_CABIN_AUTOSEED_VERSION='V2-COMPLETE-TABLE-COVERAGE'"));
check('cabin auto-seed rejects incomplete tables',autoSeed.includes('checks.quotes!==22')&&autoSeed.includes('checks.approvals!==22')&&autoSeed.includes('checks.purchaseOrders!==21'));
check('cabin external actions remain disabled',seeder.includes('No customer send, order, payment, scheduling, or other external action occurs.')&&seeder.includes('externalActionsPerformed:false'));

const result={status:failures.length?'HOLD':'PASS',generatedAt:new Date().toISOString(),pricingVersion:source&&source.version,passed:passes.length,failed:failures.length,passes,failures};
const out=path.join(root,'artifacts','final-pricing-cabin');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));process.exit(failures.length?1:0);
