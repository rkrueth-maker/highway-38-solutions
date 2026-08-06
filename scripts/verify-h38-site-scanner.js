'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const must = (content, token, label) => {
  if (!content.includes(token)) throw new Error(`${label} is missing ${token}`);
};
const absent = (content, token, label) => {
  if (content.includes(token)) throw new Error(`${label} must not contain ${token}`);
};

const index = read('commercial-app/index.html');
const scanner = read('commercial-app/site-scanner.js');
const styles = read('commercial-app/site-scanner.css');
const worker = read('commercial-app/service-worker.js');
const migration = read('supabase/migrations/20260806090000_h38_site_scanner_foundation.sql');
const edge = read('supabase/functions/h38-site-scanner/index.ts');
const android = read('native/h38-site-scanner/android/H38SiteScannerBridge.kt');
const ios = read('native/h38-site-scanner/ios/H38SiteScannerBridge.swift');
const nativeReadme = read('native/h38-site-scanner/README.md');

must(index, './site-scanner.css?build=20260806-0344', 'commercial app');
must(index, './site-scanner.js?build=20260806-0344', 'commercial app');
if (index.indexOf('site-scanner.js') < index.indexOf('app-20.js')) {
  throw new Error('Site Scanner must load after the existing Quote Builder and Measure renderers.');
}
must(worker, "'./site-scanner.js'", 'service worker');
must(worker, "'./site-scanner.css'", 'service worker');
must(worker, "'site-scanner.js'", 'live-first asset list');

for (const token of [
  'siteCaptureSessions','siteSpatialEntities','siteMeasurements','siteGeometryOutputs','siteAiReviews',
  'MANUAL_ENTRY','MANUAL_LASER','BLUETOOTH_LASER','ARCORE_DEPTH','ARCORE_POINT_TO_POINT',
  'LIDAR_ROOM','LIDAR_MESH','CAMERA_ESTIMATE','DEVICE_CAPTURED','FIELD_MEASURED',
  'CONFLICT_REVIEW_REQUIRED','NEEDS_REMEASUREMENT','MediaRecorder','SpeechRecognition',
  'h38:native-scan-result','buildGeometry','shoelace','detectConflicts','svgFromGeometry',
  'application/pdf','image/svg+xml','Attach Reviewed Outputs to Draft Quote',
  'Presented or otherwise locked quotes cannot be edited',
  'Nothing was approved or sent'
]) must(scanner, token, 'site-scanner.js');

for (const unsafe of [
  'automaticApproval:true','automaticCustomerSending:true','service_role','SUPABASE_SERVICE_ROLE_KEY'
]) absent(scanner, unsafe, 'browser scanner');

must(styles, '.scanner-layout', 'scanner styles');
must(styles, '@media(max-width:620px)', 'scanner mobile styles');

for (const token of [
  "update storage.buckets","video/webm","image/svg+xml","application/json",
  "'measure'","'H38 Site Scanner'","'on-demand'","'siteCaptureSessions'",
  "'siteMeasurements'","'siteGeometryOutputs'","automatic_approval', false",
  "new_parallel_database_created', false","retired_apps_script_restored', false"
]) must(migration, token, 'scanner migration');
absent(migration, 'create table', 'scanner migration');
absent(migration, 'create database', 'scanner migration');

for (const token of [
  'signedInUser','activeMembership','requireSession','siteCaptureSessions',
  'business_memberships','business_records','business-office-files',
  'OpenAI Responses API','exactDimensionsMayNotBeInvented',
  'SITE_SCANNER_AI_REVIEW_COMPLETED','SITE_SCANNER_AI_REVIEW_FAILED',
  'ownerReviewRequired: true','automaticApproval: false',
  'automaticCustomerSending: false','providerConfigured'
]) must(edge, token, 'scanner Edge Function');
must(edge, 'path.startsWith(`${businessId}/`)', 'tenant storage path check');

for (const token of [
  'com.google.ar.core.Session','Config.DepthMode.AUTOMATIC','DEVICE_CAPTURED',
  'captureSessionId','parallel database'
]) must(android, token, 'Android capture bridge');
for (const token of [
  'import RoomPlan','import ARKit','RoomCaptureSession','LIDAR_ROOM',
  'DEVICE_CAPTURED','captureSessionId'
]) must(ios, token, 'Apple capture bridge');
for (const token of [
  'same H38 Site Scanner','do not create another product','Supabase tenant',
  'not shown as permanently saved'
]) must(nativeReadme, token, 'native bridge contract');

console.log(JSON.stringify({
  status: 'PASS',
  feature: 'H38 Site Scanner',
  databaseAuthority: 'existing Supabase Business Office',
  browserFoundation: true,
  androidCaptureSource: true,
  appleLidarSource: true,
  ownerReviewRequired: true,
  automaticApproval: false,
  automaticCustomerSending: false
}, null, 2));
