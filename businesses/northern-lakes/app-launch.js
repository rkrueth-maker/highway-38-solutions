(function(){
'use strict';
var PACKAGE='nlps-supabase-closed-beta-v1';
var statusNode=document.querySelector('[data-deployment-status]');
var buttons=Array.prototype.slice.call(document.querySelectorAll('[data-nl-app]'));
function setStatus(message,kind){if(!statusNode)return;statusNode.textContent=message;statusNode.className='notice'+(kind?' '+kind:'');}
function disable(message){buttons.forEach(function(link){link.setAttribute('aria-disabled','true');link.removeAttribute('href');link.onclick=function(event){event.preventDefault();};});setStatus(message,'');}
function validOfficeUrl(value){
  try{
    var url=new URL(String(value||''));
    return url.protocol==='https:'&&
      url.hostname==='rkrueth-maker.github.io'&&
      url.pathname==='/highway-38-solutions/commercial-app/'&&
      url.searchParams.get('businessKey')==='northern-lakes';
  }catch(error){return false;}
}
fetch('app-deployment.json?v='+PACKAGE,{cache:'no-store'})
  .then(function(response){if(!response.ok)throw new Error('Deployment configuration unavailable');return response.json();})
  .then(function(config){
    var ready=config.status==='pass'&&
      config.coreEngine==='supabase-operational'&&
      config.packageVersion===PACKAGE&&
      config.businessKey==='northern-lakes'&&
      config.systemOfRecord==='supabase'&&
      config.storageProvider==='supabase'&&
      validOfficeUrl(config.businessOfficeUrl)&&
      config.externalActionsEnabled===false&&
      config.googleRecordsImported===false;
    if(!ready){disable('The Northern Lakes Supabase closed beta is not ready. No legacy Office is opened automatically.');return;}
    buttons.forEach(function(link){
      var app=link.getAttribute('data-nl-app');
      var url=new URL(config.businessOfficeUrl);
      if(app==='quote')url.searchParams.set('shell','quote');
      link.href=url.toString();
      link.removeAttribute('aria-disabled');
      link.onclick=null;
    });
    setStatus('Northern Lakes Supabase Business Office is ready. Private Supabase storage is active and all external actions remain owner-controlled.','good');
  })
  .catch(function(){disable('The Northern Lakes Supabase deployment could not be verified. No legacy Office is exposed automatically.');});
})();
