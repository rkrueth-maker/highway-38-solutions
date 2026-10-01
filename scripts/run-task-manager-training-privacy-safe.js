'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const sourcePath=path.join(__dirname,'record-task-manager-training.js');
const original=fs.readFileSync(sourcePath,'utf8');
let patched=original;
function replaceOnce(from,to,label){
  const next=patched.replace(from,to);
  if(next===patched)throw Error('Task Manager privacy-safe source drift: '+label);
  patched=next;
}

replaceOnce(
  `  result.employee=employee;`,
  `  result.employee={userId:employee.userId,name:'Staff employee',role:employee.role};`,
  'artifact employee identity redaction'
);
replaceOnce(
  'Active Staff employee ${employee.name} is not available in the Task Manager assignment list.',
  'The selected Staff employee is not available in the Task Manager assignment list.',
  'private employee name in assignment error'
);
replaceOnce(
  '3. Choose ${employee.name}, enter the work, set the due time, then save the task.',
  '3. Choose the Staff employee, enter the work, set the due time, then save the task.',
  'private employee name in assignment caption'
);
const oldBlock=`  await openPage(page,'work');\n  const row=page.locator('.row').filter({hasText:taskTitle}).first();\n  await row.waitFor({state:'visible',timeout:15000});`;
const newBlock=`  await openPage(page,'work');\n  const safeTaskId=String(task.taskId||'').replace(/"/g,'\\\\"');\n  const taskButton=page.locator(\`[data-task-id="\${safeTaskId}"]\`).first();\n  await taskButton.waitFor({state:'visible',timeout:15000});\n  const row=taskButton.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " row ")][1]');\n  await row.waitFor({state:'visible',timeout:15000});`;
replaceOnce(oldBlock,newBlock,'canonical visible task row');
replaceOnce(
  `  const rowText=clean(await row.innerText());\n  if(!rowText.includes(employee.name))throw Error('Task Manager list did not visibly confirm the assigned employee.');`,
  `  const rowText=clean(await row.innerText());\n  const assignmentProof=await page.evaluate(([taskId,userId])=>{\n    const item=(window.state?.snapshot?.tasks||[]).find(row=>String(row?.['Task ID']||row?.taskId||'')===String(taskId));\n    return{present:Boolean(item),assignedUserId:String(item?.['Assigned User ID']||item?.assignedUserId||'')};\n  },[task.taskId,employee.userId]);\n  if(!rowText||!assignmentProof.present||assignmentProof.assignedUserId!==employee.userId)throw Error('Visible Task Manager row did not retain the selected Staff assignment.');`,
  'canonical assignment proof without private display name'
);
replaceOnce(
  '4. Confirm the task appears in Task Manager assigned to ${employee.name}.',
  '4. Confirm the task appears in Task Manager assigned to the selected Staff employee.',
  'private employee name in confirmation caption'
);

try{
  fs.writeFileSync(sourcePath,patched);
  const run=spawnSync(process.execPath,[sourcePath],{stdio:'inherit',env:process.env});
  process.exitCode=run.status===null?1:run.status;
}finally{
  fs.writeFileSync(sourcePath,original);
}
