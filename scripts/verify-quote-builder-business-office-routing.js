#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const need=(text,marker,label)=>{if(!text.includes(marker))throw new Error(`Missing ${label}: ${marker}`);};
const ordered=(text,a,b,label)=>{if(text.indexOf(a)<0||text.indexOf(b)<0||text.indexOf(a)>=text.indexOf(b))throw new Error(`Invalid ${label} order`);};
const equal=(actual,expected,label)=>{if(actual!==expected)throw new Error(`${label}: expected ${expected}, got ${actual}`);};

const portalIndex=read('apps-script/core-engine/owner-portal-next/Portal_Index.html');
const addon=read('apps-script/core-engine/owner-portal-next/Portal_QuoteBuilder_Addon_Client.html');
const quoteIndex=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Index.html');
const launch=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Launch_Context.html');
const pack=JSON.parse(read('business-packs/highway38/business-pack.json'));
const generatedPack=read('business-packs/highway38/apps-script/BusinessOffice_Pack.gs');

need(portalIndex,"boPackValue_('modules.quoteBuilder',false) === true",'explicit Business Pack add-on gate');
need(portalIndex,"h38PortalRawInclude_('Portal_QuoteBuilder_Addon_Client')",'unified Quote Builder add-on include');
ordered(portalIndex,"h38PortalRawInclude_('Portal_Application_Client_Core')","h38PortalRawInclude_('Portal_QuoteBuilder_Addon_Client')",'application core before add-on');
ordered(portalIndex,"h38PortalRawInclude_('Portal_QuoteBuilder_Addon_Client')","h38PortalRawInclude_('Portal_UX_Client_Boot')",'add-on before boot');

need(addon,"window.H38_QB_ADDON_ENABLED!==true",'installed add-on check');
need(addon,"module==='bo:quotes'||module==='quotes'",'Work → Quotes route replacement');
need(addon,"renderBusinessModule=async function",'legacy quote workspace shutdown');
need(addon,"openBusinessRecord=async function",'existing quote redirect');
need(addon,"openBusinessRecordForm=function",'legacy quote editor shutdown');
need(addon,"return h38OpenQuoteBuilder({view:'new'",'new quote routing');
need(addon,"return h38OpenQuoteBuilder({quoteId:recordId})",'existing quote context routing');
need(addon,"customerId:h38QuoteBuilderCustomerContext()",'customer context routing');
need(addon,"runQuickCreate=async function",'Quick Create replacement');
need(addon,"h38RunCommand=function",'command palette replacement');
need(addon,"label.textContent='Quote Builder'",'visible Business Office navigation label');
need(addon,"url.searchParams.set('returnUrl',serviceUrl)",'Business Office return route');
need(addon,"location.assign(H38_QUOTE_BUILDER_ADDON.pendingUrl)",'same-tab app launch');

need(quoteIndex,"boInclude_('BusinessOffice_QuoteBuilder_Launch_Context')",'Quote Builder launch-context include');
need(launch,"params.get('view')",'requested Quote Builder view');
need(launch,"params.get('customerId')",'selected customer context');
need(launch,"params.get('quoteId')",'selected quote context');
need(launch,"window.qbDetails(quoteId)",'existing quote open');
need(launch,"select.value=customerId",'new quote customer preselection');
need(launch,"button.textContent='Business Office'",'clear Business Office return action');
need(launch,"configured.hash='module=today'",'return to unified Business Office');

if(pack.modules.quoteBuilder!==true)throw new Error('Highway 38 Business Pack must explicitly enable quoteBuilder.');
need(generatedPack,'quotes:true,quoteBuilder:true','generated Business Pack add-on flag');

new Function(addon);
const launchBody=(launch.match(/<script>([\s\S]*?)<\/script>/)||[])[1];
if(!launchBody)throw new Error('Quote Builder launch context script body was not found.');
new Function(launchBody);

const assigned=[];
const baseCalls={show:0,render:0,record:0,form:0,quick:0,command:0};
const quickSelect={value:'quote'};
const context={
  console,URL,Promise,
  H38_QB_ADDON_ENABLED:true,
  H38_UNIFIED:{serviceUrl:'https://script.google.com/macros/s/DEPLOYMENT/exec'},
  H38_APP_MODULE_MANAGER:{modules:[{key:'quotes',enabled:true,canView:true}]},
  H38_COMMAND_ITEMS:[],
  BO_NATIVE:{workspace:{module:'customers',recordId:'CUST-42',primary:{'Customer ID':'CUST-42'}}},
  location:{href:'https://script.google.com/macros/s/DEPLOYMENT/exec',assign:value=>assigned.push(value)},
  document:{documentElement:{},querySelectorAll:()=>[],getElementById:id=>id==='quickCreate'?quickSelect:null},
  MutationObserver:function(callback){this.observe=function(){};},
  setTimeout:function(callback){callback();return 1;},
  clearTimeout:function(){},
  uxNormalizeModule:value=>value,
  h38AppRouteAllowed:()=>true,
  h38QuickModule:value=>value==='quote'?'quotes':value,
  h38CloseCommandPalette:function(){},
  renderNav:function(){},
  show:function(){baseCalls.show+=1;return Promise.resolve('legacy-show');},
  renderBusinessModule:function(){baseCalls.render+=1;return Promise.resolve('legacy-render');},
  openBusinessRecord:function(){baseCalls.record+=1;return Promise.resolve('legacy-record');},
  openBusinessRecordForm:function(){baseCalls.form+=1;return 'legacy-form';},
  runQuickCreate:function(){baseCalls.quick+=1;return Promise.resolve('legacy-quick');},
  h38RunCommand:function(){baseCalls.command+=1;return 'legacy-command';}
};
context.window=context;
vm.createContext(context);
vm.runInContext(addon,context,{filename:'Portal_QuoteBuilder_Addon_Client.html'});

context.show('bo:quotes');
let routed=new URL(assigned.pop());
equal(routed.searchParams.get('quoteBuilder'),'1','Business Office quote route');
equal(routed.searchParams.get('view'),'dashboard','Business Office quote dashboard view');
equal(baseCalls.show,0,'legacy quote route must not render');

context.openBusinessRecord('quotes','QUOTE-7');
routed=new URL(assigned.pop());
equal(routed.searchParams.get('quoteId'),'QUOTE-7','existing quote context');
equal(baseCalls.record,0,'legacy quote record must not open');

context.openBusinessRecordForm('quotes','');
routed=new URL(assigned.pop());
equal(routed.searchParams.get('view'),'new','new quote view');
equal(routed.searchParams.get('customerId'),'CUST-42','customer context');
equal(baseCalls.form,0,'legacy quote editor must not open');

quickSelect.value='quote';
context.runQuickCreate();
routed=new URL(assigned.pop());
equal(routed.searchParams.get('view'),'new','Quick Create quote view');
equal(quickSelect.value,'','Quick Create reset');
equal(baseCalls.quick,0,'legacy Quick Create quote form must not open');

context.H38_QB_ADDON_ENABLED=false;
context.show('bo:quotes');
equal(assigned.length,0,'disabled add-on must not redirect');
equal(baseCalls.show,1,'legacy route remains available when add-on is not installed');

console.log('PASS — Business Office opens the installed Quote Builder, legacy quote UI/editor routes are superseded, new/existing/customer context is preserved, and the direct app returns to Business Office.');
