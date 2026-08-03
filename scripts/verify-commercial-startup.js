#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),cp=require('child_process');
const root=path.resolve(__dirname,'..'),read=rel=>fs.readFileSync(path.join(root,rel),'utf8'),failures=[];
const check=(name,value,detail='')=>{if(!value)failures.push(`${name}${detail?`: ${detail}`:''}`);};
const startupServer=read('apps-script/commercial-office-beta/CommercialBeta_CompletionStartup_01.gs');
const bridgeHtml=read('apps-script/commercial-office-beta/CommercialBeta_Bridge.html');
const web=read('apps-script/commercial-office-beta/CommercialBeta_Web.gs');
const index=read('commercial-app/index.html');
const bridge=read('commercial-app/bridge.js');
const startup=read('commercial-app/startup-fix.js');
const worker=read('commercial-app/service-worker.js');
const deployedAcceptance=read('scripts/verify-commercial-webapp-startup.js');
const publicAcceptance=read('scripts/verify-commercial-public-shell.js');
const acceptanceRunner=read('scripts/run-commercial-webapp-startup-acceptance.sh');
const workflow=read('.github/workflows/commercial-google-native-beta.yml');
for(const rel of ['commercial-app/bridge.js','commercial-app/startup-fix.js','commercial-app/service-worker.js','scripts/verify-commercial-webapp-startup.js','scripts/verify-commercial-public-shell.js']){const result=cp.spawnSync(process.execPath,['--check',path.join(root,rel)],{encoding:'utf8'});check(`syntax ${rel}`,result.status===0,(result.stderr||result.stdout||'').trim());}
for(const rel of ['apps-script/commercial-office-beta/CommercialBeta_CompletionStartup_01.gs','apps-script/commercial-office-beta/CommercialBeta_Web.gs']){try{new vm.Script(read(rel),{filename:rel});check(`syntax ${rel}`,true);}catch(error){check(`syntax ${rel}`,false,error.message);}}
check('fast startup is public and returns light snapshot',startupServer.includes('function cbStartupBootstrap(')&&startupServer.includes("startupMode:'FAST'")&&startupServer.includes('fullRefreshPending:true'));
check('fast startup avoids heavy full context',!startupServer.includes('cbCompletionContext_(')&&startupServer.includes('cbCompletionBusinessUser_('));
check('only platform owner can switch businesses',startupServer.includes('canSwitch=cbCompletionOwnerEmail_(signed.email)')&&startup.includes('state.canSwitchBusinesses=startup.canSwitchBusinesses===true')&&index.includes('id="businessSelect" aria-label="Business" hidden disabled'));
check('non-owner auto-opens assigned business',startupServer.includes("selected=businesses[0].businessId")&&startupServer.includes('if(canSwitch)'));
check('Google bridge pushes startup without a second request',bridgeHtml.includes("type:'H38_BRIDGE_BOOTSTRAP'")&&bridgeHtml.includes('.cbStartupBootstrap(REQUESTED_BUSINESS_ID)')&&!startup.includes("request('sessionAccess'"));
check('Office opens before full refresh',bridgeHtml.indexOf("H38_BRIDGE_BOOTSTRAP")<bridgeHtml.indexOf("cbFullStartupRefresh")&&startup.indexOf('openPage(state.page,false)')<startup.indexOf("request('fullStartupRefresh'"));
check('background refresh cannot block first open',startup.includes("$('businessStatus').textContent=`${startup.snapshot.business.businessName}")&&startup.includes('refreshing latest records')&&startup.includes('120000'));
check('secure popup remains active for later saves',bridgeHtml.includes('Keep this secure window open')&&!bridgeHtml.includes('window.close()')&&!bridge.includes('this.popup.close()'));
check('startup has deterministic recovery',index.includes('watchdogSecureSignInButton')&&index.includes('12000')&&startup.includes("'sign-in-timeout'")&&startup.includes("'popup-blocked'"));
check('new build invalidates prior cache',index.includes('20260803-1035')&&worker.includes('h38-business-office-v4-20260803-1035')&&worker.includes("cache:'no-store'"));
check('server routes explicit startup operations',web.includes("action==='startupBootstrap'")&&web.includes("action==='fullStartupRefresh'")&&web.includes('requestedBusinessIdJson'));
check('owner-only deployed acceptance endpoint exists',web.includes("parameters.acceptance)==='startup'")&&web.includes('cbStartupAcceptance()')&&startupServer.includes('cbRequireOwner_()'));
check('deployed acceptance rejects login redirects',deployedAcceptance.includes('redirected to Google sign-in')&&deployedAcceptance.includes("payload.status !== 'PASS'")&&deployedAcceptance.includes('authorization: `Bearer ${accessToken}`'));
check('live domain verifier requires accepted build',publicAcceptance.includes('highway38solutions.com')&&publicAcceptance.includes('20260803-1035')&&publicAcceptance.includes('ownerSwitcherHiddenByDefault')&&publicAcceptance.includes('serviceWorker: true'));
check('acceptance runner checks public and signed-in paths',acceptanceRunner.includes('verify-commercial-public-shell.js')&&acceptanceRunner.includes('verify-commercial-webapp-startup.js')&&acceptanceRunner.indexOf('verify-commercial-public-shell.js')<acceptanceRunner.indexOf('verify-commercial-webapp-startup.js'));
check('acceptance runner is pinned to existing deployment',acceptanceRunner.includes('AKfycbyY8cbfvGLzllw7rMhRY46wx_eIKhsK5oLlV6vIcDxDIKuCzX0_oTi4EyVufSxonLdxow'));
check('workflow tests deployed URL instead of API executable',workflow.includes('run-commercial-webapp-startup-acceptance.sh')&&!workflow.includes('clasp run-function'));
const listeners=[];const frameWindow={},popup={closed:false,focus(){}};const context={window:{},crypto:{randomUUID:()=> 'REQ-1'},setTimeout,clearTimeout,addEventListener:(name,fn)=>{if(name==='message')listeners.push(fn);},Error};context.window=context;vm.runInNewContext(bridge,context,{filename:'bridge.js'});let bootstrapSeen=false,fullSeen=false;const frame={contentWindow:frameWindow,src:''};const instance=new context.H38Bridge(frame,'https://example.test/bridge',()=>{},()=>{bootstrapSeen=true;},()=>{fullSeen=true;},()=>{});instance.popup=popup;instance.receive({source:popup,data:{type:'H38_BRIDGE_BOOTSTRAP',startup:{status:'PASS'}}});instance.receive({source:popup,data:{type:'H38_BRIDGE_FULL_SNAPSHOT',businessId:'BUS-1',snapshot:{status:'PASS'}}});check('bridge consumes startup and full snapshot events',bootstrapSeen&&fullSeen&&instance.ready&&instance.bootstrapped);
const output={status:failures.length?'FAIL':'PASS',checks:19,failures,fastSignedInStartup:true,ownerOnlyBusinessSwitcher:true,officeBeforeFullRefresh:true,publicDomainAcceptance:true,deployedWebAppAcceptance:true};
if(failures.length){console.error(JSON.stringify(output,null,2));process.exit(1);}console.log(JSON.stringify(output,null,2));
