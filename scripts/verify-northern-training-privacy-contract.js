'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const v2=fs.readFileSync(path.join(root,'scripts','run-northern-narrated-training-v2.js'),'utf8');
const v3=fs.readFileSync(path.join(root,'scripts','run-northern-narrated-training-v3.js'),'utf8');
const workflow=fs.readFileSync(path.join(root,'.github','workflows','northern-narrated-training.yml'),'utf8');

new Function(v2);
new Function(v3);

assert.match(v2,/scrubTrainingPrivacy/,'v2 must keep the full-shell privacy scrubber');
assert.match(v2,/privateLeakCount/,'v2 must keep the visible privacy leak gate');
assert.match(v2,/__nlTrainingPrivacyObserver/,'v2 must keep the asynchronous privacy observer');
assert.match(v3,/workingForAnchor/,'v3 must explicitly own Working for privacy');
assert.match(v3,/workingForMask/,'v3 must inject the Working for mask');
assert.match(v3,/Private customer \/ property/,'Working for masking must use a clearly private replacement');
assert.ok(v3.includes('/^working for\\\\b/i')||v3.includes('/^working for\\b/i'),'Working for matching must be explicit rather than a broad text replacement');
assert.match(v3,/privacySafe/,'training fixtures and tenant branding must remain distinguishable from private customer data');
assert.match(v3,/Northern Lakes/,'tenant branding must remain visible while customer/property values are masked');
assert.match(v3,/Training privacy gate found/,'per-step privacy gate must remain fail-closed');
assert.match(v3,/Northern training found H38 assistant branding/,'Northern video gate must reject H38 assistant branding drift');
assert.match(v3,/root=document\.body/,'privacy scrub must cover the visible shell, not only main content');
assert.match(v3,/20260927-v15/,'recorder privacy build must be current');
assert.match(workflow,/run-northern-narrated-training-v3\.js/,'workflow must use the hardened v3 recorder');
assert.match(workflow,/externalActionsOccurred!==false/,'workflow must reject any external action during training');
assert.match(workflow,/recording_authorized/,'recording must remain explicitly controlled');

console.log(JSON.stringify({
  status:'PASS',
  fullShellPrivacy:true,
  workingForMasked:true,
  asyncObserver:true,
  visibleLeakGate:true,
  tenantBrandDriftGate:true,
  externalActionsRequiredFalse:true
},null,2));
