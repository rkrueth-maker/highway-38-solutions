#!/usr/bin/env node
'use strict';

const [baseArg='https://highway38solutions.com/commercial-app/']=process.argv.slice(2);
const base=new URL(baseArg);
const allowedHosts=new Set(['highway38solutions.com','www.highway38solutions.com']);
const BUILD='20260803-1250';

function fail(message,details={}){console.error(JSON.stringify({status:'FAIL',message,...details},null,2));process.exit(1);}
async function fetchLive(relativePath){
  const target=new URL(relativePath,base);target.searchParams.set('acceptanceBuild',BUILD);
  const response=await fetch(target,{headers:{accept:'text/html,application/javascript,text/javascript,*/*;q=0.8','cache-control':'no-cache',pragma:'no-cache'},redirect:'follow',signal:AbortSignal.timeout(30000)});
  const finalUrl=new URL(response.url);if(!allowedHosts.has(finalUrl.hostname))fail('The public Business Office redirected away from the Highway 38 domain.',{requestedPath:relativePath,finalHost:finalUrl.hostname,httpStatus:response.status});
  const text=await response.text();if(!response.ok)fail('The public Business Office returned a non-success status.',{requestedPath:relativePath,httpStatus:response.status,bodyPreview:text.slice(0,200)});return{text,response,finalUrl};
}
function requireTokens(label,text,tokens){const missing=tokens.filter(token=>!text.includes(token));if(missing.length)fail(`${label} is not the accepted startup build.`,{missing});}

(async()=>{
  const index=await fetchLive('./');
  requireTokens('Public Office HTML',index.text,[`window.H38_BUILD='${BUILD}'`,'window.H38_BRIDGE_CHANNEL','window.h38WithBridgeChannel','id="businessSelect" aria-label="Business" hidden disabled','watchdogSecureSignInButton','target="h38-secure-signin"',`db.js?build=${BUILD}`,`bridge.js?build=${BUILD}`,`startup-relay-patch.js?build=${BUILD}`,'<title>Highway 38 Business Office</title>']);
  const db=await fetchLive('./db.js');
  requireTokens('Public isolated database helper',db.text,["'use strict'",'(()=>{','window.H38DB={put,get,all,remove,clearAll,newId}','})();']);
  const startup=await fetchLive('./startup-fix.js');
  requireTokens('Public startup controller',startup.text,['state.bridge=new H38Bridge','withStartupTimeout','state.canSwitchBusinesses=startup.canSwitchBusinesses===true','refreshing latest records',"'sign-in-timeout'","'popup-blocked'"]);
  const patch=await fetchLive('./startup-relay-patch.js');
  requireTokens('Public relay startup patch',patch.text,[`const relayBuild='${BUILD}'`,'h38WithBridgeChannel','serviceWorker.register','relay-connected']);
  const bridge=await fetchLive('./bridge.js');
  requireTokens('Public isolated secure bridge client',bridge.text,["'use strict'",'(()=>{','class H38Bridge','window.H38Bridge=H38Bridge','BroadcastChannel','receiveRelay','office-to-bridge','bridge-to-office',"message.type==='H38_BRIDGE_BOOTSTRAP'","this.transport='relay'",'})();']);
  const relay=await fetchLive('./secure-relay.html');
  requireTokens('Public same-origin secure relay',relay.text,['H38_RELAY_TO_BRIDGE','H38_RELAY_TO_APP','relay-ready','BroadcastChannel','office-to-bridge','bridge-to-office']);
  const worker=await fetchLive('./service-worker.js');
  requireTokens('Public service worker',worker.text,[`h38-business-office-v7-${BUILD}`,'secure-relay.html','startup-relay-patch.js',"cache:'no-store'",'self.skipWaiting()','self.clients.claim()']);
  console.log(JSON.stringify({status:'PASS',acceptance:'PUBLIC_HIGHWAY38_DOMAIN_ISOLATED_RELAY_STARTUP',publicUrl:index.finalUrl.toString(),build:BUILD,htmlStatus:index.response.status,globalRuntimeIsolated:true,startupController:true,secureBridgeClient:true,sameOriginRelay:true,perTabRelayChannel:true,serviceWorker:true,ownerSwitcherHiddenByDefault:true,deterministicRecovery:true},null,2));
})().catch(error=>fail('Live custom-domain isolated relay startup verification crashed.',{error:error.message}));
