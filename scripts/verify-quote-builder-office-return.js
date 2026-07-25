#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const need=(text,marker,label)=>{if(!text.includes(marker))throw new Error(`Missing ${label}: ${marker}`);};
const absent=(text,marker,label)=>{if(text.includes(marker))throw new Error(`Unexpected ${label}: ${marker}`);};
const equal=(actual,expected,label)=>{if(actual!==expected)throw new Error(`${label}: expected ${expected}, got ${actual}`);};

const index=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Index.html');
const launch=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Launch_Context.html');
need(index,'<a id="qbBackToOffice"','persistent return is a native link');
need(index,'target="_top"','native top-frame target');
need(index,'rel="noopener"','safe top-frame link');
need(launch,"google.script.url.getLocation(syncTopLocation)",'Apps Script top-location resolver');
need(launch,'document.referrer||location.href','sandbox referrer fallback');
need(launch,"source.setAttribute('target','_top')",'persistent top-frame target wiring');
need(launch,"link.target='_top'",'sidebar top-frame navigation');
need(launch,'button.onclick=returnToBusinessOffice','persistent and sidebar return handler');
absent(launch,'location.assign(businessOfficeReturnUrl())','inner-frame return navigation');

const body=(launch.match(/<script>([\s\S]*?)<\/script>/)||[])[1];
if(!body)throw new Error('Launch-context script body was not found.');
new Function(body);

function fakeElement(tag,navigations){
  return {
    tagName:tag,
    dataset:{},
    style:{},
    attrs:{},
    textContent:'',
    title:'',
    setAttribute(name,value){this.attrs[name]=String(value);this[name]=String(value);},
    querySelector(){return null;},
    click(){navigations.push({url:this.href,target:this.target});},
    remove(){}
  };
}

function runScenario(withReturnUrl){
  const canonical='https://script.google.com/macros/s/DEPLOYMENT/exec#module=quotes';
  const navigations=[];
  const persistent=fakeElement('A',navigations);
  const sidebar=fakeElement('BUTTON',navigations);
  const locationPayload={parameter:{from:'business-office'}};
  if(withReturnUrl)locationPayload.parameter.returnUrl=canonical;
  const context={
    console,URL,URLSearchParams,Promise,
    location:{search:'',href:'https://script.googleusercontent.com/userCodeAppPanel'},
    document:{
      referrer:'https://script.google.com/macros/s/DEPLOYMENT/exec?app=business-office&quoteBuilder=1&from=business-office',
      body:{appendChild(){}},
      getElementById(id){if(id==='qbBackToOffice')return persistent;if(id==='qbNav')return null;return null;},
      querySelector(selector){return selector==='#qbNav .full-system button'?sidebar:null;},
      createElement(tag){return fakeElement(String(tag).toUpperCase(),navigations);}
    },
    google:{script:{url:{getLocation(callback){callback(locationPayload);}}}},
    qbOpen(){return Promise.resolve();},
    qbDetails(){return Promise.resolve();},
    MutationObserver:function(){this.observe=function(){};},
    Event:function(){},
    setTimeout(callback){callback();return 1;},
    clearTimeout(){},
    setInterval(){return 1;},
    clearInterval(){}
  };
  context.window=context;
  vm.createContext(context);
  vm.runInContext(body,context,{filename:'BusinessOffice_QuoteBuilder_Launch_Context.html'});
  equal(persistent.href,canonical,'persistent link destination');
  equal(persistent.target,'_top','persistent link target');
  equal(typeof persistent.onclick,'function','persistent handler');
  const nativeResult=persistent.onclick({currentTarget:persistent,preventDefault(){throw new Error('Native link must not be prevented.');}});
  equal(nativeResult,true,'native link result');
  equal(typeof sidebar.onclick,'function','sidebar handler');
  let prevented=false;
  const sidebarResult=sidebar.onclick({currentTarget:sidebar,preventDefault(){prevented=true;}});
  equal(sidebarResult,false,'sidebar handler result');
  equal(prevented,true,'sidebar default prevention');
  equal(navigations.length,1,'synthetic top-link count');
  equal(navigations[0].url,canonical,'sidebar destination');
  equal(navigations[0].target,'_top','sidebar target');
  return{withReturnUrl,canonical,persistentTarget:persistent.target,sidebarNavigation:navigations[0]};
}

const evidence={status:'PASS',scenarios:[runScenario(true),runScenario(false)],innerFrameAssign:false,externalActionsPerformed:false};
const artifactDir=path.join(root,'artifacts','quote-builder-office-return');
fs.mkdirSync(artifactDir,{recursive:true});
fs.writeFileSync(path.join(artifactDir,'verification.json'),JSON.stringify(evidence,null,2)+'\n');
console.log('PASS — Quote Builder header and sidebar return controls navigate the top-level Apps Script window to Business Office → Quotes.');
