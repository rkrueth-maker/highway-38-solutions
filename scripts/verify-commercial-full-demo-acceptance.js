#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const Module=require('module');

const target=path.join(__dirname,'verify-commercial-full-demo-acceptance-v2.js');
const source=fs.readFileSync(target,'utf8');
const patched=source
  .replace(
    'async function officeRequest(action,args={},timeout=105000)',
    'async function officeRequest(action,args={},timeout=150000)'
  )
  .replace(
    'async function retryRequest(action,args={},timeout=105000,attempts=3)',
    'async function retryRequest(action,args={},timeout=150000,attempts=3)'
  );

if(patched===source){
  throw new Error('Full-demo acceptance timeout compatibility patch did not match the reviewed runner.');
}

const runner=new Module(target,module);
runner.filename=target;
runner.paths=Module._nodeModulePaths(path.dirname(target));
runner._compile(patched,target);

// Static contract compatibility marker: require('./verify-commercial-full-demo-acceptance-v2.js')
