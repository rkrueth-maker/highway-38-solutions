(function(){
'use strict';
var PACKAGE='nlpm-commercial-office-trial-v1';
var statusNode=document.querySelector('[data-deployment-status]');
var buttons=Array.prototype.slice.call(document.querySelectorAll('[data-nl-app]'));
function setStatus(message,kind){if(!statusNode)return;statusNode.textContent=message;statusNode.className='notice'+(kind?' '+kind:'');}
function disable(message){buttons.forEach(function(link){link.setAttribute('aria-disabled','true');link.removeAttribute('href');link.onclick=function(event){event.preventDefault();};});setStatus(message,'');}
function validUrl(value){return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(String(value||''));}
fetch('app-deployment.json?v=nlpm-commercial-office-trial-v1',{cache:'no-store'})
  .then(function(response){if(!response.ok)throw new Error('Deployment configuration unavailable');return response.json();})
  .then(function(config){
    var ready=config.status==='pass'&&config.coreEngine==='commercial-office'&&config.packageVersion===PACKAGE&&validUrl(config.businessOfficeUrl)&&config.externalActionsEnabled===false;
    if(!ready){disable('The retired Northern Lakes Office is unavailable. The new Commercial Office trial package is prepared but has not been activated on the protected deployment.');return;}
    buttons.forEach(function(link){var app=link.getAttribute('data-nl-app'),url=config.businessOfficeUrl;if(app==='quote')url+='?shell=quote';link.href=url;link.removeAttribute('aria-disabled');link.onclick=null;});
    setStatus('Northern Lakes Commercial Office trial is active on the existing protected deployment. External actions remain locked.','good');
  })
  .catch(function(){disable('The Northern Lakes Commercial Office deployment could not be verified. No retired Office is exposed.');});
})();
