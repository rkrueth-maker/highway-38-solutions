'use strict';
/* Training-only privacy wrapper for the real Task Manager recorder. */
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const sourcePath=path.join(__dirname,'record-task-manager-training.js');
const tempPath=path.join(__dirname,'.visual-record-task-manager-training.js');
let src=fs.readFileSync(sourcePath,'utf8');

function replaceOnce(from,to,label){
  const next=src.replace(from,to);
  if(next===src)throw new Error('Task Manager visual privacy source drift: '+label);
  src=next;
}

replaceOnce(
  "name:String(staff['Display Name']||staff.displayName||staff.Email||staff.email||'Staff employee'),",
  "name:String(staff['Display Name']||staff.displayName||'Staff employee'),",
  'safe Staff display name'
);

replaceOnce(
  '    input:focus,textarea:focus,select:focus,button:focus{outline:4px solid #ffbf47!important;outline-offset:3px!important}',
  '    select[name="assignedUserId"]{filter:blur(7px)!important;user-select:none!important}\\n    input:focus,textarea:focus,select:focus,button:focus{outline:4px solid #ffbf47!important;outline-offset:3px!important}',
  'assignment selector privacy'
);

replaceOnce(
  "async function caption(page,text,ms=1300){\n  await page.evaluate(value=>{",
  "async function caption(page,text,ms=1300){\n  await page.evaluate(()=>{const re=/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i;for(const el of document.querySelectorAll('#mainContent *')){const text=String(el.innerText||'').trim();if(!text||text.length>160||!re.test(text)||!el.getClientRects().length)continue;const childHasEmail=Array.from(el.children||[]).some(child=>re.test(String(child.innerText||'')));if(!childHasEmail)el.style.filter='blur(7px)';}}).catch(()=>{});\n  await page.evaluate(value=>{",
  'visible email redaction before captions'
);

replaceOnce(
  "  if(!rowText.includes(employee.name))throw Error('Task Manager list did not visibly confirm the assigned employee.');",
  "  if(!rowText.includes(taskTitle))throw Error('Task Manager list did not visibly confirm the saved TEST assignment.');",
  'privacy-safe owner confirmation'
);

fs.writeFileSync(tempPath,src);
let status=2;
try{
  const run=spawnSync(process.execPath,[tempPath],{stdio:'inherit',env:process.env});
  status=run.status==null?2:run.status;
}finally{
  try{fs.rmSync(tempPath,{force:true});}catch(_){}
}
process.exit(status);
