#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const failures=[],passes=[];
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const exists=rel=>fs.existsSync(path.join(root,rel));
const check=(name,condition,evidence='')=>(condition?passes:failures).push({name,evidence});

const index=read('index.html');
const solutions=read('solutions.html');
const pricing=read('pricing.html');
const samples=read('sample-library-now.html');
const request=read('start-request.html');
const requestClient=read('request-flow.js');
const intake=read('apps-script/unified-shell/Unified_PublicIntake.gs');
const publicShell=read('assets/js/h38-site-v2.js');
const portal=read('portal.html');
const portalIndex=read('apps-script/core-engine/owner-portal-next/Portal_Index.html');
const portalUnified=read('apps-script/core-engine/owner-portal-next/Portal_Unified.js');
const portalShell=read('apps-script/core-engine/owner-portal-next/Portal_UX_Client_Shell.html');
const portalBusinessServer=read('apps-script/core-engine/owner-portal-next/Portal_Business.js');
const portalBusinessClient=read('apps-script/core-engine/owner-portal-next/Portal_Business_Client.html');
const moduleContract=read('apps-script/business-office/BusinessOffice_ModuleContract.gs');
const moduleRegistry=read('apps-script/core-engine/owner-portal-next/Portal_Module_Registry.js');
const businessWeb=read('apps-script/business-office/BusinessOffice_Web.gs');
const businessGate=read('apps-script/business-office/BusinessOffice_ModuleAccess.gs');
const businessConfig=JSON.parse(read('business-packs/highway38/business-office.config.json'));
const approvedAssets=JSON.parse(read('scripts/config/approved-public-assets.json'));
const placements=JSON.parse(read('scripts/config/approved-public-image-placements.json'));
const routes=JSON.parse(read('scripts/config/public-website-routes.json'));
const deployment=read('scripts/deploy-unified-owner-portal-web.sh');

