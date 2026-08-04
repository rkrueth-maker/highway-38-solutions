#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const source=path.join(root,'apps-script','commercial-office-beta');
const destination=path.resolve(process.argv[2]||path.join(root,'dist','northern-lakes-commercial-office'));
const PACKAGE_VERSION='nlpm-commercial-office-trial-v1';
function assert(condition,message){if(!condition)throw new Error(message);}
function replace(file,from,to){const target=path.join(destination,file);let text=fs.readFileSync(target,'utf8');assert(text.includes(from),`${file} is missing expected source: ${from}`);text=text.replace(from,to);fs.writeFileSync(target,text);}
function replaceAll(file,from,to){const target=path.join(destination,file);let text=fs.readFileSync(target,'utf8');assert(text.includes(from),`${file} is missing expected source: ${from}`);text=text.split(from).join(to);fs.writeFileSync(target,text);}
assert(fs.existsSync(source),'Commercial Office source directory was not found.');
fs.rmSync(destination,{recursive:true,force:true});fs.mkdirSync(destination,{recursive:true});
for(const entry of fs.readdirSync(source,{withFileTypes:true}))if(entry.isFile())fs.copyFileSync(path.join(source,entry.name),path.join(destination,entry.name));
replace('CommercialBeta_Config.gs',"version:'1.0.0'",`version:'${PACKAGE_VERSION}'`);
replace('CommercialBeta_Config.gs',"environment:'commercial-google-native-beta'","environment:'northern-lakes-commercial-office-trial'");
replace('CommercialBeta_Config.gs',"title:'Highway 38 Business Office'","title:'Northern Lakes Business Office'");
replace('CommercialBeta_Config.gs',"rootFolderName:'Highway 38 Commercial Office Beta'","rootFolderName:'Northern Lakes Commercial Office Trial'");
replace('CommercialBeta_Config.gs',"controlWorkbookName:'Highway 38 Commercial Office Beta — Control Data'","controlWorkbookName:'Northern Lakes Commercial Office — Control Data'");
replace('CommercialBeta_Config.gs',"pwaUrl:'https://highway38solutions.com/commercial-app/'","pwaUrl:'https://highway38solutions.com/businesses/northern-lakes/commercial-app/'");
replace('CommercialBeta_Config.gs',"gatewayUrl:'https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/h38-office-gateway'","gatewayUrl:'https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/nlpm-office-gateway'");
replace('CommercialBeta_Config.gs',"ownerEmails:Object.freeze(['rkrueth@gmail.com'])","ownerEmails:Object.freeze(['northernlakesproperty@gmail.com','rkrueth@gmail.com','mandakw55@gmail.com'])");
replaceAll('CommercialBeta_Office.html','https://highway38solutions.com/assets/highway38-logo.png?v=20260720-exact-0cbc4514','https://highway38solutions.com/businesses/northern-lakes/assets/diamond-logo.png?v=rendered-photo-pass-20260726');
replaceAll('CommercialBeta_Office.html','Highway 38 Solutions','Northern Lakes Property Maintenance');
replaceAll('CommercialBeta_Office.html','Highway 38 Business Office','Northern Lakes Business Office');
replace('CommercialBeta_Office.html',"var BUSINESS_ID=<?!= JSON.stringify(businessId) ?>;","var BUSINESS_ID=<?!= JSON.stringify(businessId) ?>;\n      var REQUESTED_SHELL=<?!= JSON.stringify(shell) ?>;");
replace('CommercialBeta_Office.html',"if(handoff.startup&&handoff.startup.selectedBusinessId)target.searchParams.set('businessId',handoff.startup.selectedBusinessId);","if(handoff.startup&&handoff.startup.selectedBusinessId)target.searchParams.set('businessId',handoff.startup.selectedBusinessId);\n        if(REQUESTED_SHELL==='quote')target.searchParams.set('shell','quote');");
replaceAll('CommercialBeta_Setup.html','https://highway38solutions.com/assets/highway38-logo.png?v=20260720-exact-0cbc4514','https://highway38solutions.com/businesses/northern-lakes/assets/diamond-logo.png?v=rendered-photo-pass-20260726');
replaceAll('CommercialBeta_Setup.html','Highway 38 Solutions','Northern Lakes Property Maintenance');
replaceAll('CommercialBeta_Setup.html','Highway 38 Commercial Office Beta','Northern Lakes Commercial Office Trial');
replace('CommercialBeta_Setup.html','<input id="businessName">','<input id="businessName" value="Northern Lakes Property Maintenance LLC">');
replace('CommercialBeta_Setup.html','<input id="ownerEmail" type="email" value="rkrueth@gmail.com">','<input id="ownerEmail" type="email" value="northernlakesproperty@gmail.com">');
replace('CommercialBeta_Setup.html','<input id="ownerName" value="Rick Krueth">','<input id="ownerName" value="Northern Lakes Owner">');
replaceAll('CommercialBeta_Bridge.html','Highway 38 Business Office','Northern Lakes Business Office');
replaceAll('CommercialBeta_Bridge.html','Secure Highway 38 return connection','Secure Northern Lakes return connection');
replace('CommercialBeta_Web.gs',"var parameters=event&&event.parameter?event.parameter:{},serviceUrl=ScriptApp.getService().getUrl()||'',businessId=cbText_(parameters.businessId),forceInstaller=cbText_(parameters.install)==='1';","var parameters=event&&event.parameter?event.parameter:{},serviceUrl=ScriptApp.getService().getUrl()||'',businessId=cbText_(parameters.businessId),shell=cbText_(parameters.shell),forceInstaller=cbText_(parameters.install)==='1';");
replace('CommercialBeta_Web.gs',"office.businessId=businessId;office.businessName=businessRow?businessRow['Business Name']:'Commercial Office';office.homeUrl=serviceUrl+'?install=1';office.pwaUrl=CB_CONFIG.pwaUrl;","office.businessId=businessId;office.businessName=businessRow?businessRow['Business Name']:'Commercial Office';office.shell=shell==='quote'?'quote':'';office.homeUrl=serviceUrl+'?install=1';office.pwaUrl=CB_CONFIG.pwaUrl;");
replace('CommercialBeta_Web.gs',"setTitle('H38 Secure Bridge')","setTitle('Northern Lakes Secure Bridge')");
replace('CommercialBeta_Web.gs',"setTitle('Commercial Office — '+office.businessName)","setTitle('Northern Lakes Office — '+office.businessName)");
const config=fs.readFileSync(path.join(destination,'CommercialBeta_Config.gs'),'utf8');
for(const expected of [PACKAGE_VERSION,'Northern Lakes Business Office','nlpm-office-gateway','northernlakesproperty@gmail.com','mandakw55@gmail.com'])assert(config.includes(expected),`Built config is missing ${expected}.`);
for(const forbidden of ['h38-office-gateway',"ownerEmails:Object.freeze(['rkrueth@gmail.com'])","pwaUrl:'https://highway38solutions.com/commercial-app/'"])assert(!config.includes(forbidden),`Built config retained forbidden H38 tenant value: ${forbidden}`);
const files=fs.readdirSync(destination).filter(name=>/\.(?:gs|html|json)$/.test(name)).sort();
assert(files.includes('CommercialBeta_Web.gs')&&files.includes('appsscript.json'),'Built source is incomplete.');
console.log(JSON.stringify({status:'PASS',packageVersion:PACKAGE_VERSION,destination,files:files.length,existingProjectOnly:true,externalActionsEnabled:false},null,2));
