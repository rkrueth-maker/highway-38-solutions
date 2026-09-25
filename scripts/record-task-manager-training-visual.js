'use strict';
/* Training-only privacy and framing wrapper for the real Task Manager recorder. */
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
  "name:(()=>{const value=String(staff['Display Name']||staff.displayName||'Staff employee');return /@/.test(value)?'Staff employee':value;})(),",
  'safe Staff display name'
);

replaceOnce(
  '    input:focus,textarea:focus,select:focus,button:focus{outline:4px solid #ffbf47!important;outline-offset:3px!important}',
  '    select[name="assignedUserId"]{filter:blur(7px)!important;user-select:none!important}\\n    @media(min-width:900px){#mainContent{max-width:1180px!important;margin-left:auto!important;margin-right:auto!important}.row,.card,.panel{font-size:1.02em}}\\n    input:focus,textarea:focus,select:focus,button:focus{outline:4px solid #ffbf47!important;outline-offset:3px!important}',
  'assignment selector privacy and desktop framing'
);

replaceOnce(
  "async function caption(page,text,ms=1300){\n  await page.evaluate(value=>{",
  "async function caption(page,text,ms=1300){\n  await maskAssignedSelect(page).catch(()=>0);\n  await page.evaluate(()=>{const re=/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i;for(const el of document.querySelectorAll('#mainContent *')){const text=String(el.innerText||'').trim();if(!text||text.length>160||!re.test(text)||!el.getClientRects().length)continue;const childHasEmail=Array.from(el.children||[]).some(child=>re.test(String(child.innerText||'')));if(!childHasEmail)el.style.filter='blur(7px)';}}).catch(()=>{});\n  await page.evaluate(value=>{",
  'visible email redaction before captions'
);

const maskHelpers=`async function clearAssigneeMask(page){
  await page.evaluate(()=>{document.querySelectorAll('[data-h38-training-assignee-mask]').forEach(node=>node.remove())}).catch(()=>{});
}
async function maskAssignedSelect(page){
  await clearAssigneeMask(page);
  return await page.evaluate(()=>{
    const emailRe=/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i;
    const selects=Array.from(document.querySelectorAll('select')).filter(select=>{
      const chosen=String(select.selectedOptions?.[0]?.textContent||select.value||'');
      return select.getClientRects().length&&emailRe.test(chosen);
    });
    let count=0;
    for(const select of selects){
      const rect=select.getBoundingClientRect(),style=getComputedStyle(select);
      if(rect.width<2||rect.height<2)continue;
      const mask=document.createElement('div');
      mask.setAttribute('data-h38-training-assignee-mask','true');
      mask.textContent='Staff employee';
      Object.assign(mask.style,{
        position:'fixed',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',
        zIndex:'2147483646',boxSizing:'border-box',display:'flex',alignItems:'center',padding:'0 30px 0 10px',
        overflow:'hidden',whiteSpace:'nowrap',background:style.backgroundColor||'#fff',color:style.color||'#111',
        border:style.border||'1px solid #bbb',borderRadius:style.borderRadius||'6px',font:style.font||'14px system-ui',
        pointerEvents:'none'
      });
      document.body.appendChild(mask);
      count++;
    }
    return count;
  });
}
`;
replaceOnce(
  'async function trainingIdentity(page){',
  maskHelpers+'async function trainingIdentity(page){',
  'assignment visual-mask helpers'
);

replaceOnce(
  '  await assigned.selectOption(employee.userId);',
  "  await assigned.selectOption(employee.userId);\n  if(!await maskAssignedSelect(page))throw Error('Task Manager training could not mask the Staff assignment selector.');",
  'mask selected Staff assignment'
);

replaceOnce(
  "  const saveTaskForm=await openCreation(page,'taskForm','Assign task');",
  "  await clearAssigneeMask(page);\n  const saveTaskForm=await openCreation(page,'taskForm','Assign task');\n  if(!await maskAssignedSelect(page))throw Error('Task Manager training could not remask the refreshed Staff assignment selector.');",
  'remask refreshed Staff assignment'
);

replaceOnce(
  "  await sync(page);\n\n  await openPage(page,'work');",
  "  await sync(page);\n  await clearAssigneeMask(page);\n\n  await openPage(page,'work');",
  'clear assignment mask before navigation'
);

replaceOnce(
  "  if(!rowText.includes(employee.name))throw Error('Task Manager list did not visibly confirm the assigned employee.');",
  "  if(!rowText.includes(taskTitle))throw Error('Task Manager list did not visibly confirm the saved TEST assignment.');",
  'privacy-safe owner confirmation'
);

replaceOnce(
  "  result.steps.push({name:'task-assigned',status:'PASS',taskId:task.taskId,assignedUserId:employee.userId,status:task.status});",
  "  result.steps.push({name:'task-assigned',status:'PASS',taskId:task.taskId,assignedUserId:employee.userId,taskStatus:task.status});",
  'preserve proof PASS separately from task status'
);

replaceOnce(
  "viewport:mobile?{width:430,height:860}:{width:1420,height:900},recordVideo:{dir:out,size:mobile?{width:430,height:860}:{width:1420,height:900}}",
  "viewport:mobile?{width:430,height:860}:{width:1280,height:820},recordVideo:{dir:out,size:mobile?{width:430,height:860}:{width:1280,height:820}}",
  'compact desktop training viewport'
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
