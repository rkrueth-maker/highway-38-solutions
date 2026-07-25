#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const pass=[];
const failures=[];
function check(name,condition,detail=''){(condition?pass:failures).push({name,detail});console[condition?'log':'error'](`${condition?'PASS':'FAIL'}: ${name}${detail?` — ${detail}`:''}`);}
function file(relative){return path.join(root,relative);}
function exists(relative){return fs.existsSync(file(relative));}
function read(relative){return fs.readFileSync(file(relative),'utf8');}

const required={
  agents:'AGENTS.md',
  governance:'docs/architecture/WEBSITE_AND_WEB_APP_CHANGE_GOVERNANCE.md',
  fastProcess:'docs/architecture/FAST_RELIABLE_CHANGE_PROCESS.md',
  appRules:'docs/architecture/UNIFIED_APP_CHANGE_RULES.md',
  performanceStandard:'docs/architecture/MODULE_PERFORMANCE_STANDARD.md',
  prTemplate:'.github/PULL_REQUEST_TEMPLATE.md',
  appModuleIssueForm:'.github/ISSUE_TEMPLATE/app-module-change.yml',
  performanceIssueForm:'.github/ISSUE_TEMPLATE/performance-regression.yml',
  websiteRules:'docs/architecture/PUBLIC_WEBSITE_CHANGE_RULES.md',
  moduleContract:'apps-script/business-office/BusinessOffice_ModuleContract.gs',
  actionContract:'apps-script/business-office/BusinessOffice_ActionContract.gs',
  moduleRegistry:'apps-script/core-engine/owner-portal-next/Portal_Module_Registry.js',
  siteShell:'assets/js/h38-site-v2.js',
  siteStyles:'assets/css/h38-site-v2.css',
  routeRegistry:'scripts/config/public-website-routes.json',
  approvedAssets:'scripts/config/approved-public-assets.json',
  imagePlacements:'scripts/config/approved-public-image-placements.json',
  pagesWorkflow:'.github/workflows/pages.yml',
  appWorkflow:'.github/workflows/deploy-owner-portal-hard-rule-production.yml',
  governanceWorkflow:'.github/workflows/change-governance.yml',
  websiteVerifier:'scripts/verify-public-website-architecture.js',
  appVerifier:'scripts/verify-unified-app-architecture.js',
  changePlanner:'scripts/plan-change-verification.js',
  packageJson:'package.json'
};
Object.entries(required).forEach(([name,relative])=>check(`${name} exists`,exists(relative),relative));

