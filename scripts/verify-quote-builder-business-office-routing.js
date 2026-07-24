#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const need=(text,marker,label)=>{if(!text.includes(marker))throw new Error(`Missing ${label}: ${marker}`);};
const absent=(text,marker,label)=>{if(text.includes(marker))throw new Error(`Unexpected ${label}: ${marker}`);};
const ordered=(text,a,b,label)=>{if(text.indexOf(a)<0||text.indexOf(b)<0||text.indexOf(a)>=text.indexOf(b))throw new Error(`Invalid ${label} order`);};
const equal=(actual,expected,label)=>{if(actual!==expected)throw new Error(`${label}: expected ${expected}, got ${actual}`);};

const portalIndex=read('apps-script/core-engine/owner-portal-next/Portal_Index.html');
const addon=read('apps-script/core-engine/owner-portal-next/Portal_QuoteBuilder_Addon_Client.html');
const quoteIndex=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Index.html');
const launch=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Launch_Context.html');
const registry=read('apps-script/core-engine/owner-portal-next/Portal_Module_Registry.js');
const businessClient=read('apps-script/core-engine/owner-portal-next/Portal_Business_Client.html');
const pack=JSON.parse(read('business-packs/highway38/business-pack.json'));
const generatedPack=read('business-packs/highway38/apps-script/BusinessOffice_Pack.gs');

need(portalIndex,"boPackValue_('modules.quoteBuilder',false) === true",'explicit Business Pack add-on gate');
need(portalIndex,"h38PortalRawInclude_('Portal_QuoteBuilder_Addon_Client')",'unified Quote Builder add-on include');
ordered(portalIndex,"h38PortalRawInclude_('Portal_Application_Client_Core')","h38PortalRawInclude_('Portal_QuoteBuilder_Addon_Client')",'application core before add-on');
ordered(portalIndex,"h38PortalRawInclude_('Portal_QuoteBuilder_Addon_Client')","h38PortalRawInclude_('Portal_UX_Client_Boot')",'add-on before boot');

need(registry,'label:item.label','Quotes navigation label remains contract-owned');
absent(registry,"?'Quote Builder':item.label",'dynamic Quote Builder navigation label');
need(addon,"window.H38_QB_ADDON_ENABLED!==true",'installed add-on check');
need(addon,'function h38OpenNewQuote','explicit new quote action');
need(addon,'function h38EditQuoteInBuilder','explicit edit quote action');
need(addon,'openBusinessRecordForm=function','create/edit handoff');
need(addon,"if(recordId)return h38EditQuoteInBuilder(recordId)",'existing quote edit context');
need(addon,'runQuickCreate=async function','Quick Create handoff');
need(addon,'h38RunCommand=function','create command handoff');
need(addon,"command.kind==='create'&&command.module==='quotes'",'create-only command interception');
need(addon,"options.returnModule||'quotes'",'Quotes return workspace');
absent(addon,'var H38_QB_BASE_SHOW=show','Quotes navigation interception');
absent(addon,'var H38_QB_BASE_RENDER_BUSINESS_MODULE=renderBusinessModule','Quotes list interception');
absent(addon,'var H38_QB_BASE_OPEN_BUSINESS_RECORD=openBusinessRecord','quote viewer interception');
absent(addon,'new MutationObserver','document mutation observer');

need(businessClient,"quotes:'Browse, search, and review quote records",'Quotes viewer purpose');
need(businessClient,'New Quote</button>','explicit New Quote action');
need(businessClient,'Open Quote Builder</button>','explicit builder dashboard action');
need(businessClient,'Edit in Quote Builder</button>','explicit builder edit action');
need(businessClient,'boNativeQuoteBuilderEnabled','builder-aware viewer controls');

