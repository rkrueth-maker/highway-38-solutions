#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const exists=file=>fs.existsSync(path.join(root,file));
const failures=[];
const check=(name,condition,detail='')=>{if(!condition)failures.push({name,detail});else console.log(`PASS: ${name}`);};
const required=[
  'apps-script/business-office/BusinessOffice_ModuleRegistry.gs',
  'apps/business-office/BusinessOffice_ModuleRegistry.gs',
  'apps-script/business-office/BusinessOffice_Modular_Suite.html',
  'packages/shared-ui/BusinessOffice_Modular_Suite.html',
  'apps-script/business-office/BusinessOffice_Web.gs',
  'apps/business-office/BusinessOffice_Web.gs'
];
required.forEach(file=>check(`required ${file}`,exists(file)));
const productionRegistry=read(required[0]);
const reusableRegistry=read(required[1]);
const productionClient=read(required[2]);
const reusableClient=read(required[3]);
const productionWeb=read(required[4]);
const reusableWeb=read(required[5]);
const appKeys=[...productionRegistry.matchAll(/key:'([^']+)'/g)].map(match=>match[1]);
const expected=['quote-builder','customer-manager','work-manager','document-center','invoice-payment-tracker','expense-receipt-manager','field-proof','customer-portal','request-intake-manager','price-book-template-manager','approval-center','vendor-purchase-manager','maintenance-manager','shop-flow-manager','business-system'];
check('all fifteen focused products are registered',expected.every(key=>appKeys.includes(key))&&appKeys.length===15,JSON.stringify(appKeys));
check('production and reusable registries are identical',productionRegistry===reusableRegistry);
check('production and reusable clients expose the same product vocabulary',expected.every(key=>productionClient.includes(key)&&reusableClient.includes(key)));
check('one shared platform statement is visible',productionClient.includes('One Core, one customer database, one document system, and one approval system'));
check('standalone installations use configuration instead of copied data',productionRegistry.includes('BO_ENABLED_APPS')&&productionClient.includes("standalone')==='1"));
check('production bootstrap publishes installed apps',productionWeb.includes('apps:boGetBusinessAppCatalog_()'));
check('reusable bootstrap publishes installed apps',reusableWeb.includes('apps: boGetBusinessAppCatalog_()'));
check('production app launcher is included',productionWeb.includes("boInclude_('BusinessOffice_Modular_Suite')"));
check('reusable app launcher is included',reusableWeb.includes("boInclude_('BusinessOffice_Modular_Suite')"));
check('app catalog is read-only metadata',productionWeb.includes('appCatalog:function(){return boGetBusinessAppCatalog_();}')&&!productionRegistry.includes('sendEmail')&&!productionRegistry.includes('UrlFetchApp'));
check('controlled automation language remains visible',productionClient.includes('Controlled automation remains active.')&&productionRegistry.includes('externalActionsAutomatic: false'));
check('shared modules include core customer document and approval records',['customers','documents','approvals'].every(marker=>productionRegistry.includes(`'${marker}'`)));
if(failures.length){console.error(JSON.stringify({status:'FAIL',failures},null,2));process.exit(1);}
console.log(JSON.stringify({status:'PASS',apps:appKeys.length,architecture:'one-core-many-focused-products',standaloneConfiguration:'BO_ENABLED_APPS',externalActionsAutomatic:false},null,2));