check('homepage uses current project-first promise',index.includes('Bring us the problem.')&&index.includes('complete project plan.')&&index.includes('See it. Scope it. Run it.'));
check('homepage has request and examples actions',index.includes('href="start-request.html"')&&index.includes('href="sample-library-now.html"'));
check('homepage uses approved local imagery without mockup shell',index.includes('assets/approved-website-images/')&&!index.includes('approved-homepage-mockup.png')&&!/class="[^"]*hotspot/.test(index));
check('homepage contains no prohibited CNC quantity claim or personal attribution',!/25,000\+\s*(?:CNC\s+)?programs?|Rick\s+Krueth/i.test(index));
check('canonical public shell owns navigation footer mobile menu and Owner route',publicShell.includes('class="pi-menu"')&&publicShell.includes("['Owner Access','portal.html']")&&publicShell.includes('pi-footer-inner'));
check('canonical public shell locks image replacement',/imagePolicy:\{changeSource:false,insertImages:false,fallbackImages:false/.test(publicShell));

check('What We Do has five accepted capability cards',(solutions.match(/data-capability=/g)||[]).length===5&&['Automation & Robotics','CNC Machining & Process Planning','CNC Fixturing & Workholding','AI-Assisted Quote Builder','Highway 38 Business Office'].every(marker=>solutions.includes(marker)));
check('What We Do removes retired fixed-price paths',!solutions.includes('Choose Your Path')&&!solutions.includes('Problem Snapshot')&&!solutions.includes('Basic Layout Snapshot'));
check('pricing is project first and approval based',pricing.includes('Project-first pricing')&&pricing.includes('Not a confusing catalog.')&&pricing.includes('Scope and price are approved before implementation.'));

check('public Examples contains eight complete project workflows',(samples.match(/class="project-card"/g)||[]).length===8&&samples.includes('Eight complete project demonstrations'));
check('public Examples preserves representative proof classification',samples.includes('Representative demonstrations.')&&samples.includes('data-image-classification="hypothetical-demonstration"'));
check('public Examples uses six direct controlled deck irrigation kitchen images',['deck-before.webp','deck-after.webp','irrigation-before.webp','irrigation-after.webp','kitchen-before.webp','kitchen-after.webp'].every(name=>samples.includes(`assets/demo-workthroughs/${name}`))&&!samples.includes('at.adobe.com'));
check('public Examples includes complete cabin walkthrough',samples.includes('cabin-plan-sheet.png')&&samples.includes('cabin-exterior-render.png')&&samples.includes('cabin-project-complete.html'));

check('request flow uses secure direct submission',request.includes('id="request-submit"')&&request.includes('data-intake-endpoint=')&&[1,2,3].every(step=>request.includes(`data-request-step="${step}"`)));
check('request flow keeps email fallback and draft recovery',request.includes('id="email-summary" hidden>Email fallback')&&requestClient.includes('emailFallback')&&requestClient.includes('H38Platform.saveDraft')&&requestClient.includes('H38Platform.loadDraft'));
check('secure intake creates internal Owner-review record only',/function doPost\(event\)/.test(intake)&&/Owner Approval Required/.test(intake)&&!/sendEmail|GmailApp|MailApp/.test(intake));
check('secure intake preserves idempotency protection',/H38_PUBLIC_INTAKE_/.test(intake)&&/DUPLICATE_ACCEPTED/.test(intake));

check('project-first route manifest owns current public gateways',['index.html','sample-library-now.html','solutions.html','pricing.html','about.html','contact.html','start-request.html','portal.html'].every(path=>(routes.primary||[]).some(item=>item.path===path)));
check('retired catalog and tool routes remain redirects',routes.retired['products.html']==='pricing.html'&&routes.retired['catalog.html']==='pricing.html'&&routes.retired['tool-center.html']==='sample-library-now.html');
check('one approved asset manifest and one placement manifest remain canonical',approvedAssets.approved_logo&&placements.pages&&exists('scripts/config/approved-public-assets.json')&&exists('scripts/config/approved-public-image-placements.json'));
check('approved logo remains substitution locked',approvedAssets.approved_logo.allow_image_substitute===false);

check('Owner Portal is an automatic gateway to one secure Business Office',portal.includes('Opening Highway 38 Business Office')&&/location\.replace\(target\)/.test(portal)&&!/<iframe\b/i.test(portal));
check('secure app contains no nested Business Office iframe',!/<iframe\b|businessWorkspace|businessFrame/.test(portalIndex));
check('secure app includes native Business Office client and styles',portalIndex.includes('Portal_Business_Client')&&portalIndex.includes('Portal_Business_Styles'));
check('seven workspace groups come from canonical module contract',['Today','Customers','Work','Money','Documents','Growth','Office'].every(label=>moduleContract.includes(`label:'${label}'`))&&!moduleContract.includes("label:'Control'"));
check('visible navigation is contract derived',moduleRegistry.includes('boGetUnifiedModuleContract_()')&&portalUnified.includes('h38PortalModuleRegistry_('));
check('Today remains first workspace',portalUnified.includes("var defaultModule = access.ownerMode ? 'today' : 'bo:assignedTasks'"));
check('startup preserves one RPC and deferred secondary modules',portalUnified.includes('rpcCount:1')&&portalUnified.includes('secondaryModulesDeferred:true')&&portalUnified.includes('schemaChecksDeferred:true'));
check('startup exposes performance timing evidence',portalUnified.includes('phaseMs:phases')&&portalUnified.includes('payloadCharacters'));
check('Business Office renders directly with loading and failure states',portalShell.includes('uxWorkspaceHasContent')&&portalShell.includes('uxRenderWorkspaceFailure')&&portalBusinessClient.includes('function renderBusinessModule'));
check('native Business Office supports list open save and upload',['h38PortalBusinessModule','h38PortalBusinessWorkspace','h38PortalBusinessSave','h38PortalBusinessUpload'].every(name=>portalBusinessServer.includes(`function ${name}`)));
check('Business Office modules are enforced server side',businessWeb.includes('boGuardApiRequest_(action,args)')&&businessGate.includes('MODULE NOT INCLUDED'));
check('external actions remain Owner approval gated',portalUnified.includes('externalActionsEnabled:false')&&portalUnified.includes('ownerApprovalRequired:true'));

const approvedLogoUrl=approvedAssets.production_url.replace(/\/$/,'')+'/'+approvedAssets.approved_logo.public_reference;
check('Business Office uses controlled approved logo',businessConfig.branding.logoUrl===approvedLogoUrl,businessConfig.branding.logoUrl||'blank');
check('Business Office remains one complete app',businessConfig.package&&businessConfig.package.singleApp===true);
check('deployment updates existing IDs in place',deployment.includes('clasp update-deployment "$OWNER_DEPLOYMENT_ID"')&&deployment.includes('clasp update-deployment "$BUSINESS_OFFICE_DEPLOYMENT_ID"')&&!/clasp\s+(?:create-script|create-deployment)\b/.test(deployment));

const result={status:failures.length?'HOLD':'PASS',sourceCommit:process.env.GITHUB_SHA||'',passed:passes.length,failed:failures.length,architecture:'project-first-public-plus-unified-business-office',passes,failures};
const outputDir=path.join(root,'artifacts','final-polish');fs.mkdirSync(outputDir,{recursive:true});fs.writeFileSync(path.join(outputDir,'verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));process.exit(failures.length?1:0);
