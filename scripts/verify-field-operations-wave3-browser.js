'use strict';
const path=require('path');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const writes=[];
 await page.setContent('<!doctype html><html><body><main id="mainContent"><div class="grid"></div></main></body></html>');
 await page.addInitScript(()=>{});
 await page.evaluate(()=>{
  window.state={page:'schedule',businessId:'BIZ-H38',bridgeReady:false,snapshot:{business:{businessId:'BIZ-H38',businessName:'H38'},user:{id:'U1','User ID':'U1',owner:true,role:'owner'},users:[{'Business ID':'BIZ-H38','User ID':'U1',Name:'Owner'}],jobs:[{'Business ID':'BIZ-H38','Job ID':'J1','Customer ID':'C1','Project Title':'Urgent plow','Service Address':'1 Test St',Priority:'Urgent',Status:'Open','Assigned User IDs':['U1'],'Field State':'Assigned','Record Version':1}],scheduleEvents:[],assets:[{'Business ID':'BIZ-H38','Asset ID':'A1',Name:'Truck'}],fleetVehicles:[{'Business ID':'BIZ-H38','Vehicle ID':'V1',Nickname:'Truck 1',Latitude:47,Longitude:-93,'Assigned User ID':'U1','Current Meter':100,'Next Service Meter':200}],customForms:[]}};
  window.queueOperation=async(...args)=>{window.__writes=(window.__writes||[]);window.__writes.push(args);return{ok:true};};window.sync=async()=>({ok:true});window.H38DB={all:async()=>[]};window.openPage=p=>{window.state.page=p;document.getElementById('mainContent').innerHTML='<div class="grid"></div>';window.dispatchEvent(new Event('h38:office-page-rendered'));};
 });
 await page.addScriptTag({path:path.resolve('commercial-app/field-operations-next.js')});
 await page.addScriptTag({path:path.resolve('commercial-app/field-operations-ui.js')});
 await page.waitForSelector('#h38Wave3Dispatch');
 if(!await page.locator('#h38Wave3Dispatch').innerText().then(t=>t.includes('Urgent plow')))throw new Error('Dispatch board did not render unscheduled work.');
 const dead=await page.locator('#h38Wave3Dispatch button:visible:not([disabled])').evaluateAll(nodes=>nodes.filter(n=>typeof n.onclick!=='function').map(n=>n.textContent.trim()));if(dead.length)throw new Error(`Wave 3 dispatch has dead buttons: ${dead.join(', ')}`);
 await page.locator('[data-field-schedule="J1"]').click();await page.waitForSelector('#h38FieldScheduleForm');await page.locator('#h38FieldScheduleForm input[name="date"]').fill('2026-09-28');await page.locator('#h38FieldScheduleForm input[name="time"]').fill('08:00');await page.locator('#h38FieldScheduleForm').evaluate(f=>f.requestSubmit());await page.waitForTimeout(50);const writeCount=await page.evaluate(()=>window.__writes?.length||0);if(writeCount!==1)throw new Error(`Expected one schedule save, saw ${writeCount}.`);
 await page.evaluate(()=>{window.state.page='today';document.getElementById('mainContent').innerHTML='<div class="grid"></div>';window.dispatchEvent(new Event('h38:office-page-rendered'));});await page.waitForSelector('#h38Wave3FieldFlow');const travel=page.locator('[data-field-to="Travel"]');if(!await travel.count())throw new Error('Travel action missing from field flow.');await travel.first().click();await page.waitForTimeout(30);if((await page.evaluate(()=>window.__writes?.length||0))<2)throw new Error('Field transition did not save through canonical queue.');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(30);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+2);if(overflow)throw new Error('Wave 3 phone UI overflows horizontally.');
 const financeText=await page.locator('#h38Wave3Offline').innerText();if(!/never execute offline/i.test(financeText))throw new Error('Offline financial boundary is not visible.');
 await page.evaluate(()=>{window.state={...window.state,page:'fleet',businessId:'BIZ-NORTH',snapshot:{...window.state.snapshot,business:{businessId:'BIZ-NORTH'},jobs:[],fleetVehicles:[{'Business ID':'BIZ-NORTH','Vehicle ID':'NV1',Nickname:'Northern Truck','Last Known Location':'Private Yard'}],user:{id:'FIELD1','User ID':'FIELD1',role:'field',owner:false}}};document.getElementById('mainContent').innerHTML='<div class="grid"></div>';window.dispatchEvent(new Event('h38:office-page-rendered'));});await page.waitForSelector('#h38Wave3Fleet');const fleet=await page.locator('#h38Wave3Fleet').innerText();if(!/Northern Truck/.test(fleet)||!/Location restricted/.test(fleet))throw new Error('Northern field-role fleet projection did not restrict location.');if(/Urgent plow/.test(fleet))throw new Error('H38 data leaked into Northern view.');
 await browser.close();console.log('Field operations Wave 3 browser and phone acceptance complete.');
})().catch(err=>{console.error(err);process.exit(1);});
