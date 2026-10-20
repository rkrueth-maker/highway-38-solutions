function renderWork(){const requests=records('requests'),jobs=records('jobs'),tasks=records('tasks'),customers=records('customers'),users=activeRows(records('users'));const h38JobsHead={page:'work',title:'Jobs',purpose:'Track every job from request to done, and keep each job moving.',primary:{label:'＋ New job',handler:()=>window.H38ChooseCreation?.('work','jobForm')},secondary:[{label:'＋ New request',handler:()=>window.H38ChooseCreation?.('work','requestForm')}],more:[{label:'Assign a task',handler:()=>window.H38ChooseCreation?.('work','taskForm')},{label:'Import / example jobs',page:'settings'}]};$('mainContent').innerHTML=(window.H38Flow?window.H38Flow.screenHeader(h38JobsHead):pageHead('Jobs',h38JobsHead.purpose))+`<div class="grid"><section class="card span4"><h2>New request</h2><form id="requestForm"><label>Customer</label><select name="customerId">${optionRows(customers,['Customer ID'],row=>v(row,'Customer Name'),'Generic or unknown customer')}</select><label>Subject</label><input name="subject" required><label>Details</label><textarea name="details"></textarea><div class="two"><div><label>Source</label><select name="source"><option>Office</option><option>Phone</option><option>Email</option><option>SMS</option><option>Portal</option><option>Field</option></select></div><div><label>Priority</label><select name="priority"><option>Normal</option><option>Low</option><option>High</option><option>Urgent</option></select></div></div><div class="actions"><button>Save request</button></div></form></section><section class="card span4"><h2>New job</h2><form id="jobForm"><label>Customer</label><select name="customerId">${optionRows(customers,['Customer ID'],row=>v(row,'Customer Name'),'No customer')}</select><label>Project title</label><input name="projectTitle" required><label>Status</label><select name="status"><option>Lead</option><option>Quoted</option><option>Approved</option><option>Scheduled</option><option>In Progress</option><option>Complete</option></select><label><input type="checkbox" name="isRecurring" style="width:auto"> Recurring job</label><div id="recurFields" class="hidden"><div class="two"><div><label>Frequency</label><select name="recurFreq"><option value="weekly">Weekly</option><option value="biweekly">Every 2 weeks</option><option value="monthly">Monthly</option></select></div><div><label>Price per visit</label><input name="recurPrice" type="number" min="0" step="0.01"></div></div><div class="two"><div><label>Start date</label><input name="recurStart" type="date"></div><div><label>End date <small>(optional)</small></label><input name="recurEnd" type="date"></div></div><label><input type="checkbox" name="recurAutoInvoice" style="width:auto"> Auto-create draft invoice on completion</label></div><div class="actions"><button>Save job</button></div></form></section><section class="card span4"><h2>Assign task</h2><form id="taskForm"><label>Job</label><select name="jobId">${optionRows(jobs,['Job ID'],row=>`${v(row,'Job Number')} — ${v(row,'Project Title')}`,'No job')}</select><label>Task</label><input name="taskTitle" required><label>Assigned user</label><select name="assignedUserId">${optionRows(users,['User ID'],row=>v(row,'Display Name','Email'),'Unassigned')}</select><label>Due</label><input name="dueTime" type="datetime-local"><div class="actions"><button>Save task</button></div></form></section><section class="card span4"><h2>Requests</h2><div class="list">${requests.length?requests.slice(0,30).map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Subject'))}</strong>${pill(v(row,'Status')||'New')}</div><small>${esc(v(row,'Source'))} · ${esc(v(row,'Priority'))} · ${esc(customerName(v(row,'Customer ID')))}</small></div>`).join(''):empty('No requests.',{label:'+ New request',page:'work'})}</div></section><section class="card span4"><h2>Jobs</h2><div class="list">${jobs.length?jobs.slice(0,40).map(row=>{const st=v(row,'Status');const cust=customerName(v(row,'Customer ID'));return `<div class="row"><div class="row-top"><strong>${esc(v(row,'Project Title'))}</strong>${pill(st)}</div><small>${esc(v(row,'Job Number'))} · ${esc(cust)}</small></div>`;}).join(''):empty('No jobs.',{label:'+ New job',page:'work'})}</div></section><section class="card span4"><h2>Tasks</h2><div class="list">${tasks.length?tasks.slice(0,50).map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Task Title'))}</strong>${pill(v(row,'Status'))}</div><small>${esc(jobName(v(row,'Job ID')))} · ${esc(userName(v(row,'Assigned User ID')))} · ${dateTime(v(row,'Due Time'))}</small><div class="row-actions"><button type="button" class="secondary" data-delete-task="${esc(rowId(row,'Task ID','taskId'))}">Delete</button></div></div>`).join(''):empty('No tasks.',{label:'+ Assign task',page:'work'})}</div></section></div>`;if(window.H38Flow)window.H38Flow.bindScreenHeader($('mainContent'),h38JobsHead);bindForm('requestForm',async(data,form)=>{const id=newId('REQUEST'),record={'Request ID':id,'Business ID':state.businessId,'Customer ID':data.customerId,'Source':data.source,'Subject':requireValue(data.subject,'Subject is required.'),'Details':data.details,'Priority':data.priority,'Status':'New','Created Time':now(),'Updated Time':now(),'Record Version':1};await queueOperation('SAVE_REQUEST','Request',id,{requestId:id,...data},{collection:'requests',record,idKeys:['Request ID']});form.reset();toast('Request queued.');renderWork();});document.querySelector('input[name=isRecurring]')?.addEventListener('change',e=>{document.getElementById('recurFields').classList.toggle('hidden',!e.target.checked);});
/* ---- Job save (Phase 3, Patterns 1+3+4) ----
   Customer is required OR the owner explicitly confirms "no customer yet"
   (non-blocking, AI-assists-never-gates). Post-save shows the standard
   next-step panel and the new job is selected in the lifecycle panel. */
let h38PendingJobSave=null;
async function h38DoSaveJob(data,form){
  const id=newId('JOB'),isRecur=form.querySelector('input[name=isRecurring]')?.checked;
  const title=requireValue(data.projectTitle,'Project title is required.');
  const record={'Job ID':id,'Business ID':state.businessId,'Customer ID':data.customerId,'Job Number':`LOCAL-${Date.now()}`,'Project Title':title,'Status':data.status,'Created Time':now(),'Updated Time':now(),'Record Version':1};
  if(isRecur){record['Is Recurring']=true;record['Recur Frequency']=data.recurFreq||'weekly';record['Recur Price']=num(data.recurPrice);record['Recur Start']=data.recurStart||'';record['Recur End']=data.recurEnd||'';record['Recur Auto Invoice']=!!form.querySelector('input[name=recurAutoInvoice]')?.checked;record['Next Due']=data.recurStart||new Date().toISOString().slice(0,10);}
  await queueOperation('SAVE_JOB','Job',id,{jobId:id,...data},{collection:'jobs',record,idKeys:['Job ID']});
  form.reset();delete form.dataset.h38NoCustomerOk;
  if(window.H38_JOB_LIFECYCLE&&typeof window.H38_JOB_LIFECYCLE.selectJob==='function')window.H38_JOB_LIFECYCLE.selectJob(id);
  renderWork();
  const flow=window.H38Flow;
  if(flow)flow.showNextStep({id:'h38FlowJobSaved',signature:'job-saved:'+id,title:'✓ Job \''+title+'\' created.',offline:!navigator.onLine,next:'schedule it or assign a crew.',actions:[{label:'Open job',primary:true,handler:()=>{const panel=document.querySelector('.h38-life-work');if(panel)panel.scrollIntoView({behavior:'smooth',block:'start'});else window.toast('Open the job from the Jobs list below.',true);}}]});
  else toast('Job \''+title+'\' created. Open it from the Jobs list to schedule work.');
}
bindForm('jobForm',async(data,form)=>{
  requireValue(data.projectTitle,'Project title is required.');
  if(!data.customerId&&!form.dataset.h38NoCustomerOk){
    const flow=window.H38Flow;
    if(!flow){
      if(!confirm('Save this job without a customer? You will not be able to quote or invoice it until a customer is attached.'))return;
      form.dataset.h38NoCustomerOk='1';
    }else{
      h38PendingJobSave={data,form};
      const panel=flow.ask({id:'h38FlowAskJobCustomer',title:'Save this job without a customer?',detail:'A job without a customer cannot be quoted or invoiced until you attach one.',actions:[
        {label:'Pick customer',handler:()=>{h38PendingJobSave=null;if(panel)panel.remove();const sel=form.querySelector('select[name="customerId"]');if(sel){sel.scrollIntoView({behavior:'smooth',block:'center'});sel.focus({preventScroll:true});}}},
        {label:'Save without customer',primary:true,handler:async()=>{const pending=h38PendingJobSave;h38PendingJobSave=null;if(panel)panel.remove();if(!pending)return;form.dataset.h38NoCustomerOk='1';await h38DoSaveJob(pending.data,pending.form);}}
      ]});
      return;
    }
  }
  await h38DoSaveJob(data,form);
});async function askForReview(jobId,customerName){const jobs=records('jobs');const row=jobs.find(r=>rowId(r,'Job ID','jobId')===jobId);if(!row)return;const msg=`Hi ${customerName}! Thanks for choosing Highway 38 Solutions. If you were happy with the work, would you mind leaving us a Google review? It really helps our small business. Thanks!`;try{await navigator.clipboard.writeText(msg);toast('Review request copied — paste it into a text to '+customerName);}catch(e){prompt('Copy this to send to '+customerName+':',msg);}const record={...row,'Review Asked':new Date().toLocaleDateString(),'Review Asked At':now(),'Record Version':num(v(row,'Record Version','recordVersion'))+1};await queueOperation('SAVE_JOB','Job',jobId,{jobId,...record},{collection:'jobs',record,idKeys:['Job ID']});renderWork();}
bindForm('taskForm',async(data,form)=>{const id=newId('TASK'),record={'Task ID':id,'Business ID':state.businessId,'Job ID':data.jobId,'Task Title':requireValue(data.taskTitle,'Task title is required.'),'Assigned User ID':data.assignedUserId,'Status':'Open','Due Time':data.dueTime,'Created Time':now(),'Updated Time':now(),'Record Version':1};await queueOperation('SAVE_TASK','Task',id,{taskId:id,...data},{collection:'tasks',record,idKeys:['Task ID']});form.reset();toast('Task queued.');renderWork();});
document.querySelectorAll('[data-delete-task]').forEach(b=>b.onclick=()=>deleteTask(b.dataset.deleteTask).catch(e=>toast(e.message||String(e),true)));}

