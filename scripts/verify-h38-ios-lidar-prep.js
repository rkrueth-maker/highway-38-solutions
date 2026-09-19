'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const project=read('native/h38-site-scanner/ios-app/project.yml');
const app=read('native/h38-site-scanner/ios-app/H38SiteScannerIOS/H38SiteScannerIOSApp.swift');
const web=read('native/h38-site-scanner/ios-app/H38SiteScannerIOS/H38WebViewController.swift');
const room=read('native/h38-site-scanner/ios-app/H38SiteScannerIOS/H38RoomScannerViewController.swift');
const bridge=read('native/h38-site-scanner/ios/H38SiteScannerBridge.swift');
const guard=read('commercial-app/native-office-launch-guard.js');
const scanner=read('commercial-app/site-scanner.js');

function check(condition,message){if(!condition)throw new Error(message);}

check(/deploymentTarget:\s*"16\.0"/.test(project),'iOS app must retain iOS 16 deployment floor for RoomPlan.');
check(/PRODUCT_BUNDLE_IDENTIFIER:\s*com\.highway38\.sitescanner/.test(project),'iOS bundle id drifted.');
check(/H38WebViewController/.test(app),'SwiftUI app must launch the Business Office WebView shell.');
check(/https:\/\/highway38solutions\.com\/commercial-app\//.test(web),'iOS app must load the production Business Office.');
check(/H38SiteScannerIOS\/0\.1\.0/.test(web),'iOS native user-agent marker is required.');
check(/window\.H38NativeHost/.test(web),'iOS app must expose the cross-platform native readiness host.');
check(/window\.H38NativeScanner/.test(web),'iOS app must expose the shared native scanner bridge.');
check(/requestMediaCapturePermissionFor/.test(web)&&/isTrustedH38Host/.test(web),'WebKit media capture must be origin-gated.');
check(/RoomCaptureSession\.isSupported/.test(room),'RoomPlan must be runtime-gated on LiDAR support.');
check(/RoomCaptureView/.test(room),'iOS native scan must use the RoomPlan capture UI.');
check(/captureView\(\s*didPresent/.test(room),'RoomPlan processed output must return through the native bridge.');
check(/"source": "LIDAR_ROOM"/.test(bridge),'LiDAR measurements must preserve LIDAR_ROOM provenance.');
check(/"verificationStatus": "DEVICE_CAPTURED"/.test(bridge),'LiDAR must never self-promote to field-verified.');
check(/ROOMPLAN_XZ/.test(bridge)&&/"startPoint"/.test(bridge)&&/"endPoint"/.test(bridge),'LiDAR widths must include usable 2D endpoints.');
check(/"fallback": "CAMERA_GUIDED"/.test(bridge),'Non-LiDAR Apple devices must retain camera-guided fallback.');
check(/H38SiteScanner\(\?:Android\|IOS\)/.test(guard),'Native readiness guard must recognize both Android and iOS shells.');
check(/H38NativeHost/.test(guard)&&/AndroidH38Native/.test(guard),'Readiness guard must preserve Android while accepting the iOS host.');
check(/capabilities\?\.lidar \|\| capabilities\?\.roomPlan/.test(scanner),'Web scanner must prefer LiDAR when native Apple capabilities report it.');
check(!/service[_-]?role/i.test(web+room+bridge),'Native iOS client must not contain a service-role key.');

console.log('PASS H38 iOS prep: LiDAR-first RoomPlan shell, shared readiness contract, camera-guided fallback, and device-captured provenance.');
