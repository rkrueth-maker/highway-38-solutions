#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');
const ROOT=path.resolve(__dirname,'..');
const pages=['ecosystem-status.html','customer-portal.html','business-concept-builder.html','tool-center.html','proof-center.html'];
const pass=[];const failures=[];
function check(name,condition,detail=''){(condition?pass:failures).push({name,detail});}
function read(rel){return fs.readFileSync(path.join(ROOT,rel),'utf8');}

for(const rel of pages){
  const full=path.join(ROOT,rel);check(`${rel} exists`,fs.existsSync(full));if(!fs.existsSync(full))continue;
  const html=read(rel);
  check(`${rel} title`,/<title>[^<]+<\/title>/i.test(html));
  check(`${rel} viewport`,/<meta[^>]+name=["']viewport["']/i.test(html));
  check(`${rel} mobile CSS`,/@media\s*\(/.test(html));
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
  scripts.forEach((src,i)=>{try{new vm.Script(src,{filename:`${rel}:inline-${i+1}`});pass.push({name:`${rel} inline script ${i+1} syntax`,detail:''});}catch(error){failures.push({name:`${rel} inline script ${i+1} syntax`,detail:error.message});}});
  for(const match of html.matchAll(/href=["']([^"']+)["']/gi)){
    const href=match[1];
    if(/^(?:https?:|mailto:|tel:|#|javascript:)/i.test(href))continue;
    const target=href.split('#')[0].split('?')[0];if(!target)continue;
    check(`${rel} local link ${target}`,fs.existsSync(path.join(ROOT,target)),target);
  }
}

const customer=read('customer-portal.html');
check('customer workspace local storage',/localStorage\.setItem/.test(customer));
check('customer workspace export',/new Blob/.test(customer)&&/project-brief\.txt/.test(customer));
check('customer workspace no form action',!/<form[^>]+action=/i.test(customer));
check('customer workspace no network submit',!/(fetch\(|XMLHttpRequest|sendBeacon)/.test(customer));
check('customer workspace explicit no-transmit notice',/Nothing entered here is transmitted/i.test(customer));

const builder=read('business-concept-builder.html');
check('concept builder local storage',/localStorage\.setItem/.test(builder));
check('concept builder markdown export',/business-concept\.md/.test(builder));
check('concept builder portable JSON export',/business-concept\.json/.test(builder));
check('concept builder economics',/Gross margin per sale/.test(builder)&&/monthly gross margin/i.test(builder));
check('concept builder no network send',!/(fetch\(|XMLHttpRequest|sendBeacon)/.test(builder));

const tools=read('tool-center.html');
check('four calculators',([...tools.matchAll(/data-tool=/g)]).length===4,String(([...tools.matchAll(/data-tool=/g)]).length));
check('calculator downloads',/new Blob/.test(tools)&&/estimate\.txt/.test(tools));

const proof=JSON.parse(read('launch-control/public-proof-manifest.json'));
check('proof manifest items',Array.isArray(proof.items)&&proof.items.length>=4,String(proof.items?.length));
check('all proof items explicitly public safe',(proof.items||[]).every(x=>x.privacyStatus==='PUBLIC_SAFE'));
for(const item of proof.items||[])check(`proof target ${item.url}`,fs.existsSync(path.join(ROOT,item.url)),item.id);

const status=read('ecosystem-status.html');
for(const label of ['Customer email','Payment collection','Social publishing','Advertising spend','Final delivery','Private proof sources'])check(`status lock ${label}`,status.includes(label));

const result={status:failures.length?'HOLD':'PASS',generatedAt:new Date().toISOString(),passed:pass.length,failed:failures.length,pages,pass,failures};
const outDir=path.join(ROOT,'launch-control','evidence');fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(path.join(outDir,'public-ecosystem-tools.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));process.exit(failures.length?1:0);
