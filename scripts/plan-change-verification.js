#!/usr/bin/env node
'use strict';

const childProcess=require('child_process');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const args=process.argv.slice(2);
const valueAfter=name=>{const index=args.indexOf(name);return index>=0?args[index+1]:'';};
const has=name=>args.includes(name);
const base=valueAfter('--base')||process.env.H38_PLAN_BASE||'';
const head=valueAfter('--head')||process.env.H38_PLAN_HEAD||'HEAD';
const explicitFiles=valueAfter('--files');

function run(command){return childProcess.execSync(command,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function unique(values){return [...new Set(values.filter(Boolean))];}
function matches(file,patterns){return patterns.some(pattern=>pattern.test(file));}

function changedFiles(){
  if(explicitFiles)return explicitFiles.split(',').map(value=>value.trim()).filter(Boolean);
  const usableBase=base&&!/^0+$/.test(base);
  const candidates=[];
  if(usableBase)candidates.push(`git diff --name-only ${JSON.stringify(base)}...${JSON.stringify(head)}`);
  candidates.push(`git diff --name-only HEAD~1...${JSON.stringify(head)}`);
  candidates.push('git ls-files');
  for(const command of candidates){
    try{
      const output=run(command);
      if(output)return output.split(/\r?\n/).map(value=>value.trim()).filter(Boolean);
    }catch(error){}
  }
  return [];
}

const files=unique(changedFiles()).sort();
const scopes={
  publicWebsite:false,
  authenticatedApp:false,
  customerPortal:false,
  sharedArchitecture:false,
  performanceReliability:false,
  workflowOnly:false,
  documentationOnly:false
};

const publicPatterns=[
  /(^|\/)[^/]+\.html$/,
  /^assets\/(css|js|images|demo-workthroughs)\//,
  /^scripts\/config\/(public-website-routes|approved-public-assets|approved-public-image-placements)\.json$/,
  /^scripts\/verify-public-/,
  /^scripts\/guard_deploy\.py$/,
  /^\.github\/workflows\/pages\.yml$/
];
const appPatterns=[
  /^apps-script\/business-office\//,
  /^apps-script\/business-office-sync\//,
  /^apps-script\/core-engine\/owner-portal-next\//,
  /^scripts\/verify-(business-office|owner-portal|unified-app|unified-client|task-messaging|quote-builder|field-role|user-access|owner-role|single-apps-script|ai-approval)/,
  /^\.github\/workflows\/deploy-owner-portal-hard-rule-production\.yml$/,
  /^\.github\/workflows\/business-office-authorized-acceptance\.yml$/
];
const portalPatterns=[
  /customer-portal/i,
  /^supabase\//,
  /verify-customer-portal-(security|supabase)/
];
const sharedPatterns=[
  /^AGENTS\.md$/,
  /^docs\/architecture\//,
  /^scripts\/verify-change-governance\.js$/,
  /^scripts\/plan-change-verification\.js$/,
  /^apps-script\/business-office\/BusinessOffice_(Module|Action)Contract\.gs$/,
  /^apps-script\/core-engine\/owner-portal-next\/Portal_Module_Registry\.js$/,
  /^\.github\/PULL_REQUEST_TEMPLATE\.md$/,
  /^\.github\/ISSUE_TEMPLATE\//,
  /^package\.json$/
];
const reliabilityPatterns=[
  /^\.github\/workflows\//,
  /^scripts\/(verify|audit|plan|deploy|guard|generate|business-office-authorized)/,
  /performance/i,
  /cache/i,
  /reliab/i,
  /rollback/i,
  /migration/i,
  /seeder/i
];
const documentationPatterns=[/\.md$/,/^docs\//,/^\.github\/ISSUE_TEMPLATE\//,/^\.github\/PULL_REQUEST_TEMPLATE\.md$/];
const workflowPatterns=[/^\.github\/workflows\//];

for(const file of files){
  if(matches(file,publicPatterns))scopes.publicWebsite=true;
  if(matches(file,appPatterns))scopes.authenticatedApp=true;
  if(matches(file,portalPatterns))scopes.customerPortal=true;
  if(matches(file,sharedPatterns))scopes.sharedArchitecture=true;
  if(matches(file,reliabilityPatterns))scopes.performanceReliability=true;
}
scopes.documentationOnly=files.length>0&&files.every(file=>matches(file,documentationPatterns));
scopes.workflowOnly=files.length>0&&files.every(file=>matches(file,workflowPatterns)||matches(file,documentationPatterns));

const risk={
  productionWorkflow:files.some(file=>/^\.github\/workflows\/(pages|deploy-owner-portal-hard-rule-production|business-office-authorized-acceptance)\.yml$/.test(file)),
  schemaOrDataOwner:files.some(file=>/Schema|Seeder|Migration|Config\.gs|ModuleContract|ActionContract|business-office\/.*\.gs$/.test(file)),
  approvedAssets:files.some(file=>/^assets\/(images|demo-workthroughs)\//.test(file)||/approved-public-(assets|image-placements)\.json$/.test(file)),
  publicRendering:files.some(file=>/\.html$/.test(file)||/^assets\/(css|js)\//.test(file)),
  authenticatedRendering:files.some(file=>/^apps-script\/(business-office|core-engine\/owner-portal-next)\/.+\.(html|js|gs)$/.test(file)),
  externalActionBoundary:files.some(file=>/Approval|Payment|Invoice|Purchase|Messaging|Notification|Deployment|External/i.test(file)),
  longRunningData:files.some(file=>/Seeder|Migration|Backup|Pdf|OCR|Import|Generate/i.test(file))
};

const fastChecks=['node scripts/verify-change-governance.js'];
if(scopes.publicWebsite||scopes.sharedArchitecture){
  fastChecks.push('node scripts/verify-public-website-architecture.js');
  fastChecks.push('node scripts/verify-public-ecosystem-tools.js');
}
if(risk.approvedAssets){
  fastChecks.push('python3 scripts/verify-public-images.py');
  fastChecks.push('node scripts/verify-public-image-placements.js');
}
if(scopes.authenticatedApp||scopes.sharedArchitecture){
  fastChecks.push('node scripts/verify-unified-app-architecture.js');
  fastChecks.push('node scripts/verify-business-office.js');
}
if(scopes.customerPortal)fastChecks.push('node scripts/verify-customer-portal-security.js');

const expensiveChecks=[];
if(risk.publicRendering)expensiveChecks.push('desktop and mobile public browser verification for affected routes');
if(risk.authenticatedRendering)expensiveChecks.push('desktop and mobile authenticated route verification for affected workspaces');
if(risk.approvedAssets)expensiveChecks.push('rendered pixel and direct-image verification');
if(risk.schemaOrDataOwner)expensiveChecks.push('exact record-count, idempotency, duplicate, backup, and rollback verification');
if(risk.longRunningData)expensiveChecks.push('resumable small-batch generation with cursor and exact final counts');
if(risk.productionWorkflow)expensiveChecks.push('controlled workflow run with machine-readable PASS/HOLD evidence');

const deploymentWorkflows=[];
if(scopes.publicWebsite)deploymentWorkflows.push('.github/workflows/pages.yml');
if(scopes.authenticatedApp||scopes.customerPortal)deploymentWorkflows.push('.github/workflows/deploy-owner-portal-hard-rule-production.yml');

const reusableEvidence=[];
if(scopes.documentationOnly)reusableEvidence.push('Product browser, image, and live evidence may be reused when tied to the same tested commit and no rendered or runtime input changed.');
if(!risk.publicRendering&&!risk.approvedAssets)reusableEvidence.push('Public browser and image evidence is not invalidated by this change.');
if(!risk.authenticatedRendering&&!risk.schemaOrDataOwner)reusableEvidence.push('Authenticated browser and data-coverage evidence is not invalidated by this change.');
if(scopes.workflowOnly)reusableEvidence.push('Only the affected workflow evidence must be regenerated; unrelated product checks remain reusable when inputs are unchanged.');

const plan={
  status:'PASS',
  generatedAt:new Date().toISOString(),
  base:base||null,
  head,
  files,
  fileCount:files.length,
  scopes,
  risk,
  fastChecks:unique(fastChecks),
  expensiveChecks:unique(expensiveChecks),
  deploymentWorkflows:unique(deploymentWorkflows),
  reusableEvidence:unique(reusableEvidence),
  executionRules:[
    'Run fast checks before expensive or live checks.',
    'Use one integrated branch, one pull request, and one authoritative workflow per production target.',
    'Inspect the first failing stage before rerunning.',
    'Rerun only the failed or affected scope when inputs are unchanged.',
    'After the same failure twice, change the execution design instead of repeating the pipeline.',
    'Preserve the live system and external-action locks when verification is HOLD.'
  ]
};

const out=path.join(root,'artifacts','change-plan');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'verification-plan.json'),JSON.stringify(plan,null,2)+'\n');
const markdown=[
  '# Scope-aware verification plan',
  '',
  `- Files changed: ${plan.fileCount}`,
  `- Scopes: ${Object.entries(scopes).filter(([,enabled])=>enabled).map(([name])=>name).join(', ')||'none detected'}`,
  `- Deployment workflows: ${deploymentWorkflows.join(', ')||'none'}`,
  '',
  '## Fast checks',
  ...plan.fastChecks.map(command=>`- \`${command}\``),
  '',
  '## Expensive or live checks',
  ...(plan.expensiveChecks.length?plan.expensiveChecks.map(item=>`- ${item}`):['- None identified.']),
  '',
  '## Evidence that may remain reusable',
  ...(plan.reusableEvidence.length?plan.reusableEvidence.map(item=>`- ${item}`):['- Re-evaluate evidence after the fast checks.'])
].join('\n')+'\n';
fs.writeFileSync(path.join(out,'verification-plan.md'),markdown);

console.log(JSON.stringify(plan,null,2));
if(has('--strict')&&files.length===0)process.exit(1);
