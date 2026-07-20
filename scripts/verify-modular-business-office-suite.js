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
const keys=text=>[...text.matchAll(/key:'([^']+)'/g)].map(match=>match[1]);
const appKeys=keys(productionRegistry), reusableKeys=keys(reusableRegistry);
const expected=['quote-builder','customer-manager','work-manager','field-operations','document-center','invoice-payment-tracker','expense-receipt-manager','field-proof','social-control','customer-portal','request-intake-manager','price-book-template-manager','approval-center','vendor-purchase-manager','maintenance-manager','shop-flow-manager','business-system'];
const sharedMenu=['Business Apps','Today','Customers','Work','Documents','Money','Approvals','Reports','Setup'];
check('all seventeen focused products are registered',expected.every(key=>appKeys.includes(key))&&appKeys.length===17,JSON.stringify(appKeys));
check('branded and reusable registries expose identical app keys',JSON.stringify(appKeys)===JSON.stringify(reusableKeys));
check('reusable registry remains white-label',!/Highway\s*38|H38_|rkrueth|highway-38-solutions/i.test(reusableRegistry));
check('production registry carries Highway 38 product branding',/Highway 38 Quote Builder/.test(productionRegistry)&&/Highway 38 Business System/.test(productionRegistry));
check('production and reusable clients expose the same focused launcher contract',['Your Business Apps','openBusinessApp','bo-app-workspace','Standalone view'].every(marker=>productionClient.includes(marker)&&reusableClient.includes(marker)));
check('shared Business Office menu has exactly the approved nine destinations',sharedMenu.every(label=>productionClient.includes(`label:'${label}'`))&&(productionClient.match(/label:'/g)||[]).length===9);
check('reusable UI has the same approved shared menu',sharedMenu.every(label=>reusableClient.includes(`label:'${label}'`))&&(reusableClient.match(/label:'/g)||[]).length===9);
check('focused apps render their own internal navigation',productionClient.includes('bo-app-tabs')&&productionClient.includes('renderFocusedNav')&&productionClient.includes('app.modules.map'));
check('standalone view hides shared Office navigation',productionClient.includes('.bo-standalone .bo-nav-shared')&&productionClient.includes('currentStandalone()&&app'));
check('raw module list is not restored by the modular navigation layer',!productionClient.includes('originalRenderNav'));
check('Today workspace is explicit and approval-aware',productionClient.includes('renderTodayWorkspace')&&productionClient.includes('Review approvals'));
check('one shared platform statement is visible',productionClient.includes('One Core, one customer database, one document system, and one approval system'));
check('standalone installations use configuration instead of copied data',productionRegistry.includes('BO_ENABLED_APPS')&&productionClient.includes("standalone')==='1"));
check('production bootstrap publishes installed apps',productionWeb.includes('apps:boGetBusinessAppCatalog_()'));
check('reusable bootstrap publishes installed apps',reusableWeb.includes('apps: boGetBusinessAppCatalog_()'));
check('production app launcher is included',productionWeb.includes("boInclude_('BusinessOffice_Modular_Suite')"));
check('reusable app launcher is included',reusableWeb.includes("boInclude_('BusinessOffice_Modular_Suite')"));
check('app catalog is read-only metadata',productionWeb.includes('appCatalog:function(){return boGetBusinessAppCatalog_();}')&&!productionRegistry.includes('sendEmail')&&!productionRegistry.includes('UrlFetchApp'));
check('controlled automation language remains visible',productionClient.includes('Controlled automation remains active.')&&productionRegistry.includes('externalActionsAutomatic: false'));
check('shared modules include core customer document and approval records',['customers','documents','approvals'].every(marker=>productionRegistry.includes(`'${marker}'`)));
check('Field Operations is reusable and standalone-capable',productionRegistry.includes("key:'field-operations'")&&reusableRegistry.includes("key:'field-operations'")&&productionRegistry.includes("name:'Highway 38 Field Operations'")&&reusableRegistry.includes("name:'Field Operations'"));
check('Social Control is reusable and owner-approval controlled',productionRegistry.includes("key:'social-control'")&&reusableRegistry.includes("key:'social-control'")&&productionRegistry.includes("modules:['social','documents','approvals','reports']"));
if(failures.length){console.error(JSON.stringify({status:'FAIL',failures},null,2));process.exit(1);}
console.log(JSON.stringify({status:'PASS',apps:appKeys.length,sharedMenuItems:sharedMenu.length,architecture:'app-first-shared-office-with-focused-menus',standaloneConfiguration:'BO_ENABLED_APPS',whiteLabelReusableSource:true,externalActionsAutomatic:false},null,2));
