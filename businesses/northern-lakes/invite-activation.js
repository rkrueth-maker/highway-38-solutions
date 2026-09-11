(function(){
'use strict';
var form=document.getElementById('nlInviteActivationForm');
var emailInput=document.getElementById('nlInviteEmail');
var statusNode=document.getElementById('nlInviteStatus');
if(!form||!emailInput||!statusNode)return;
function text(value){return String(value==null?'':value);}
function show(message,bad){statusNode.textContent=message;statusNode.className='notice'+(bad?' bad':'');}
function config(){return window.H38_BUSINESS_OFFICE_SUPABASE||{};}
form.onsubmit=function(event){
  event.preventDefault();
  var settings=config();
  var email=text(emailInput.value).trim().toLowerCase();
  var button=form.querySelector('button[type="submit"]');
  if(!email){show('Enter the invited email address.',true);return;}
  if(!settings.url||!settings.publishableKey){show('Secure invitation configuration is unavailable.',true);return;}
  button.disabled=true;
  show('Requesting the secure Northern Lakes activation email…',false);
  fetch(settings.url+'/functions/v1/business-office-invite-activation',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'apikey':settings.publishableKey,
      'authorization':'Bearer '+settings.publishableKey,
      'x-client-info':'northern-lakes-owner-invite-activation'
    },
    body:JSON.stringify({email:email})
  })
    .then(function(response){return response.json().catch(function(){return{};}).then(function(payload){if(!response.ok||payload.status!=='PASS')throw new Error(payload.error||'Invitation request failed.');return payload;});})
    .then(function(payload){show(payload.message||'Check the invited email for the secure activation link. Open only the newest email on this same device.',false);})
    .catch(function(error){show(text(error&&error.message||error).slice(0,700),true);})
    .finally(function(){button.disabled=false;});
};
})();
