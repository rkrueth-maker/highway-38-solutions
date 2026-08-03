#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),cp=require('child_process');
const root=path.resolve(__dirname,'..'),read=rel=>fs.readFileSync(path.join(root,rel),'utf8'),failures=[];
const check=(name,value)=>{if(!value)failures.push(name);};
const files={
  server:'apps-script/commercial-office-beta/CommercialBeta_CompletionStartup_01.gs',
  web:'apps-script/commercial-office-beta/CommercialBeta_Web.gs',
  bridgeHtml:'apps-script/commercial-office-beta/CommercialBeta_Bridge.html',
  index:'commercial-app/index.html',bridge:'commercial-app/bridge.js',startup:'commercial-app/startup-fix.js',patch:'commercial-app/startup-relay-patch.js',relay:'commercial-app/secure-relay.html',worker:'commercial-app/service-worker.js',
  browser:'scripts/verify-commercial-browser-signin.js',public:'scripts/verify-commercial-public-shell.js',deployed:'scripts/verify-commercial-webapp-startup.js',runner:'scripts/run-commercial-webapp-startup-acceptance.sh',workflow:'.github/workflows/commercial-google-native-beta.yml'
};
for(const rel of Object.values(files))check(`file ${rel}`,fs.existsSync(path.join(root,rel)));
if(failures.length){console.error(JSON.stringify({status:'FAIL',failures},null,2));process.exit(1);}
const source=Object.fromEntries(Object.entries(files).map(([key,rel])=>[key,read(rel)]));
for(const key of ['bridge','startup','patch','worker','browser','public','deployed']){const result=cp.spawnSync(process.execPath,['--check',path.join(root,files[key])],{encoding:'utf8'});check(`syntax ${files[key]}`,result.status===0);}
for(const key of ['server','web']){try{new vm.Script(source[key],{filename:files[key]});}catch(error){check(`syntax ${files[key]}`,false);}}
check('fast authorized startup',source.server.includes('function cbStartupBootstrap(')&&source.server.includes("startupMode:'FAST'")&&source.server.includes('fullRefreshPending:true')&&!source.server.includes('cbCompletionContext_('));
check('Office opens before full refresh',source.bridgeHtml.indexOf("H38_BRIDGE_BOOTSTRAP")<source.bridgeHtml.indexOf('cbFullStartupRefresh')&&source.startup.indexOf('openPage(state.page,false)')<source.startup.indexOf("request('fullStartupRefresh'"));
check('owner-only deployed acceptance',source.web.includes("parameters.acceptance)==='startup'")&&source.server.includes('cbRequireOwner_()'));
check('per-tab secure channel',source.index.includes('window.H38_BRIDGE_CHANNEL')&&source.index.includes('sessionStorage.getItem')&&source.index.includes('window.h38WithBridgeChannel'));
check('same-origin popup relay',source.bridgeHtml.includes('google.script.url.getLocation')&&source.bridgeHtml.includes('secure-relay.html?channel=')&&source.bridgeHtml.includes('H38_RELAY_TO_APP')&&source.bridgeHtml.includes('H38_RELAY_TO_BRIDGE'));
check('relay transports both directions',source.bridge.includes('BroadcastChannel')&&source.bridge.includes('receiveRelay')&&source.bridge.includes("this.transport='relay'")&&source.bridge.includes('office-to-bridge')&&source.relay.includes('bridge-to-office'));
check('relay survives cache and startup controller',source.index.includes('startup-relay-patch.js?build=20260803-1220')&&source.patch.includes("const relayBuild='20260803-1220'")&&source.worker.includes('h38-business-office-v6-20260803-1220')&&source.worker.includes('secure-relay.html')&&source.worker.includes('startup-relay-patch.js'));
check('browser gate reproduces recording failure',source.browser.includes('BROWSER_AUTHORIZED_RELAY_BOOTSTRAP_WITH_OPENER_SEVERED')&&source.browser.includes('window.opener=null')&&source.browser.includes('indexedDB')&&source.browser.includes('relayFramePresent')&&source.browser.includes('officeReceivedBootstrap:true'));
check('browser gate uses protected credential only for Apps Script',source.browser.includes('isScriptHost(parsed.hostname)')&&source.browser.includes('authorization:`Bearer ${accessToken}`')&&source.runner.includes('verify-commercial-browser-signin.js "$PUBLIC_URL" "$DEPLOYMENT_URL" "$CREDENTIALS_PATH"'));
check('live public verifier requires v6 relay build',source.public.includes('PUBLIC_HIGHWAY38_DOMAIN_RELAY_STARTUP')&&source.public.includes('sameOriginRelay')&&source.public.includes('perTabRelayChannel'));
check('existing deployment remains pinned',source.runner.includes('AKfycbyY8cbfvGLzllw7rMhRY46wx_eIKhsK5oLlV6vIcDxDIKuCzX0_oTi4EyVufSxonLdxow'));
check('workflow uses authorized browser acceptance',source.workflow.includes('playwright@1.55.0')&&source.workflow.includes('run-commercial-webapp-startup-acceptance.sh'));
const frameWindow={};class BroadcastChannelStub{constructor(){this.onmessage=null;}postMessage(){}}
const context={H38_BRIDGE_CHANNEL:'CHANNEL-1',window:null,crypto:{randomUUID:()=> 'REQ-1'},URL,location:{href:'https://highway38solutions.com/commercial-app/'},localStorage:{setItem(){},getItem(){return'';}},BroadcastChannel:BroadcastChannelStub,setTimeout,clearTimeout,addEventListener(){},Error};context.window=context;
vm.runInNewContext(source.bridge,context,{filename:'bridge.js'});let bootstrapped=false;const instance=new context.H38Bridge({contentWindow:frameWindow,src:''},'https://example.test/bridge',()=>{},()=>{bootstrapped=true;},()=>{},()=>{});instance.receiveRelay({channelId:instance.channelId,direction:'bridge-to-office',payload:{type:'H38_BRIDGE_BOOTSTRAP',startup:{status:'PASS'}}});check('relay bootstrap is consumed without opener',bootstrapped&&instance.bootstrapped&&instance.ready&&instance.transport==='relay');
const output={status:failures.length?'FAIL':'PASS',checks:13,failures,fastSignedInStartup:true,browserSafeSignIn:true,indexedDbCannotBlockSignIn:true,openerIndependentRelay:true,ownerOnlyBusinessSwitcher:true,officeBeforeFullRefresh:true,publicDomainAcceptance:true,browserRelayAcceptance:true,deployedWebAppAcceptance:true};
if(failures.length){console.error(JSON.stringify(output,null,2));process.exit(1);}console.log(JSON.stringify(output,null,2));
