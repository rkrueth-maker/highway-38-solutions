'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const sourcePath=path.join(__dirname,'record-full-office-lifecycle-training.js');
const runnerPath=path.join(__dirname,'run-lifecycle-quote-refresh-diagnostic.js');
const original=fs.readFileSync(sourcePath,'utf8');
const oldBlock=`  await page.waitForFunction(name=>Array.from(document.querySelectorAll('[data-h38-customer-card]')).some(n=>n.textContent.includes(name)),customerName,{timeout:15000});\n  result.steps.push({name:'customer-created',status:'PASS',at:now()});\n  await caption(page,'Customer saved. Customer 360 keeps the entire job history together.');\n\n  const card=page.locator('[data-h38-customer-card]').filter({hasText:customerName}).first();\n  const createdCustomerId=String(await card.getAttribute('data-h38-customer-card')||'');\n  if(!createdCustomerId)throw Error('Created TEST customer card did not expose its canonical customer ID.');\n  await card.click();`;
const newBlock=`  const createdCustomerId=String(await page.waitForFunction(name=>{\n    const row=(window.state?.snapshot?.customers||[]).find(item=>String(item?.['Customer Name']||item?.customerName||item?.name||'')===String(name));\n    return row?String(row?.['Customer ID']||row?.customerId||row?.id||''):'';\n  },customerName,{timeout:15000}).then(handle=>handle.jsonValue())||'');\n  if(!createdCustomerId)throw Error('Created TEST customer did not expose its canonical customer ID in the snapshot.');\n  result.steps.push({name:'customer-created',status:'PASS',customerId:createdCustomerId,at:now()});\n  await caption(page,'Customer saved. Customer 360 keeps the entire job history together.');\n\n  const safeCustomerId=createdCustomerId.replace(/"/g,'\\\\"');\n  const card=page.locator(\`[data-h38-customer-card="\${safeCustomerId}"]\`).first();\n  await card.waitFor({state:'visible',timeout:15000});\n  await card.click();`;
if(!original.includes(oldBlock))throw Error('Lifecycle customer selector source drifted; privacy-safe patch refused.');
try{
  fs.writeFileSync(sourcePath,original.replace(oldBlock,newBlock));
  const run=spawnSync(process.execPath,[runnerPath],{stdio:'inherit',env:process.env});
  process.exitCode=run.status===null?1:run.status;
}finally{
  fs.writeFileSync(sourcePath,original);
}
