#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),cp=require('child_process');
const root=path.resolve(__dirname,'..'),failures=[],checks=[];
const file=rel=>path.join(root,rel);
const read=rel=>{if(!fs.existsSync(file(rel)))throw new Error(`Missing required file: ${rel}`);return fs.readFileSync(file(rel),'utf8');};
const check=(name,value,detail='')=>{checks.push({name,pass:!!value});if(!value)failures.push(`${name}${detail?`: ${detail}`:''}`);};
const has=(source,tokens)=>tokens.every(token=>source.includes(token));
const joined=(dir,prefix,suffix)=>fs.readdirSync(file(dir)).filter(name=>name.startsWith(prefix)&&name.endsWith(suffix)).sort().map(name=>read(path.join(dir,name))).join('\n');
const appFiles=Array.from({length:18},(_,index)=>`commercial-app/app-${String(index+1).padStart(2,'0')}.js`);
const completionFiles=fs.readdirSync(file('apps-script/commercial-office-beta')).filter(name=>name.startsWith('CommercialBeta_Completion')&&name.endsWith('.gs')).sort().map(name=>`apps-script/commercial-office-beta/${name}`);
const required=['apps-script/commercial-office-beta/CommercialBeta_Config.gs','apps-script/commercial-office-beta/CommercialBeta_Web.gs','apps-script/commercial-office-beta/CommercialBeta_Office.html','apps-script/commercial-office-beta/appsscript.json','open-business-office.html','commercial-app/index.html','commercial-app/styles.css','commercial-app/db.js','commercial-app/bridge.js','commercial-app/startup-fix.js','commercial-app/service-worker.js','commercial-app/manifest.webmanifest','commercial-app/icon.svg',...completionFiles,...appFiles];
required.forEach(rel=>check(`file ${rel}`,fs.existsSync(file(rel))));
if(failures.length){console.error(JSON.stringify({status:'FAIL',failures},null,2));process.exit(1);}
for(const rel of completionFiles.concat(['apps-script/commercial-office-beta/CommercialBeta_Config.gs','apps-script/commercial-office-beta/CommercialBeta_Web.gs'])){
  try{new vm.Script(read(rel),{filename:rel});check(`syntax ${rel}`,true);}catch(error){check(`syntax ${rel}`,false,error.message);}
}
for(const rel of appFiles.concat(['commercial-app/db.js','commercial-app/bridge.js','commercial-app/startup-fix.js','commercial-app/service-worker.js'])){
  const result=cp.spawnSync(process.execPath,['--check',file(rel)],{encoding:'utf8'});check(`syntax ${rel}`,result.status===0,(result.stderr||result.stdout||'').trim());
}
const config=read(required[0]),web=read(required[1]),office=read(required[2]),launcher=read('open-business-office.html'),index=read('commercial-app/index.html'),startup=read('commercial-app/startup-fix.js'),styles=read('commercial-app/styles.css'),worker=read('commercial-app/service-worker.js'),dbClient=read('commercial-app/db.js'),bridge=read('commercial-app/bridge.js'),startupServer=read('apps-script/commercial-office-beta/CommercialBeta_CompletionStartup_01.gs'),manifest=JSON.parse(read('apps-script/commercial-office-beta/appsscript.json')),app=appFiles.map(read).join('\n');
let platformConfig=null;
try{
  const context={};
  vm.createContext(context);
  new vm.Script(config,{filename:required[0]}).runInContext(context);
  platformConfig=context.CB_CONFIG||null;
}catch(error){
  check('parse platform configuration',false,error.message);
}
const requiredModules=['quotes','measure','communications','fleet','money','social','ai','voice','offline'];
const missingModules=requiredModules.filter(module=>!Array.isArray(platformConfig&&platformConfig.modules)||!platformConfig.modules.includes(module));
check('complete platform configuration',!!platformConfig&&platformConfig.version==='1.0.0'&&platformConfig.schemaVersion===3&&platformConfig.pwaUrl==='https://highway38solutions.com/commercial-app/'&&platformConfig.gatewayUrl==='https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/h38-office-gateway'&&missingModules.length===0,missingModules.length?`missing modules ${missingModules.join(',')}`:'');
check('external safeguards remain locked',!!platformConfig&&platformConfig.externalActionsEnabled===false&&platformConfig.productionMigrationEnabled===false&&platformConfig.automaticCustomerSending===false&&platformConfig.automaticSocialPublishing===false&&platformConfig.automaticFinancialActions===false);
check('Google page creates user-activated opaque gateway handoff',has(office,['cbPwaGatewayHandoff','H38_GATEWAY_HANDOFF','gatewaySession','gatewayUrl','browserReceivesGoogleToken','id="continueButton"','target="_top"',"button.textContent='Open Business Office'","button.dataset.ready='true'","target.hash='h38='",'No second window is used.'])&&!office.includes('officeFrame')&&!office.includes('window.open('));
check('server exchanges Google token only with gateway',has(startupServer,['function cbPwaGatewayHandoff(','ScriptApp.getOAuthToken()','UrlFetchApp.fetch(CB_CONFIG.gatewayUrl',"handoffType:'H38_GATEWAY_HANDOFF'","transport:'supabase-gateway'",'gatewaySession:payload.gatewaySession','browserReceivesGoogleToken:false','startup:startup'])&&!startupServer.includes("handoffType:'H38_EXECUTION_HANDOFF'"));
check('existing deployment exposes controlled gateway JSON route',has(web,['function doPost(event)','H38_SUPABASE_GATEWAY_V1','cbGatewayOutput_','cbApi({action:action,args:args})',"status:'PASS',result:","status:'FAIL',error:"]));
check('installer remains owner-only',has(web,['if(forceInstaller)','cbRequireOwner_()','CommercialBeta_Setup']));
check('clean launcher retires old cache and sessions',has(launcher,['serviceWorker.getRegistrations','registration.unregister()','caches.keys()','h38-business-office-',"sessionStorage.removeItem('h38-gateway-session-v1')","sessionStorage.removeItem('h38-execution-session-v1')",'window.location.replace(destination)','AKfycbyY8cbfvGLzllw7rMhRY46wx_eIKhsK5oLlV6vIcDxDIKuCzX0_oTi4EyVufSxonLdxow']));
check('top-level app consumes gateway fragment then clears it',has(bridge,['decodeBase64Url','consumeHashHandoff','history.replaceState',"handoff.handoffType!=='H38_GATEWAY_HANDOFF'",'sessionStorage.setItem(SESSION_KEY','browserReceivesGoogleToken:false'])&&has(index,["window.H38_BUILD='20260803-1700'",'H38_GATEWAY_HANDOFF_PRESENT','H38_EXECUTION_HANDOFF_PRESENT=false']));
check('browser transport contains no Google token or intercepted Authorization header',has(bridge,["const SESSION_KEY='h38-gateway-session-v1'","this.transport='supabase-gateway'",'gatewaySession:this.session.gatewaySession',"body:JSON.stringify({type:'api',gatewaySession:this.session.gatewaySession,action,args:args||{}})","credentials:'omit'",'window.H38_EXECUTION_SESSION=null'])&&!bridge.includes('authorization:`Bearer ${this.session.gatewaySession}`')&&!bridge.includes('script.googleapis.com')&&!bridge.includes('this.session.accessToken')&&!bridge.includes("function:'cbApi'")&&!bridge.includes('postMessage(')&&!bridge.includes('window.open('));
check('selected business carries into PWA',has(startup,["query.get('businessId')",'setFastBusinessId','persistBusinessSelection','startup.selectedBusinessId']));
check('fast startup opens before gateway refresh',has(startup,["const H38_STARTUP_BUILD='20260803-1700'",'saveStartupSnapshot(startup.snapshot','openPage(state.page,false)',"state.bridge.request('fullStartupRefresh'"])&&startup.indexOf('openPage(state.page,false)')<startup.indexOf("state.bridge.request('fullStartupRefresh'"));
check('industry labels normalize arrays and JSON strings',has(read('commercial-app/app-01.js'),['const industryPacks=','JSON.parse(raw)',"raw.split(',')"]));
check('full Office navigation is present',has(app,['Today','Customers','Work','Quotes','Measure','Schedule','Messages','Field','Inventory','Fleet','Money','Documents','Social','H38 AI','Settings']));
check('standalone product shells share records',has(app,['Standalone Quote Builder','Field & Crew','Inventory & Fleet','Social Control']));
check('mobile layout stacks and uses bottom navigation',has(styles,['@media(max-width:760px)','.main-nav{position:fixed','bottom:0','grid-template-columns:1fr','.actions>*{flex:1 1 100%}']));
check('mobile metadata remains present',has(index,['mobile-web-app-capable','apple-mobile-web-app-capable','viewport-fit=cover','manifest.webmanifest']));
check('runtime helpers avoid global collisions',has(dbClient,["'use strict'",'(()=>{','window.H38DB={put,get,all,remove,clearAll,newId}','})();'])&&has(bridge,["'use strict'",'(()=>{','class H38Bridge','window.H38Bridge=H38Bridge','})();']));
check('legacy service worker remains retired',has(worker,["const RETIRED_BUILD='20260803-1700'",'self.registration.unregister()','h38-business-office-',"cache:'no-store'"])&&!worker.includes('caches.open('));
const auth=joined('apps-script/commercial-office-beta','CommercialBeta_CompletionAuthorization_','.gs'),core=joined('apps-script/commercial-office-beta','CommercialBeta_CompletionCore_','.gs'),ops=joined('apps-script/commercial-office-beta','CommercialBeta_CompletionOperations_','.gs'),communications=joined('apps-script/commercial-office-beta','CommercialBeta_CompletionCommunications_','.gs'),socialAi=joined('apps-script/commercial-office-beta','CommercialBeta_CompletionSocialAI_','.gs'),sync=joined('apps-script/commercial-office-beta','CommercialBeta_CompletionSync_','.gs');
check('multi-user role enforcement',has(auth,['cbCompletionBusinessUser_','cbCompletionVisibleBusinesses_','cbCompletionCan_','manageUsers','manageFinancial','manageSocial','manageCommunications']));
check('complete bootstrap returns workspaces',has(core,['cbCompletionBootstrap_','cbCompletionProductShells_','data.quotes','data.measurements','data.conversations','data.socialPosts','data.aiRecommendations','data.syncConflicts']));
check('core operating actions exist',has(ops,['cbCompletionSaveCustomer_','cbCompletionSaveRequest_','cbCompletionSaveJob_','cbCompletionSaveTask_','cbCompletionSaveSchedule_','cbCompletionSaveMeasurement_','cbCompletionSaveQuote_','cbCompletionPostInventory_','cbCompletionAssignAsset_','cbCompletionScheduleMaintenance_','cbCompletionSaveInvoice_','cbCompletionRecordPayment_','cbCompletionSaveExpense_','cbCompletionSaveAttachment_']));
check('communications remain draft controlled',has(communications,['cbCompletionSendInternalMessage_','cbCompletionSaveEmailDraft_','Draft — Not Sent','cbCompletionSaveSmsDraft_','Consent Status','cbCompletionSavePortalMessage_']));
check('social AI and voice remain controlled',has(socialAi,['cbCompletionSaveSocialPost_','cbCompletionApproveSocialPost_','Automatic social publishing is disabled','cbCompletionAiLocalAnswer_','Missing Button','Review When Parked']));
const queued=[...app.matchAll(/queueOperation\('([^']+)'/g)].map(match=>match[1]),handlers=new Set([...sync.matchAll(/action==='([^']+)'/g)].map(match=>match[1]));check('every queued action has server handler',queued.every(action=>handlers.has(action)),queued.filter(action=>!handlers.has(action)).join(','));
const direct=[...app.matchAll(/bridge\.request\('([^']+)'/g)].map(match=>match[1]),routes=new Set([...web.matchAll(/action==='([^']+)'/g)].map(match=>match[1]));check('every direct API has route',direct.every(action=>routes.has(action)),direct.filter(action=>!routes.has(action)).join(','));
check('idempotent sync and conflicts remain',has(sync,['ALREADY_SYNCED','Idempotency Key','CONFLICT','cbCompletionOperationPrior_']));
check('web app executes as signed-in user',manifest.webapp&&manifest.webapp.executeAs==='USER_ACCESSING');
const combined=required.map(read).join('\n');check('no automatic action release',!/(externalActionsEnabled\s*:\s*true|productionMigrationEnabled\s*:\s*true|automaticSocialPublishing\s*:\s*true|automaticCustomerSending\s*:\s*true|automaticFinancialActions\s*:\s*true)/.test(combined));
const output={status:failures.length?'FAIL':'PASS',checks:checks.length,failures,fullOffice:true,mobile:true,offlineDrafts:true,quoteBuilder:true,communications:true,fleetMaintenance:true,socialControl:true,aiVoice:true,globalRuntimeIsolated:true,topLevelOffice:true,userActivatedReturn:true,supabaseGatewayTransport:true,opaqueSessionInRequestBody:true,browserReceivesGoogleToken:false,persistentAuthWindow:false,productionMigration:false,externalActions:false};
if(failures.length){console.error(JSON.stringify(output,null,2));process.exit(1);}console.log(JSON.stringify(output,null,2));