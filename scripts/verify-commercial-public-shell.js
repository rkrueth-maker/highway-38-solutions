#!/usr/bin/env node
'use strict';

const [baseArg='https://highway38solutions.com/commercial-app/']=process.argv.slice(2);
const base=new URL(baseArg);
const allowedHosts=new Set(['highway38solutions.com','www.highway38solutions.com']);
const HANDOFF_BUILD='20260803-1700';
const GATEWAY='jqukmwtsgcsaruucnqja.supabase.co/functions/v1/h38-office-gateway';

function fail(message,details={}){console.error(JSON.stringify({status:'FAIL',message,...details},null,2));process.exit(1);}
async function fetchLive(relativePath){
  const target=new URL(relativePath,base);target.searchParams.set('acceptanceBuild',HANDOFF_BUILD);target.searchParams.set('acceptanceTime',String(Date.now()));
  const response=await fetch(target,{headers:{accept:'text/html,application/javascript,text/javascript,*/*;q=0.8','cache-control':'no-cache',pragma:'no-cache'},redirect:'follow',signal:AbortSignal.timeout(30000)});
  const finalUrl=new URL(response.url);if(!allowedHosts.has(finalUrl.hostname))fail('The public Business Office source redirected away from the Highway 38 domain.',{requestedPath:relativePath,finalHost:finalUrl.hostname,httpStatus:response.status});
  const text=await response.text();if(!response.ok)fail('The public Business Office returned a non-success status.',{requestedPath:relativePath,httpStatus:response.status,bodyPreview:text.slice(0,200)});return{text,response,finalUrl};
}
function requireTokens(label,text,tokens){const missing=tokens.filter(token=>!text.includes(token));if(missing.length)fail(`${label} is not the accepted top-level gateway build.`,{missing});}
function declaredBuild(text,name){const match=text.match(new RegExp(`window\\.${name}=['\"]([0-9-]+)['\"]`));return match?match[1]:'';}

(async()=>{
  const launcher=await fetchLive('/open-business-office.html');
  requireTokens('Public secure launcher',launcher.text,['Opening Business Office','serviceWorker.getRegistrations','registration.unregister()','caches.keys()','h38-business-office-',"sessionStorage.removeItem('h38-gateway-session-v1')","sessionStorage.removeItem('h38-execution-session-v1')",'window.location.replace(destination)','No second window remains open.',HANDOFF_BUILD]);
  const index=await fetchLive('./');
  const handoffBuild=declaredBuild(index.text,'H38_BUILD');
  const assetBuild=declaredBuild(index.text,'H38_ASSET_BUILD');
  if(handoffBuild!==HANDOFF_BUILD)fail('Public Office secure handoff build changed unexpectedly.',{expected:HANDOFF_BUILD,actual:handoffBuild});
  if(!/^\d{8}-\d{4}$/.test(assetBuild))fail('Public Office did not declare a valid browser asset build.',{assetBuild});
  requireTokens('Public Office HTML',index.text,[`window.H38_BUILD='${HANDOFF_BUILD}'`,`window.H38_ASSET_BUILD='${assetBuild}'`,'H38_GATEWAY_HANDOFF_PRESENT','H38_EXECUTION_HANDOFF_PRESENT=false','id="businessSelect" aria-label="Business" hidden disabled',`db.js?build=${assetBuild}`,`bridge.js?build=${assetBuild}`,`startup-fix.js?build=${assetBuild}`,'<title>Highway 38 Business Office</title>']);
  const db=await fetchLive('./db.js');
  requireTokens('Public isolated database helper',db.text,["'use strict'",'(()=>{','window.H38DB={put,get,all,remove,clearAll,newId}','})();']);
  const startup=await fetchLive('./startup-fix.js');
  requireTokens('Public gateway startup controller',startup.text,[`const H38_STARTUP_BUILD='${HANDOFF_BUILD}'`,'retireLegacyOfflineShell','state.bridge=new H38Bridge','window.H38_ACTIVE_BRIDGE=state.bridge',"state.bridge.request('fullStartupRefresh'",'secure gateway']);
  const bridge=await fetchLive('./bridge.js');
  requireTokens('Public opaque gateway client',bridge.text,["'use strict'",'(()=>{','class H38Bridge','window.H38Bridge=H38Bridge',"const SESSION_KEY='h38-gateway-session-v1'",'consumeHashHandoff','history.replaceState',"handoff.handoffType!=='H38_GATEWAY_HANDOFF'","body:JSON.stringify({type:'api',gatewaySession:this.session.gatewaySession,action,args:args||{}})","this.transport='supabase-gateway'",'window.H38_EXECUTION_SESSION=null','})();']);
  if(bridge.text.includes('authorization:`Bearer ${this.session.gatewaySession}`'))fail('The public Office still sends the opaque gateway session through the retired Authorization header.');
  if(bridge.text.includes('script.googleapis.com')||bridge.text.includes('this.session.accessToken')||bridge.text.includes("function:'cbApi'")||bridge.text.includes('BroadcastChannel')||bridge.text.includes('postMessage(')||bridge.text.includes("'popup'"))fail('The public Office still contains the retired Google execution, popup, or iframe transport.');
  const worker=await fetchLive('./service-worker.js');
  requireTokens('Retired public service worker',worker.text,[`const RETIRED_BUILD='${HANDOFF_BUILD}'`,'self.registration.unregister()','h38-business-office-',"cache:'no-store'"]);
  if(worker.text.includes('caches.open('))fail('The retired Office worker still creates a cache.');
  console.log(JSON.stringify({status:'PASS',acceptance:'PUBLIC_HIGHWAY38_TOP_LEVEL_GATEWAY_ENTRY',publicUrl:index.finalUrl.toString(),launcherUrl:launcher.finalUrl.toString(),gateway:GATEWAY,handoffBuild:HANDOFF_BUILD,assetBuild,htmlStatus:index.response.status,globalRuntimeIsolated:true,startupController:true,topLevelOffice:true,supabaseGatewayTransport:true,opaqueSessionInRequestBody:true,browserReceivesGoogleToken:false,persistentAuthWindow:false,legacyWorkerRetired:true,ownerSwitcherHiddenByDefault:true,deterministicRecovery:true},null,2));
})().catch(error=>fail('Live custom-domain gateway Office verification crashed.',{error:error.message}));
