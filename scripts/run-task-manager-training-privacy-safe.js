'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const sourcePath=path.join(__dirname,'record-task-manager-training.js');
const original=fs.readFileSync(sourcePath,'utf8');
const oldBlock=`  await openPage(page,'work');\n  const row=page.locator('.row').filter({hasText:taskTitle}).first();\n  await row.waitFor({state:'visible',timeout:15000});`;
const newBlock=`  await openPage(page,'work');\n  const safeTaskId=String(task.taskId||'').replace(/"/g,'\\\\"');\n  const taskButton=page.locator(\`[data-task-id="\${safeTaskId}"]\`).first();\n  await taskButton.waitFor({state:'visible',timeout:15000});\n  const row=taskButton.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " row ")][1]');\n  await row.waitFor({state:'visible',timeout:15000});`;
if(!original.includes(oldBlock))throw Error('Task Manager visible-title selector source drifted; privacy-safe patch refused.');
try{
  fs.writeFileSync(sourcePath,original.replace(oldBlock,newBlock));
  const run=spawnSync(process.execPath,[sourcePath],{stdio:'inherit',env:process.env});
  process.exitCode=run.status===null?1:run.status;
}finally{
  fs.writeFileSync(sourcePath,original);
}
