#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const need=(text,marker,label)=>{if(!text.includes(marker))throw new Error(`Missing ${label}: ${marker}`)};
const reject=(text,marker,label)=>{if(text.includes(marker))throw new Error(`Forbidden ${label}: ${marker}`)};
const scripts=text=>[...text.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);

const index=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Index.html');
const client=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Outdoor_Measure_Client.html');

need(index,"boInclude_('BusinessOffice_QuoteBuilder_Outdoor_Measure_Client')",'Outdoor Measure client include');
if(index.indexOf('BusinessOffice_QuoteBuilder_Outdoor_Measure_Client')<index.indexOf('BusinessOffice_QuoteBuilder_EditExisting_Client'))throw new Error('Outdoor Measure must load after saved-draft editing so report attachment can use the active quote and save path.');
need(client,'H38 Outdoor Measure','integrated module title');
need(client,'Estimate-grade only.','measurement classification');
need(client,'Automatic — try AR, then GPS','automatic capability fallback');
need(client,"navigator.xr.isSessionSupported('immersive-ar')",'WebXR capability detection');
need(client,"requestSession('immersive-ar'",'interactive AR session');
need(client,"requiredFeatures:['hit-test']",'AR hit-test point capture');
need(client,'navigator.geolocation.watchPosition','high-accuracy GPS point capture');
need(client,'navigator.mediaDevices.getUserMedia','live camera guidance');
need(client,'Push to Talk','explicit voice control');
need(client,'window.SpeechRecognition||window.webkitSpeechRecognition','browser speech recognition');
need(client,'mark point, undo, finish, or reset','bounded voice commands');
need(client,'Approximate perimeter','perimeter output');
need(client,'Approximate enclosed area','area output');
need(client,'gpsXY','local GPS coordinate conversion');
need(client,'Math.hypot','segment distance calculation');
need(client,'twiceArea','polygon shoelace calculation');
need(client,'Attach Report & Save Quote','explicit saved-quote attachment');
need(client,"api('saveQuotePhoto'",'existing private quote-document attachment');
need(client,'window.qbSaveExistingQuote','existing saved-draft save path');
need(client,'H38 OUTDOOR MEASURE — ESTIMATE-GRADE FIELD CAPTURE','quote field summary');
need(client,'NOT A SURVEY OR FINAL CONSTRUCTION MEASUREMENT','report warning');
need(client,'Nothing is recorded or uploaded until you start and explicitly attach','no automatic capture or upload boundary');
need(client,'Nothing was sent.','no automatic customer action confirmation');
need(client,'Critical dimensions still require verification.','owner verification boundary');
need(client,'MAX_POINTS=24','bounded point count');
need(client,'dataUrl.length>2800000','bounded report upload');
reject(client,'DeviceMotionEvent','blind phone accelerometer integration');
reject(client,'setInterval(markPoint','automatic point capture');
reject(client,'.click()','programmatic native picker click');

scripts(client).forEach(body=>new Function(body));
console.log('PASS — H38 Outdoor Measure adds live camera guidance, WebXR-or-GPS point capture, push-to-talk commands, estimate-grade perimeter/area math, explicit private quote attachment, saved-draft persistence, and verification warnings without claiming survey or Moasure accuracy.');
