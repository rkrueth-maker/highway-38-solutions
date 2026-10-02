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
      return select.getClientRects().length&&(select.name==='assignedUserId'||emailRe.test(chosen));
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


// Keep underlying TEST record values and stable IDs for persistence proof. Only
// their training presentation is redacted, before the next recorded paint.
const presentation=String.raw`async function installTrainingPresentation(page){
  await page.addInitScript(()=>{
    const safe=value=>String(value||'')
      .replace(/TEST Task Training Job [\w-]+/gi,'Equipment preparation')
      .replace(/TEST Assigned Work [\w-]+/gi,'Prepare equipment')
      .replace(/Pine Ridge Assigned Work [\w-]+/gi,'Prepare equipment')
      .replace(/\bTEST\b/gi,'Training')
      .replace(/\b(?:LOCAL|TEST|JOB|TASK|USER|CUST)-[A-Z0-9_-]+\b/gi,'Record')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,'Record')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'Staff employee');
    const apply=()=>{
      if(!document.body)return;
      const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()){
        const n=walker.currentNode;
        if(n.parentElement?.closest('script,style,[data-h38-training-value-mask]'))continue;
        const clean=safe(n.nodeValue);if(clean!==n.nodeValue)n.nodeValue=clean;
      }
      const caption=document.getElementById('h38TrainingCaption');
      if(caption?.textContent?.startsWith('Choose an employee')){const form=document.getElementById('taskForm');if(!form?.getClientRects().length)caption.remove();}
      document.querySelectorAll('[data-h38-training-value-mask]').forEach(n=>n.remove());
      for(const input of document.querySelectorAll('#mainContent input:not([type="password"]),#mainContent textarea')){
        const clean=safe(input.value),r=input.getBoundingClientRect();
        if(clean===input.value||!r.width||!r.height)continue;
        input.style.color='transparent';input.style.caretColor='transparent';
        const mask=document.createElement('span');mask.dataset.h38TrainingValueMask='1';mask.textContent=clean;
        Object.assign(mask.style,{position:'fixed',left:(r.left+10)+'px',top:(r.top+2)+'px',width:(r.width-20)+'px',height:(r.height-4)+'px',display:'flex',alignItems:'center',background:'#fff',color:'#17212b',font:getComputedStyle(input).font,pointerEvents:'none',zIndex:'2147483645',overflow:'hidden',whiteSpace:'nowrap'});
        document.body.appendChild(mask);
      }
    };
    let scheduled=false;
    const queue=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;observer.disconnect();apply();observer.observe(document.body,{childList:true,subtree:true,characterData:true});});};
    const observer=new MutationObserver(queue);
    document.addEventListener('DOMContentLoaded',()=>{apply();observer.observe(document.body,{childList:true,subtree:true,characterData:true});});
    document.addEventListener('input',queue,true);document.addEventListener('change',queue,true);
    document.addEventListener('scroll',queue,true);window.addEventListener('resize',queue);
  });
}
`;
replaceOnce('async function ready(page){',presentation+'async function ready(page){\n  await installTrainingPresentation(page);','training presentation before capture');
replaceOnce("  const row=page.locator('.row').filter({hasText:taskTitle}).first();","  const row=page.locator('[data-task-id]').filter({has:page.locator(`[data-task-id=\"${task.taskId}\"]`)}).first();",'stable row identity');
// The control itself is the stable authority, not a label altered for privacy.
src=src.replace("  const row=page.locator('[data-task-id]').filter({has:page.locator(`[data-task-id=\"${task.taskId}\"]`)}).first();","  const row=page.locator(`[data-task-id=\"${task.taskId}\"]`).first().locator('xpath=ancestor::*[contains(concat(\" \", normalize-space(@class), \" \"), \" row \")][1]');");
replaceOnce("  if(!rowText.includes(taskTitle))throw Error('Task Manager list did not visibly confirm the saved TEST assignment.');","  if(!rowText)throw Error('Task Manager assignment row is not visible.');\n  const persisted=await page.evaluate(id=>(window.state?.snapshot?.tasks||[]).find(r=>String(r['Task ID']||r.taskId||'')===id),task.taskId);\n  if(!persisted||String(persisted['Assigned User ID']||'')!==employee.userId||String(persisted['Task Title']||'')!==taskTitle)throw Error('Visible assignment did not retain its persisted employee and work.');",'redacted visible row proof');
replaceOnce('  result.employee=employee;',"  result.employee={userId:employee.userId,name:'Staff employee',role:employee.role};",'artifact employee privacy');
const conciseCaptions=[
  ['TRAINING: Task Manager assigns internal work. No customer message, purchase, payment, or outside action occurs.','Task Manager assigns internal work.'],
  ['1. Open Jobs / Work. Task Manager uses the same H38 Office records as the rest of the job.','Open Jobs / Work.'],
  ['2. Create or choose the job that needs employee work.','Choose the job.'],
  ['3. Choose ${employee.name}, enter the work, set the due time, then save the task.','Choose an employee, enter work and due time, then save.'],
  ['4. Confirm the task appears in Task Manager assigned to ${employee.name}.','Review the saved assignment.'],
  ['The employee signs into the same H38 Office and can update only assigned work through the bounded Staff workflow: Accepted, Started, Waiting/Blocked, or Completed.','Employees update assigned work as it progresses.']
];
for(const [from,to] of conciseCaptions)replaceOnce(from,to,'short operator caption');
replaceOnce('  await page.waitForTimeout(ms);\n}',"  await page.waitForTimeout(ms);\n  await page.evaluate(()=>document.getElementById('h38TrainingCaption')?.remove());\n}",'clear finished caption');
replaceOnce("  await caption(page,`Choose an employee, enter work and due time, then save.`,1700);\n",'', 'caption follows the refreshed form');
replaceOnce(
  "  await saveTaskButton.waitFor({state:'visible',timeout:10000});\n  await saveTaskButton.click();",
  "  await page.evaluate(()=>{const form=Array.from(document.querySelectorAll('#taskForm')).filter(node=>node.getClientRects().length).pop();if(!form)throw Error('Task Manager training could not reacquire the visible task form before save.');form.scrollIntoView({block:'center',inline:'nearest'});});\n  await caption(page,'Choose an employee, enter work and due time, then save.',1700);\n  const finalTaskForm=await openCreation(page,'taskForm','Assign task');\n  const finalDraft=await finalTaskForm.evaluate(form=>({jobId:String(form.querySelector('[name=\\\"jobId\\\"]')?.value||''),taskTitle:String(form.querySelector('[name=\\\"taskTitle\\\"]')?.value||''),assignedUserId:String(form.querySelector('[name=\\\"assignedUserId\\\"]')?.value||''),dueTime:String(form.querySelector('[name=\\\"dueTime\\\"]')?.value||'')}));\n  if(finalDraft.jobId!==jobId||finalDraft.taskTitle!==taskTitle||finalDraft.assignedUserId!==employee.userId||finalDraft.dueTime!==dueLocal)throw Error('Task Manager draft changed while the assignment caption was visible.');\n  const finalSaveTaskButton=finalTaskForm.getByRole('button',{name:'Save task',exact:true});\n  await finalSaveTaskButton.waitFor({state:'visible',timeout:10000});\n  await finalSaveTaskButton.click();",
  'reacquire current form after assignment caption'
);
if(process.env.H38_TASK_TRAINING_VALIDATE_RUNTIME_ONLY==='1'){
  const arrow=presentation.match(/const safe=(value=>[\s\S]*?);/)[1];
  const sanitize=Function('return '+arrow)();
  if(sanitize('TEST Assigned Work 51131908-PHONE')!=='Prepare equipment'||sanitize('LOCAL-1790905320657').includes('179090')||sanitize('training.user@example.com')!=='Staff employee')throw Error('Training display redaction failed.');
  fs.writeFileSync(tempPath,src);
  const checked=spawnSync(process.execPath,['--check',tempPath],{stdio:'inherit'});
  fs.rmSync(tempPath,{force:true});
  if(checked.status!==0)throw Error('Generated Task Manager privacy runtime is invalid.');
  console.log(JSON.stringify({status:'PASS',generatedRuntimeSyntax:true,shortCaptions:true,displayRedaction:true}));
  process.exit(0);
}
fs.writeFileSync(tempPath,src);
let status=2;
try{
  const run=spawnSync(process.execPath,[tempPath],{stdio:'inherit',env:process.env});
  status=run.status==null?2:run.status;
}finally{
  try{fs.rmSync(tempPath,{force:true});}catch(_){}
}
process.exit(status);