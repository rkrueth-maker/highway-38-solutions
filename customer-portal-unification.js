(function(){
  'use strict';
  const byId=id=>document.getElementById(id);
  function text(node){return String(node&&node.textContent||'').trim();}
  function count(id){const value=parseInt(text(byId(id)).replace(/[^0-9-]/g,''),10);return Number.isFinite(value)?value:0;}
  function ensureShell(){
    const home=document.querySelector('.h38-portal-main');if(!home||byId('customerOnboarding'))return;
    const greeting=document.querySelector('.h38-portal-greeting');
    const onboarding=document.createElement('section');onboarding.id='customerOnboarding';onboarding.className='portal-panel portal-section';onboarding.hidden=localStorage.getItem('h38:customer-onboarding-complete')==='true';onboarding.innerHTML='<div class="portal-section-head"><div><span class="badge">First visit</span><h2>Set up your customer workspace</h2></div><button class="btn" type="button" id="dismissCustomerOnboarding">Done</button></div><ol class="h38-onboarding-list"><li>Confirm the signed-in customer name.</li><li>Select the current project.</li><li>Review anything under Action Required.</li><li>Choose how you want Highway 38 to follow up.</li></ol>';
    const notifications=document.createElement('section');notifications.id='customerNotifications';notifications.className='portal-panel portal-section';notifications.innerHTML='<div class="portal-section-head"><h2>Notifications</h2><button class="btn" type="button" id="markNotificationsRead">Mark viewed</button></div><div id="customerNotificationList" class="portal-list" aria-live="polite"></div>';
    greeting.insertAdjacentElement('afterend',onboarding);onboarding.insertAdjacentElement('afterend',notifications);
    byId('dismissCustomerOnboarding').addEventListener('click',()=>{localStorage.setItem('h38:customer-onboarding-complete','true');onboarding.hidden=true;});
    byId('markNotificationsRead').addEventListener('click',()=>{localStorage.setItem('h38:customer-notifications-viewed',new Date().toISOString());renderNotifications();});
  }
  function renderNotifications(){
    const host=byId('customerNotificationList');if(!host)return;
    const items=[];const quotes=count('metricQuotes');const jobs=count('metricJobs');
    if(quotes>0)items.push({title:quotes+' quote'+(quotes===1?'':'s')+' need review',detail:'Open Quotes to approve, request a change, or decline after full review.'});
    if(jobs>0)items.push({title:jobs+' active project'+(jobs===1?'':'s'),detail:'Open Current project to see the stage, next action, and latest files.'});
    const actionText=text(byId('actionRequired'));if(actionText)items.push({title:'Action required',detail:actionText.slice(0,240)});
    host.innerHTML=items.length?items.map(item=>'<article class="h38-platform-card"><strong>'+escapeHtml(item.title)+'</strong><p>'+escapeHtml(item.detail)+'</p></article>').join(''):'<div class="h38-state" data-h38-state="empty"><div class="h38-state__icon" aria-hidden="true">✓</div><h3>No new customer actions</h3><p>New quotes, files, invoice updates, messages, and project changes will appear here.</p></div>';
  }
  function normalizeEmptyStates(){
    [['jobsList','No projects yet.'],['quotesList','No quotes are waiting for review.'],['filesList','No customer files are available yet.'],['invoicesList','No invoices are available.']].forEach(([id,message])=>{const node=byId(id);if(node&&!text(node))node.innerHTML='<div class="h38-state" data-h38-state="empty"><div class="h38-state__icon" aria-hidden="true">○</div><p>'+escapeHtml(message)+'</p></div>';});
  }
  function escapeHtml(value){return String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function run(){ensureShell();renderNotifications();normalizeEmptyStates();const app=byId('portal-app');if(app){new MutationObserver(()=>{renderNotifications();normalizeEmptyStates();}).observe(app,{subtree:true,childList:true,characterData:true});}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();