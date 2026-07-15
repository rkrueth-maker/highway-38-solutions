#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const cp=require('child_process');
const root=path.resolve(__dirname,'..');
const failures=[]; const passes=[];
function check(name,condition,detail=''){(condition?passes:failures).push({name,detail});console.log(`${condition?'PASS':'FAIL'}: ${name}${detail?' — '+detail:''}`);}
function read(p){return fs.readFileSync(path.join(root,p),'utf8');}
const neutralRoots=['packages/business-office-core','packages/authentication','packages/document-intake','packages/accounting','packages/payroll-preparation','packages/shared-ui','apps/business-office'];
let neutral='';
for(const start of neutralRoots){
  const stack=[path.join(root,start)];
  while(stack.length){const p=stack.pop();for(const n of fs.readdirSync(p)){const f=path.join(p,n);if(fs.statSync(f).isDirectory())stack.push(f);else neutral+=fs.readFileSync(f,'utf8')+'\n';}}
}
check('neutral core contains no Highway 38 identity',!/Highway\s*38|rkrueth|highway-38-solutions/i.test(neutral));
check('neutral core contains no H38 identifiers',!(/\bH38(?:_|\b)/.test(neutral)));
check('neutral core contains no live resource IDs',!/[A-Za-z0-9_-]{25,}/.test(neutral.match(/(?:SPREADSHEET|FOLDER|DEPLOYMENT)[^\n]{0,80}/gi)?.join('\n')||''));
const h38=JSON.parse(read('business-packs/highway38/business-office.config.json'));
const template=JSON.parse(read('business-packs/template-business/business-office.config.json'));
check('Highway 38 pack carries Highway 38 identity',h38.business.id==='H38'&&/Highway 38/.test(h38.branding.businessName));
check('Highway 38 pack uses property references rather than embedded resource IDs',Object.values(h38.resources.propertyKeys).every(v=>/^[A-Z0-9_]+$/.test(v)));
check('template pack is neutral',!/Highway\s*38|rkrueth|highway-38-solutions|H38_/i.test(JSON.stringify(template)));
check('template pack has empty catalog',template.catalog.mode==='empty'&&template.validation.expectedProductCount===0&&template.validation.expectedBundleCount===0);
check('template pack retains safety boundaries',template.tax.directFiling===false);
for(const [pack,mode] of [['highway38','combined'],['template-business','standalone']]){
  const out=path.join(root,'artifacts','business-office-separation','builds',`${pack}-${mode}`);
  cp.execFileSync(process.execPath,[path.join(root,'scripts/build-business-office-installation.js'),'--pack',pack,'--mode',mode,'--out',out],{stdio:'inherit'});
  check(`${pack} ${mode} bundle generated`,fs.existsSync(path.join(out,'installation-manifest.json')));
  const all=fs.readdirSync(out).filter(n=>/\.(gs|html|json)$/.test(n)).map(n=>fs.readFileSync(path.join(out,n),'utf8')).join('\n');
  if(pack==='template-business') check('clean bundle has no Highway 38 leakage',!/Highway\s*38|rkrueth|highway-38-solutions|H38_|AKfyc/i.test(all));
}
const result={status:failures.length?'HOLD':'PASS',passes,failures};
const outDir=path.join(root,'artifacts','business-office-separation');fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(path.join(outDir,'separation-verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(`RESULT: ${result.status}`);process.exit(failures.length?1:0);
