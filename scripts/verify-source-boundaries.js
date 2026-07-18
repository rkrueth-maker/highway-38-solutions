#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const fail = message => { throw new Error(`Source-boundary verification failed: ${message}`); };
const requireText = (source, marker, label) => { if (!source.includes(marker)) fail(`${label} is missing ${marker}`); };
const forbidText = (source, marker, label) => { if (source.includes(marker)) fail(`${label} must not reference ${marker}`); };

const productionDeployPath = 'scripts/deploy-unified-owner-portal-web.sh';
const productionDeploy = read(productionDeployPath);
const productionAssembler = read('scripts/assemble-business-office-app.sh');
const reusableInstaller = read('scripts/build-business-office-installation.js');
const protectedWorkflowPath = '.github/workflows/deploy-owner-portal-hard-rule-production.yml';
const protectedWorkflow = read(protectedWorkflowPath);

for (const marker of [
  'apps-script/core-engine/owner-portal-next',
  'apps-script/business-office-sync/BusinessOffice_Sync.gs',
  'scripts/assemble-business-office-app.sh',
  'scripts/build-unified-apps-script-shell.js',
  'business-packs/highway38/apps-script/BusinessOffice_Pack.gs',
  'clasp update-deployment'
]) requireText(productionDeploy, marker, productionDeployPath);

for (const marker of [
  'apps-script/business-office/*.gs',
  'apps-script/business-office/BusinessOffice_*.html',
  'apps-script/business-office/appsscript.json'
]) requireText(productionAssembler, marker, 'scripts/assemble-business-office-app.sh');

for (const marker of [
  'apps/business-office',
  'packages/business-office-core',
  'packages/authentication',
  'packages/document-intake',
  'packages/accounting',
  'packages/payroll-preparation',
  'packages/shared-ui'
]) requireText(reusableInstaller, marker, 'scripts/build-business-office-installation.js');

for (const marker of [
  'apps/business-office',
  'packages/business-office-core',
  'packages/authentication',
  'packages/document-intake',
  'artifacts/business-office-separation',
  'artifacts/separate-business-office-platform',
  'dist/business-office'
]) forbidText(productionDeploy, marker, productionDeployPath);

for (const marker of [
  'apps-script/business-office/',
  'apps-script/core-engine/owner-portal-next/',
  'artifacts/business-office-separation',
  'artifacts/separate-business-office-platform'
]) forbidText(reusableInstaller, marker, 'scripts/build-business-office-installation.js');

requireText(protectedWorkflow, `run: bash ${productionDeployPath}`, protectedWorkflowPath);
forbidText(protectedWorkflow, 'clasp create-script', protectedWorkflowPath);
forbidText(protectedWorkflow, 'clasp create-deployment', protectedWorkflowPath);

const workflowDir = path.join(root, '.github', 'workflows');
const deployExecutionPattern = new RegExp(`^\\s*run:\\s+bash\\s+${productionDeployPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm');
const deployingWorkflows = fs.readdirSync(workflowDir)
  .filter(name => /\.ya?ml$/i.test(name))
  .filter(name => deployExecutionPattern.test(read(path.join('.github', 'workflows', name))));
if (deployingWorkflows.length !== 1 || deployingWorkflows[0] !== 'deploy-owner-portal-hard-rule-production.yml') {
  fail(`expected one workflow to execute ${productionDeployPath}; found ${deployingWorkflows.join(', ') || 'none'}`);
}

const generatedRoots = [
  'artifacts/business-office-separation/builds',
  'artifacts/separate-business-office-platform/builds',
  'dist/business-office'
];
for (const generatedRoot of generatedRoots) {
  forbidText(productionDeploy, generatedRoot, productionDeployPath);
  forbidText(productionAssembler, generatedRoot, 'scripts/assemble-business-office-app.sh');
}

const result = {
  status: 'PASS',
  productionSources: [
    'apps-script/core-engine/owner-portal-next',
    'apps-script/business-office',
    'apps-script/business-office-sync',
    'apps-script/unified-shell',
    'business-packs/highway38'
  ],
  reusableInstallerSources: [
    'packages',
    'apps/business-office',
    'business-packs'
  ],
  generatedArtifactsAreDeploymentInputs: false,
  productionWorkflow: deployingWorkflows[0],
  externalActionsEnabled: false
};

const evidenceDir = path.join(root, 'artifacts', 'source-boundaries');
fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(path.join(evidenceDir, 'verification.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
