(function(){
'use strict';
var statusNode=document.querySelector('[data-deployment-status]');
var buttons=Array.prototype.slice.call(document.querySelectorAll('[data-nl-app]'));
function setStatus(message,kind){
  if(!statusNode)return;
  statusNode.textContent=message;
  statusNode.className='notice'+(kind?' '+kind:'');
}
function disable(message){
  buttons.forEach(function(link){
    link.setAttribute('aria-disabled','true');
    link.removeAttribute('href');
    link.addEventListener('click',function(event){event.preventDefault();});
  });
  setStatus(message,'');
}
function validUrl(value){
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(String(value||''));
}
fetch('app-deployment.json?v=20260720-secure-launch',{cache:'no-store'})
  .then(function(response){if(!response.ok)throw new Error('Deployment configuration unavailable');return response.json();})
  .then(function(config){
    if(config.status!=='pass'||!validUrl(config.businessOfficeUrl)){
      disable('Secure Northern Lakes app deployment is not active yet. No private workspace or customer data is exposed on this public page.');
      return;
    }
    var base=config.businessOfficeUrl;
    buttons.forEach(function(link){
      var app=link.getAttribute('data-nl-app');
      var url=base;
      if(app==='quote')url=base+'?quoteBuilder=1#module=quoteBuilder';
      else if(app==='office'||app==='owner')url=base+'#module=dashboard';
      link.href=url;
      link.removeAttribute('aria-disabled');
    });
    setStatus('Secure Google-authenticated Northern Lakes workspace is active. Owner approval controls and external-action locks remain on.','good');
  })
  .catch(function(){
    disable('Secure Northern Lakes app deployment could not be verified. No private workspace or customer data is exposed on this public page.');
  });
})();