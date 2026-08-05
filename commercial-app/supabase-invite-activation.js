(function () {
  'use strict';

  const config=window.H38_BUSINESS_OFFICE_SUPABASE || {};
  const auth=window.H38_SUPABASE_AUTH;
  const Bridge=window.H38Bridge;
  if(!auth || auth.enabled!==true || !Bridge || !Bridge.prototype || !window.supabase)return;

  let inviteClient=null;
  const previousRequest=Bridge.prototype.request;

  function client(){
    if(inviteClient)return inviteClient;
    inviteClient=window.supabase.createClient(config.url,config.publishableKey,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'},
      global:{headers:{'x-client-info':'h38-business-office-invite-activation-client'}}
    });
    return inviteClient;
  }
  function text(value){return String(value==null?'':value);}
  function requestedBusinessKey(){
    return text(new URLSearchParams(location.search).get('businessKey')).trim().toLowerCase();
  }
  function notice(message,bad){
    const node=document.getElementById('h38AuthNotice');
    if(!node)return;
    node.textContent=message;
    node.className=`notice${bad?' warn':''}`;
  }

  Bridge.prototype.request=async function(action,args,timeout){
    const result=await previousRequest.call(this,action,args,timeout);
    if(action==='listBusinesses'){
      const key=requestedBusinessKey();
      const rows=Array.isArray(result)?result:[];
      const match=key?rows.find(row=>text(row.businessKey).toLowerCase()===key):null;
      if(match && window.state){
        window.state.businessId=match.businessId;
        try{await window.H38DB.put('meta',{id:'selectedBusiness',businessId:match.businessId});}catch(ignore){}
      }
    }
    return result;
  };

  function installActivationControl(){
    const form=document.getElementById('h38AuthForm');
    const emailInput=document.getElementById('h38AuthEmail');
    const actionRow=form?.querySelector('.welcome-actions');
    if(!form || !emailInput || !actionRow || document.getElementById('h38ActivateInvitation'))return;

    const button=document.createElement('button');
    button.id='h38ActivateInvitation';
    button.className='secondary';
    button.type='button';
    button.textContent='Activate invitation';
    actionRow.appendChild(button);

    const explanation=document.createElement('p');
    explanation.className='muted small';
    explanation.textContent='New client owner or staff? Enter the invited email and request the secure activation email. No password is handled by Highway 38.';
    form.appendChild(explanation);

    button.onclick=async()=>{
      try{
        const email=text(emailInput.value).trim().toLowerCase();
        if(!email)throw new Error('Enter the invited email address first.');
        button.disabled=true;
        notice('Requesting the secure invitation email…',false);
        const {data,error}=await client().functions.invoke('business-office-invite-activation',{body:{email}});
        if(error)throw error;
        if(!data || data.status!=='PASS')throw new Error(data?.error || 'Invitation request failed.');
        notice(data.message || 'Check the invited email for the secure activation link.',false);
      }catch(error){
        notice(text(error && error.message || error).slice(0,700),true);
      }finally{
        button.disabled=false;
      }
    };
  }

  const observer=new MutationObserver(()=>installActivationControl());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  addEventListener('DOMContentLoaded',installActivationControl,{once:true});
  installActivationControl();

  window.H38_INVITE_ACTIVATION={
    enabled:true,
    functionName:'business-office-invite-activation',
    passwordHandledByHighway38:false,
    automaticBusinessActivation:false,
    externalCustomerActionsEnabled:false
  };
})();
