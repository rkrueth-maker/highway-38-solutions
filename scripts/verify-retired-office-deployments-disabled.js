#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const failures=[];
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const check=(condition,message)=>{if(!condition)failures.push(message);};

const retired=[
  '.github/workflows/deploy-owner-portal-hard-rule-production.yml',
  '.github/workflows/deploy-owner-portal-html-hotfix.yml',
  '.github/workflows/fix-owner-portal-release-readiness.yml',
  '.github/workflows/run-owner-portal-release-readiness-acceptance.yml',
  '.github/workflows/commercial-google-native-beta.yml',
  '.github/workflows/deploy-northern-lakes-commercial-office.yml',
  '.github/workflows/install-clean-business-office.yml',
  '.github/workflows/deploy-clean-business-office.yml',
  '.github/workflows/business-office-clean-installation.yml',
  '.github/workflows/quote-mobile-native-live.yml'
];

for(const file of retired){
  const source=read(file);
  const executable=source.split(/\r?\n/).filter(line=>!line.trimStart().startsWith('#')).join('\n');
  check(/if:\s*\$\{\{\s*false\s*\}\}/.test(source),`${file} is not permanently skipped.`);
  check(!/^\s*push\s*:/m.test(executable),`${file} still has a push trigger.`);
  check(!/^\s*pull_request\s*:/m.test(executable),`${file} still has a pull-request trigger.`);
  check(!/^\s*workflow_run\s*:/m.test(executable),`${file} still has a workflow-run trigger.`);
  check(!/\bclasp\s+(push|update-deployment|create-deployment|create-version|undeploy)\b/.test(executable),`${file} contains an executable Apps Script deployment command.`);
  check(!/script\.google\.com\/macros\/s\//.test(executable),`${file} contains an executable legacy Office URL.`);
  check(!/script\.googleapis\.com\/v1\/scripts/.test(executable),`${file} contains an executable Apps Script API call.`);
}

const config=read('commercial-app/supabase-config.js');
const launcher=read('open-business-office.html');
const northernLakes=read('businesses/northern-lakes/app-deployment.json');
check(config.includes('legacyOfficeEnabled: false'),'Browser config does not disable the legacy Office.');
check(!config.includes('fallbackUrl'),'Browser config still contains a fallback URL.');
check(launcher.includes('Supabase is the only supported Office runtime.'),'Launcher is not explicitly Supabase-only.');
check(!fs.existsSync(path.join(root,'legacy-business-office.html')),'Legacy Office route still exists.');
check(/"legacyOfficeEnabled"\s*:\s*false/.test(northernLakes),'Northern Lakes legacy Office is not disabled.');
check(/"legacyOfficeFallback"\s*:\s*false/.test(northernLakes),'Northern Lakes legacy fallback is not disabled.');

const result={
  status:failures.length?'FAIL':'PASS',
  checkedWorkflows:retired.length,
  automaticLegacyDeployments:false,
  manualLegacyDeployments:false,
  legacyOfficeRoute:false,
  supportedRuntime:'supabase',
  failures
};
console.log(JSON.stringify(result,null,2));
if(failures.length)process.exit(1);
