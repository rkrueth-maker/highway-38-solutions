#!/usr/bin/env node
'use strict';

const childProcess=require('child_process');
const fs=require('fs');
const path=require('path');

const ROOT=path.resolve(__dirname,'..');
const EVIDENCE_DIR=path.join(ROOT,'launch-control','evidence');
const legacyVerifier=path.join(ROOT,'scripts','verify-proof-evidence-system.js');
const legacyEvidencePath=path.join(EVIDENCE_DIR,'proof-evidence-system-verification.json');
const currentEvidencePath=path.join(EVIDENCE_DIR,'proof-evidence-current-verification.json');
const read=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');
const exists=rel=>fs.existsSync(path.join(ROOT,rel));
const checks=[];
const failures=[];
const check=(name,condition,detail='')=>(condition?checks:failures).push({name,detail});

fs.mkdirSync(EVIDENCE_DIR,{recursive:true});
const legacyRun=childProcess.spawnSync(process.execPath,[legacyVerifier],{
  cwd:ROOT,
  encoding:'utf8',
  env:process.env,
  maxBuffer:25*1024*1024,
});

check('legacy proof verifier produced evidence',exists('launch-control/evidence/proof-evidence-system-verification.json'),legacyRun.stderr||legacyRun.stdout||'');
let legacyEvidence={failures:[{name:'legacy evidence missing'}],passes:[]};
if(fs.existsSync(legacyEvidencePath))legacyEvidence=JSON.parse(fs.readFileSync(legacyEvidencePath,'utf8'));

const retiredPresentationChecks=new Set([
  'proof page loads versioned public proof data',
  'proof page publishes method and privacy rules',
  'proof page links photo review and tool resources',
  'proof renderer includes complete case fields',
  'free tools exposes release, manifest, and downloads',
]);
const legacyFailures=Array.isArray(legacyEvidence.failures)?legacyEvidence.failures:[];
const unexpectedLegacyFailures=legacyFailures.filter(item=>!retiredPresentationChecks.has(item.name));
check('legacy proof verification has no substantive failures',unexpectedLegacyFailures.length===0,JSON.stringify(unexpectedLegacyFailures));
check('legacy proof pipeline completed most substantive checks',Number(legacyEvidence.passed||0)>=45,String(legacyEvidence.passed||0));

const proofRedirect=read('proof.html');
const toolsRedirect=read('free-tools.html');
check('retired proof route is noindex and deterministic',/noindex/i.test(proofRedirect)&&proofRedirect.includes('sample-library-now.html')&&/location\.replace|http-equiv="refresh"/i.test(proofRedirect));
check('retired free-tools route is noindex and deterministic',/noindex/i.test(toolsRedirect)&&toolsRedirect.includes('sample-library-now.html')&&/location\.replace|http-equiv="refresh"/i.test(toolsRedirect));
check('maintained public proof destination exists',exists('sample-library-now.html')&&read('sample-library-now.html').includes('Complete Project Examples'));
check('proof data and renderer remain preserved',exists('proof-data.js')&&exists('proof.js')&&exists('proof-system/public/public-case-studies.json'));
check('tool manifest and downloads remain preserved',exists('proof-system/public/tools-manifest.json')&&exists('downloads/h38-vendor-quote-completeness.csv')&&exists('downloads/h38-project-scope-builder.csv')&&exists('downloads/h38-photo-privacy-review.csv'));
check('private proof and external-action controls remain locked',legacyEvidence.privateSourcePublished===false&&legacyEvidence.externalActionsOccurred===false&&legacyEvidence.publicRawImagesApproved===0);

const evidence={
  status:failures.length?'HOLD':'PASS',
  generatedAt:new Date().toISOString(),
  release:'proof-evidence-current-public-routing-2026-07-29',
  legacyVerifierExitCode:legacyRun.status,
  legacyPassed:Number(legacyEvidence.passed||0),
  legacyFailed:Number(legacyEvidence.failed||0),
  retiredPresentationFailuresAccepted:legacyFailures.filter(item=>retiredPresentationChecks.has(item.name)).map(item=>item.name),
  unexpectedLegacyFailures,
  publicProofRoute:'sample-library-now.html',
  retiredRoutes:['proof.html','free-tools.html'],
  privateSourcePublished:false,
  externalActionsOccurred:false,
  passes:checks,
  failures,
};
fs.writeFileSync(currentEvidencePath,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
process.exit(failures.length?1:0);