function h38ConfirmDialog(message,title='Confirm',okLabel='Confirm'){
  return new Promise(resolve=>{
    let dialog=document.getElementById('h38TaskDeleteConfirmDialog');
    if(!dialog){
      dialog=document.createElement('dialog');
      dialog.id='h38TaskDeleteConfirmDialog';
      dialog.innerHTML='<form method="dialog"><h2 id="h38ConfirmTitle">Confirm</h2><p id="h38TaskDeleteConfirmMessage"></p><div class="actions"><button value="cancel" class="secondary">Cancel</button><button value="ok" class="primary" id="h38ConfirmOk">Confirm</button></div></form>';
      document.body.appendChild(dialog);
    }
    dialog.querySelector('#h38ConfirmTitle').textContent=title;
    dialog.querySelector('#h38TaskDeleteConfirmMessage').textContent=message;
    dialog.querySelector('#h38ConfirmOk').textContent=okLabel;
    const onClose=()=>{dialog.removeEventListener('close',onClose);resolve(dialog.returnValue==='ok');};
    dialog.addEventListener('close',onClose);
    dialog.showModal();
  });
}

async function deleteTask(taskId){
  taskId=String(taskId||'').trim();
  if(!taskId){toast('No task selected to delete.',true);return;}
  const tasks=records('tasks'),row=tasks.find(r=>String(rowId(r,'Task ID','taskId'))===taskId);
  const title=row?v(row,'Task Title')||'this task':'this task';
  const confirmed=await h38ConfirmDialog(`Delete task "${title}"? This removes the task only. The job and customer are kept.`);
  if(!confirmed)return;
  if(!navigator.onLine){toast('Connect to the internet to delete this task.',true);return;}
  try{
    const api=window.H38_SUPABASE_SHARED_CLIENT?.ensure?.();
    if(!api)throw Error('The secure Business Office connection is not ready.');
    const session=await api.auth.getSession();
    if(session.error||!session.data?.session?.user)throw Error('Sign in again before deleting.');
    const changed=await api.from('business_records').update({record_status:'deleted',updated_by:session.data.session.user.id,updated_at:now()}).eq('business_id',state.businessId).eq('collection','tasks').eq('record_key',taskId).select('record_key');
    if(changed.error)throw changed.error;
    const matched=Array.isArray(changed.data)?changed.data.length:0;
    if(Array.isArray(state?.snapshot?.tasks))state.snapshot.tasks=state.snapshot.tasks.filter(r=>String(rowId(r,'Task ID','taskId'))!==taskId);
    toast(matched?'Task deleted.':'Task removed from this device.');
    renderWork();
  }catch(error){toast(error?.message||String(error),true);}
}
if(typeof window!=='undefined')window.deleteTask=deleteTask;