if(failures.length===0){
  const agents=read(required.agents);
  const governance=read(required.governance);
  const fastProcess=read(required.fastProcess);
  const appRules=read(required.appRules);
  const performanceStandard=read(required.performanceStandard);
  const prTemplate=read(required.prTemplate);
  const appModuleIssueForm=read(required.appModuleIssueForm);
  const performanceIssueForm=read(required.performanceIssueForm);
  const websiteRules=read(required.websiteRules);
  const pagesWorkflow=read(required.pagesWorkflow);
  const appWorkflow=read(required.appWorkflow);
  const governanceWorkflow=read(required.governanceWorkflow);
  const websiteVerifier=read(required.websiteVerifier);
  const appVerifier=read(required.appVerifier);
  const changePlanner=read(required.changePlanner);
  const packageJson=JSON.parse(read(required.packageJson));
  const moduleContract=read(required.moduleContract);
  const actionContract=read(required.actionContract);
  const moduleRegistry=read(required.moduleRegistry);
  const shell=read(required.siteShell);
  const routes=JSON.parse(read(required.routeRegistry));
  const placements=JSON.parse(read(required.imagePlacements));

  check('root rules apply to every chat and change',/every chat, agent, branch, pull request, direct commit, automation, module, application, and public website change/i.test(agents));
  check('root rules reference combined governance',agents.includes('WEBSITE_AND_WEB_APP_CHANGE_GOVERNANCE.md'));
  check('root rules reference fast reliable process',agents.includes('FAST_RELIABLE_CHANGE_PROCESS.md'));
  check('root rules identify canonical module contract',agents.includes('BusinessOffice_ModuleContract.gs'));
  check('root rules identify canonical action contract',agents.includes('BusinessOffice_ActionContract.gs'));
  check('root rules identify canonical public shell',agents.includes('assets/js/h38-site-v2.js')&&agents.includes('assets/css/h38-site-v2.css'));
  check('root rules identify canonical image placement manifest',agents.includes('scripts/config/approved-public-image-placements.json'));
  check('root rules require governance verification',agents.includes('node scripts/verify-change-governance.js'));
  check('root rules require change planning',agents.includes('npm run plan:change'));
  check('root rules make performance a release requirement',agents.includes('Performance is a release requirement, not optional polish.'));
  check('root rules prohibit blind repeat failures',/same failure occurs twice/i.test(agents)&&/execution design/i.test(agents));

  ['Classify the change before editing','Required change intake','Adding to the public website','Adding to the authenticated web app','Deleting or retiring','Prohibited additions','Performance requirements','Mandatory verification','Deployment authority','Definition of done'].forEach(marker=>check(`governance section: ${marker}`,governance.includes(marker)));
  check('governance locks logo and image binaries',/logo and approved website image binaries are locked/i.test(governance));
  check('governance preserves records and deployment IDs',governance.includes('deployment IDs')&&governance.includes('Proof Log')&&governance.includes('audit history'));
  check('governance blocks duplicate architecture',/another authenticated application shell/.test(governance)&&/another public-site shell/.test(governance)&&/duplicate schemas/.test(governance));
  check('governance requires one app startup RPC',/one browser-to-server startup RPC/.test(governance));
  check('governance names both deployment authorities',governance.includes('.github/workflows/pages.yml')&&governance.includes('.github/workflows/deploy-owner-portal-hard-rule-production.yml'));
  check('performance and reliability rule changes are explicitly governed',governance.includes('Performance and reliability rule changes')&&/measurably improves speed or reliability/.test(governance)&&/does not destroy how the system works together/.test(governance));
  check('protected invariants cannot be weakened',/preserve authentication, authorization, customer isolation, records, IDs, approval gates, Proof Log, Error Log, backups, audit history, deployment IDs, and external-action controls/.test(governance));
  check('stale checks must be corrected not bypassed',/remove stale, duplicate, unrelated, or contradictory checks rather than bypassing a real defect/.test(governance)&&/A stale verifier may be corrected/.test(governance));
  check('verification is scope aware',governance.includes('Verification is scope-aware')&&governance.includes('Public-only checks should not gate an authenticated-only change')&&governance.includes('Customer Portal checks must remain focused on the Customer Portal security boundary'));
  check('security and destructive controls remain fail closed',/security, destructive-action, data-integrity, and deployment checks fail-closed/.test(governance));
  check('fast checks run before expensive checks',/Fast structural and syntax checks run before expensive browser, image, deployment, or clean-install checks/.test(governance));

  ['Primary operating rule','Ten-line change brief','Staged execution path','Data generation and long-running operations','Failure-handling rules','Evidence reuse rules','Workflow and verifier ownership','Documentation update rule','Fast handoff format','Definition of done'].forEach(marker=>check(`fast process section: ${marker}`,fastProcess.includes(marker)));
  check('fast process preserves protected invariants',fastProcess.includes('may not weaken authentication, authorization, customer or business isolation, records, IDs, approval gates, Proof Log, Error Log, backups, audit history, existing deployment IDs, approved assets, or external-action controls'));
  check('fast process enforces one workstream and workflow',fastProcess.includes('one workstream, one canonical owner, one integrated branch, one pull request, one deployment workflow, and one final evidence packet'));
  check('fast process requires planning command',fastProcess.includes('npm run plan:change -- --base <base-ref> --head <head-ref>'));
  check('fast process requires small resumable batches',/Small batches, normally two to five logical records or packages per execution/.test(fastProcess)&&/Persist a cursor, version, start time, update time, status, and last error/.test(fastProcess));
  check('fast process requires exact final counts and idempotency',fastProcess.includes('exact table counts')&&fastProcess.includes('A second execution must produce the same final state without duplicate records, folders, files, or logs.'));
  check('fast process stops blind rerun loops',fastProcess.includes('After the same failure occurs twice, stop repeating the pipeline.'));
  check('fast process preserves live system on HOLD',fastProcess.includes('Preserve the current live system when final verification is HOLD.'));
  check('fast process defines evidence reuse',fastProcess.includes('Evidence may be reused only when it is tied to the exact commit and the tested inputs are unchanged.'));
  check('fast process requires one verifier per invariant',fastProcess.includes('One invariant has one authoritative verifier.')&&fastProcess.includes('One production target has one authoritative deployment workflow.'));

  ['Performance is part of the design','Startup rules','Module loading rules','Data-read rules','Cache rules','Prefetch rules','Release targets','Required performance evidence','Required module intake form','Definition of done'].forEach(marker=>check(`performance standard section: ${marker}`,performanceStandard.includes(marker)));
  check('performance standard protects one startup RPC',performanceStandard.includes('one browser-to-server startup RPC'));
  check('performance standard requires bounded first loads',/no more than 50 visible records/.test(performanceStandard));
  check('performance standard requires in-flight reuse',/reuse one in-flight promise/.test(performanceStandard));
  check('performance standard requires stale-response protection',/older request cannot overwrite a newer click/.test(performanceStandard));
  check('performance standard requires scoped cache and invalidation',performanceStandard.includes('user and business scope')&&performanceStandard.includes('all write actions that invalidate it'));
  check('performance standard defines measurable targets',performanceStandard.includes('Cached or already-prefetched route')&&performanceStandard.includes('Ordinary first module load')&&performanceStandard.includes('New browser-to-server startup RPCs'));
  check('performance standard requires cold and warm evidence',performanceStandard.includes('cold first-open timing')&&performanceStandard.includes('warm/cached timing'));

  ['Scope classification','Canonical ownership','Fast and reliable execution plan','Architecture and safety','Performance design','Required performance checks','Measured evidence','Verification'].forEach(marker=>check(`PR template section: ${marker}`,prTemplate.includes(marker)));
  check('PR template requires scope planner',prTemplate.includes('npm run plan:change -- --base <base> --head <head>'));
  check('PR template blocks startup RPC growth',prTemplate.includes('No new browser-to-server startup RPC was added.'));
  check('PR template requires bounded reads',prTemplate.includes('Ordinary unfiltered list opens are bounded'));
  check('PR template requires cache invalidation',prTemplate.includes('All affected writes invalidate browser and server caches.'));
  check('PR template requires stale and previous-workspace behavior',prTemplate.includes('A stale response cannot overwrite a newer route selection.')&&prTemplate.includes('The previous workspace remains visible while the new route loads.'));
  check('PR template requires measured cold and warm timings',prTemplate.includes('Cold route timings:')&&prTemplate.includes('Warm/cached route timings:'));
  check('PR template requires failure diagnosis and evidence reuse',prTemplate.includes('First failing stage and classification')&&prTemplate.includes('Evidence from this exact commit that remains reusable'));
  check('PR template requires resumable exact-count data work',prTemplate.includes('deterministic, idempotent, resumable, version-aware, duplicate-resistant, and exact-count verified'));

  check('app module issue form references performance standard',appModuleIssueForm.includes('MODULE_PERFORMANCE_STANDARD.md'));
  check('app module issue form references fast process',appModuleIssueForm.includes('FAST_RELIABLE_CHANGE_PROCESS.md'));
  ['Requested outcome','Canonical ownership','Fast and reliable execution path','Failure diagnosis and rerun rules','Loading strategy','Normal first-load record limit','Data sources and expected reads','Cache plan','Cache invalidation','Prefetch and in-flight reuse','Performance targets and baseline','Generation, migration, or backfill controls','Verification plan'].forEach(marker=>check(`app module issue form field: ${marker}`,appModuleIssueForm.includes(marker)));
  check('app module issue form requires stale-response and in-flight safeguards',appModuleIssueForm.includes('Older responses cannot overwrite a newer route selection.')&&appModuleIssueForm.includes('Repeated requests will reuse request-scoped data or one in-flight promise.'));
  check('app module issue form prevents blind reruns',appModuleIssueForm.includes('the same failure will not be blindly repeated more than twice'));

  ['Production commit or deployment run','Exact route sequence','Measured timing','Observed symptoms','Recording, screenshots, console timing, or network evidence','Expected behavior','Data or external-action impact'].forEach(marker=>check(`performance issue form field: ${marker}`,performanceIssueForm.includes(marker)));
  check('performance issue form requires cold and warm retest',performanceIssueForm.includes('cold startup')&&performanceIssueForm.includes('warm and cached behavior'));

  check('app rules reference governance verifier',appRules.includes('node scripts/verify-change-governance.js'));
  check('website rules reference governance verifier',websiteRules.includes('node scripts/verify-change-governance.js'));
  check('website rules use only canonical placement manifest',websiteRules.includes('scripts/config/approved-public-image-placements.json')&&!websiteRules.includes('public-image-placement-manifest.json'));
  check('duplicate image placement manifest is absent',!exists('scripts/config/public-image-placement-manifest.json'));

  check('module contract is canonical',/function\s+boGetUnifiedModuleContract_\s*\(/.test(moduleContract));
  check('action contract is canonical',/function\s+boGetActionContract_\s*\(|function\s+boModulesForApiAction_\s*\(/.test(actionContract));
  check('module registry derives from contract',/boGetUnifiedModuleContract_\(/.test(moduleRegistry));
  check('public shell owns one registry',/navigation\s*:\s*\[/.test(shell)&&/footer\s*:\s*\[/.test(shell));
  check('public route registry has primary routes',Array.isArray(routes.primary)&&routes.primary.length>=7,String(routes.primary&&routes.primary.length));
  check('image placement manifest locks runtime source changes',placements.runtimeRules&&placements.runtimeRules.mayChangeImageSource===false&&placements.runtimeRules.mayInsertRepresentativeImages===false&&placements.runtimeRules.mayUseFallbackImage===false);

  check('change planner supports base and head refs',changePlanner.includes("valueAfter('--base')")&&changePlanner.includes("valueAfter('--head')"));
  check('change planner classifies all primary scopes',['publicWebsite','authenticatedApp','customerPortal','sharedArchitecture','performanceReliability'].every(marker=>changePlanner.includes(marker)));
  check('change planner separates fast and expensive checks',changePlanner.includes('fastChecks')&&changePlanner.includes('expensiveChecks'));
  check('change planner records evidence reuse',changePlanner.includes('reusableEvidence'));
  check('change planner emits machine-readable evidence',changePlanner.includes("artifacts','change-plan")&&changePlanner.includes('verification-plan.json'));
  check('package exposes change planner',packageJson.scripts&&packageJson.scripts['plan:change']==='node scripts/plan-change-verification.js');
  check('package exposes fast public and app checks',packageJson.scripts&&packageJson.scripts['test:fast:public']&&packageJson.scripts['test:fast:app']);

  check('governance workflow runs on pull requests',/pull_request:/.test(governanceWorkflow));
  check('governance workflow watches canonical rule and contract files',['AGENTS.md','docs/architecture/**','BusinessOffice_ModuleContract.gs','BusinessOffice_ActionContract.gs','approved-public-image-placements.json','public-website-routes.json'].every(marker=>governanceWorkflow.includes(marker)));
  check('governance workflow watches development forms',governanceWorkflow.includes('.github/PULL_REQUEST_TEMPLATE.md')&&governanceWorkflow.includes('.github/ISSUE_TEMPLATE/**'));
  check('governance workflow checks out comparison history',governanceWorkflow.includes('fetch-depth: 0'));
  check('governance workflow runs planner before verifier',governanceWorkflow.indexOf('node scripts/plan-change-verification.js')<governanceWorkflow.indexOf('node scripts/verify-change-governance.js'));
  check('governance workflow uploads plan and governance evidence',governanceWorkflow.includes('artifacts/change-plan/')&&governanceWorkflow.includes('artifacts/change-governance/'));
  check('Pages production workflow runs the website architecture verifier',pagesWorkflow.includes('node scripts/verify-public-website-architecture.js'));
  check('website architecture verifier runs governance first',websiteVerifier.includes('verify-change-governance.js'));
  check('Business Office production workflow runs the app architecture verifier',appWorkflow.includes('node scripts/verify-unified-app-architecture.js'));
  check('app architecture verifier runs governance first',appVerifier.includes('verify-change-governance.js'));
}

const evidence={status:failures.length?'HOLD':'PASS',generatedAt:new Date().toISOString(),policy:'website-and-web-app-governance-v4-fast-reliable-execution',passed:pass.length,failed:failures.length,pass,failures};
const out=file('artifacts/change-governance');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
process.exit(failures.length?1:0);