need(quoteIndex,"boInclude_('BusinessOffice_QuoteBuilder_Launch_Context')",'Quote Builder launch-context include');
need(quoteIndex,'id="qbBackToOffice"','persistent Business Office return button');
need(quoteIndex,'class="qb-office-return"','visible Business Office return control');
need(launch,"params.get('view')",'requested Quote Builder view');
need(launch,"params.get('customerId')",'selected customer context');
need(launch,"params.get('quoteId')",'selected quote context');
need(launch,"window.qbDetails(quoteId)",'existing quote open');
need(launch,"select.value=customerId",'new quote customer preselection');
need(launch,"'Back to Quotes'",'clear Quotes return action');
need(launch,"configured.hash='module=quotes'",'return to Quotes workspace');
need(launch,'function wirePersistentOfficeReturn','persistent return-button wiring');
need(launch,"document.getElementById('qbBackToOffice')",'persistent return-button lookup');
need(launch,"button.onclick=returnToBusinessOffice",'persistent return-button action');
need(launch,'Return to Business Office · Customers → Quotes','clear persistent return destination');

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
  CURRENT:'bo:quotes',
  location:{href:'https://script.google.com/macros/s/DEPLOYMENT/exec',assign:value=>assigned.push(value)},
  document:{getElementById:id=>id==='quickCreate'?quickSelect:null},
  setTimeout:function(callback){callback();return 1;},
  clearTimeout:function(){},
  h38AppRouteAllowed:()=>true,
  h38QuickModule:value=>value==='quote'?'quotes':value,
  h38CloseCommandPalette:function(){},
  show:function(){baseCalls.show+=1;return Promise.resolve('quotes-view');},
  renderBusinessModule:function(){baseCalls.render+=1;return Promise.resolve('quotes-list');},
  openBusinessRecord:function(){baseCalls.record+=1;return Promise.resolve('quote-viewer');},
  openBusinessRecordForm:function(){baseCalls.form+=1;return 'legacy-form';},
  runQuickCreate:function(){baseCalls.quick+=1;return Promise.resolve('legacy-quick');},
  h38RunCommand:function(){baseCalls.command+=1;return 'base-command';}
};
context.window=context;
vm.createContext(context);
vm.runInContext(addon,context,{filename:'Portal_QuoteBuilder_Addon_Client.html'});

context.show('bo:quotes');
equal(baseCalls.show,1,'Quotes navigation must open the Business Office viewer');
equal(assigned.length,0,'Quotes navigation must not launch Quote Builder');

context.renderBusinessModule('quotes','');
equal(baseCalls.render,1,'Quotes list must render in Business Office');
equal(assigned.length,0,'Quotes list must not launch Quote Builder');

context.openBusinessRecord('quotes','QUOTE-7');
equal(baseCalls.record,1,'existing quote must open the Business Office viewer');
equal(assigned.length,0,'viewing a quote must not launch Quote Builder');

context.openBusinessRecordForm('quotes','');
let routed=new URL(assigned.pop());
equal(routed.searchParams.get('view'),'new','new quote view');
equal(routed.searchParams.get('customerId'),'CUST-42','customer context');
equal(new URL(routed.searchParams.get('returnUrl')).hash,'#module=quotes','new quote return route');
equal(baseCalls.form,0,'installed Quote Builder must own quote creation');

context.openBusinessRecordForm('quotes','QUOTE-7');
routed=new URL(assigned.pop());
equal(routed.searchParams.get('quoteId'),'QUOTE-7','existing quote edit context');
equal(baseCalls.form,0,'installed Quote Builder must own quote editing');

quickSelect.value='quote';
context.runQuickCreate();
routed=new URL(assigned.pop());
equal(routed.searchParams.get('view'),'new','Quick Create quote view');
equal(quickSelect.value,'','Quick Create reset');
equal(baseCalls.quick,0,'Quick Create must use Quote Builder');

context.H38_COMMAND_ITEMS=[{kind:'record',module:'quotes',id:'QUOTE-9'}];
context.h38RunCommand(0);
equal(baseCalls.command,1,'quote search result must use the Business Office viewer command');
equal(assigned.length,0,'quote search result must not launch Quote Builder');

context.H38_COMMAND_ITEMS=[{kind:'create',module:'quotes',command:{kind:'create',module:'quotes'}}];
context.h38RunCommand(0);
routed=new URL(assigned.pop());
equal(routed.searchParams.get('view'),'new','create command Quote Builder view');
equal(baseCalls.command,1,'create command must bypass the legacy quote form');

context.H38_QB_ADDON_ENABLED=false;
context.openBusinessRecordForm('quotes','');
equal(assigned.length,0,'disabled add-on must not redirect');
equal(baseCalls.form,1,'legacy quote editor remains available when add-on is not installed');

console.log('PASS — Quotes remains the Business Office browse/view workspace, Quote Builder owns explicit creation and editing, customer context is preserved, and both persistent and navigation return controls go back to Business Office → Quotes.');