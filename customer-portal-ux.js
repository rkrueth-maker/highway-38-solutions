(function(){
  'use strict';
  const byId=id=>document.getElementById(id);
  const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value||0));
  let data={jobs:[],quotes:[],invoices:[],files:[],selectedJobId:null};
  let activeQuoteId=null;

  function selectedJob(){return data.jobs.find(job=>job.id===data.selectedJobId)||null;}
  function formatDate(value){
    if(!value)return 'Not posted yet';
    try{return new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric',year:'numeric'}).format(new Date(value+'T12:00:00'));}
    catch(error){return String(value);}
  }
  function closeQuoteDialog(){const dialog=byId('quoteReviewDialog');if(dialog&&dialog.open)dialog.close();}
  function requestChange(label,jobId){
    if(jobId&&window.H38_CUSTOMER_PORTAL)window.H38_CUSTOMER_PORTAL.selectJob(jobId);
    const message=byId('messageBody');
    if(!message)return;
    message.value='Please review a change to '+label+'. Requested change: ';
    closeQuoteDialog();
    document.getElementById('messages-section')?.scrollIntoView({behavior:'smooth',block:'start'});
    setTimeout(()=>{message.focus();message.setSelectionRange(message.value.length,message.value.length);},350);
  }
  function updateProjectSelector(){
    const wrap=byId('projectSelectorWrap'),select=byId('projectSelector');
    if(!wrap||!select)return;
    wrap.hidden=data.jobs.length<2;
    select.innerHTML=data.jobs.map(job=>'<option value="'+esc(job.id)+'">'+esc(job.job_number||job.title||'Project')+' — '+esc(job.title||'')+'</option>').join('');
    select.value=data.selectedJobId||'';
  }
  function syncMessageContext(){
    const host=byId('messageProjectContext');if(!host)return;
    const job=selectedJob();
    host.innerHTML='<span>Project:</span><strong>'+esc(job?(job.job_number||job.title):'General account review')+'</strong>';
  }
  function syncProject(){
    const host=byId('currentProject');if(!host)return;
    updateProjectSelector();
    syncMessageContext();
    const job=selectedJob();
    if(!job){host.innerHTML='<p class="portal-empty">No active project is posted.</p>';return;}
    const progress=Math.max(0,Math.min(100,Number(job.progress_percent||0)));
    const stages=[['Request received',5],['Scope approved',20],['Information received',40],['Work in progress',65],['Customer review',85],['Complete',100]];
    const stageHtml=stages.map(([label,threshold],index)=>{
      const previous=index?stages[index-1][1]:0;
      const className=progress>=threshold?'is-complete':progress>=previous?'is-current':'';
      return '<li class="'+className+'">'+esc(label)+'</li>';
    }).join('');
    host.innerHTML='<h3>'+esc(job.job_number||job.title||'Current project')+'</h3><p>'+esc(job.title||'')+'</p>'+ 
      '<div class="h38-project-next"><p><strong>Next step:</strong> '+esc(job.next_action||'Highway 38 will post the next action here.')+'</p><p><strong>Expected update:</strong> '+esc(formatDate(job.expected_update_date||job.due_date))+'</p></div>'+ 
      '<ol class="h38-project-timeline">'+stageHtml+'</ol><p><strong>Progress:</strong> '+progress+'%</p>';
  }
  function quoteById(id){return data.quotes.find(quote=>quote.id===id)||null;}
  function quoteReviewComplete(quote){
    return Boolean(
      quote && Number(quote.amount)>0 &&
      String(quote.deliverables||'').trim() &&
      String(quote.timing||'').trim() &&
      String(quote.revision_allowance||'').trim() &&
      String(quote.exclusions||'').trim() &&
      String(quote.approval_consequence||'').trim()
    );
  }
  function openQuoteReview(quoteId){
    const quote=quoteById(quoteId),dialog=byId('quoteReviewDialog'),details=byId('quoteReviewDetails');
    if(!quote||!dialog||!details)return;
    activeQuoteId=quote.id;
    if(quote.job_id&&window.H38_CUSTOMER_PORTAL)window.H38_CUSTOMER_PORTAL.selectJob(quote.job_id);
    byId('quoteReviewTitle').textContent=(quote.quote_number||'Quote')+' — '+(quote.title||'Highway 38 proposal');
    const complete=quoteReviewComplete(quote);
    details.innerHTML=[
      ['Deliverables',quote.deliverables||'Not posted — approval is unavailable.'],
      ['Price',Number(quote.amount)>0?money(quote.amount):'Not posted — approval is unavailable.'],
      ['Timing',quote.timing||'Not posted — approval is unavailable.'],
      ['Revision allowance',quote.revision_allowance||'Not posted — approval is unavailable.'],
      ['Exclusions',quote.exclusions||'Not posted — approval is unavailable.'],
      ['Approval consequence',quote.approval_consequence||'Not posted — approval is unavailable.'],
      ['Approval availability',complete?'All required quote terms are posted. Review every term before approving.':'Highway 38 must post every required term before this quote can be approved. You may request a change or clarification now.']
    ].map(([label,value])=>'<dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd>').join('');
    const approve=byId('quoteApproveConfirmed');
    const available=complete&&quote.status==='presented'&&!quote.customer_decision;
    approve.hidden=!(quote.status==='presented'&&!quote.customer_decision);
    approve.disabled=!available;
    approve.setAttribute('aria-disabled',String(!available));
    approve.dataset.version=String(Number(quote.version||1));
    if(dialog.open)dialog.close();
    dialog.showModal();
  }
  function bindQuoteReviewButtons(){
    byId('quotesList')?.querySelectorAll('[data-review-quote]').forEach(button=>{
      if(button.dataset.bound==='true')return;
      button.dataset.bound='true';
      button.addEventListener('click',()=>openQuoteReview(button.dataset.reviewQuote));
    });
  }
  function syncAction(){
    const host=byId('actionRequired');if(!host)return;
    bindQuoteReviewButtons();
    const quote=data.quotes.find(item=>item.status==='presented'&&!item.customer_decision);
    if(quote){
      host.innerHTML='<article class="h38-action-card"><span class="action-label">Action required</span><h3>'+esc(quote.quote_number||quote.title||'Quote')+' is ready for review</h3><div class="action-meta"><span>'+esc(money(quote.amount))+'</span><span>Review every term before making a decision</span></div><div class="portal-actions" style="margin-top:1rem"><button class="btn btn-primary" type="button" id="actionReviewQuote">Review complete quote</button><button class="btn" type="button" id="actionRequestChange">Request a change</button></div></article>';
      byId('actionReviewQuote')?.addEventListener('click',()=>openQuoteReview(quote.id));
      byId('actionRequestChange')?.addEventListener('click',()=>requestChange(quote.quote_number||quote.title||'this quote',quote.job_id));
      return;
    }
    const balance=byId('metricBalance')?.textContent||'$0.00';
    const jobs=Number(byId('metricJobs')?.textContent||0);
    host.innerHTML='<article class="portal-panel"><span class="badge">No action required</span><h3>You are up to date.</h3><p>'+(jobs?'Your selected project remains visible below.':'No active project is currently posted.')+' Current outstanding balance: '+esc(balance)+'.</p></article>';
  }
  function sync(){syncAction();syncProject();}
  function observe(id){const node=byId(id);if(node)new MutationObserver(()=>{bindQuoteReviewButtons();}).observe(node,{childList:true,subtree:true,characterData:true});}
  function nav(){
    const links=[...document.querySelectorAll('.h38-portal-nav a,.h38-portal-mobile-nav a')];
    links.forEach(link=>link.addEventListener('click',()=>{
      links.forEach(item=>item.classList.toggle('is-active',item.getAttribute('href')===link.getAttribute('href')));
      const menu=byId('portalMoreMenu');if(menu){menu.hidden=true;menu.style.display='';}
      byId('portalMoreButton')?.setAttribute('aria-expanded','false');
    }));
    const more=byId('portalMoreButton'),menu=byId('portalMoreMenu');
    more?.addEventListener('click',()=>{if(!menu)return;const open=menu.hidden;menu.hidden=!open;more.setAttribute('aria-expanded',String(open));if(open){menu.style.position='fixed';menu.style.right='.75rem';menu.style.bottom='74px';menu.style.zIndex='70';menu.style.display='grid';menu.style.gap='.5rem';}else menu.style.display='';});
  }
  function boot(){
    ['jobsList','quotesList','invoicesList','metricBalance','metricJobs'].forEach(observe);
    nav();
    byId('projectSelector')?.addEventListener('change',event=>window.H38_CUSTOMER_PORTAL?.selectJob(event.target.value));
    byId('openSelectedProject')?.addEventListener('click',()=>byId('currentProject')?.scrollIntoView({behavior:'smooth',block:'center'}));
    byId('closeQuoteReview')?.addEventListener('click',closeQuoteDialog);
    byId('quoteRequestChange')?.addEventListener('click',()=>{const quote=quoteById(activeQuoteId);if(quote)requestChange(quote.quote_number||quote.title||'this quote',quote.job_id);});
    byId('quoteApproveConfirmed')?.addEventListener('click',async()=>{
      const quote=quoteById(activeQuoteId),button=byId('quoteApproveConfirmed');
      if(!quote||!quoteReviewComplete(quote)||button.disabled)return;
      button.disabled=true;button.setAttribute('aria-busy','true');
      try{
        const result=await window.H38_CUSTOMER_PORTAL?.approveQuote(quote.id,Number(button.dataset.version||quote.version||1));
        if(result)closeQuoteDialog();
      } finally {
        button.removeAttribute('aria-busy');
        if(byId('quoteReviewDialog')?.open)button.disabled=false;
      }
    });
    window.addEventListener('h38:portal-data',event=>{data=event.detail||data;sync();});
    const initial=window.H38_CUSTOMER_PORTAL?.getState();if(initial){data=initial;sync();}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();