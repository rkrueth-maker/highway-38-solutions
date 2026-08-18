(function(){
'use strict';
const BUILD='20260818-play-auth-singleflight-1';
const shared=window.H38_SUPABASE_SHARED_CLIENT;
const text=value=>String(value==null?'':value);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const authLike=message=>/401|auth|session|jwt|token/i.test(text(message));
const transientTiming=message=>/jwt issued at future|token.*future|issued.*future/i.test(text(message));
const friendlyAuthMessage='Secure session is still synchronizing. Wait a moment and try again.';

async function sessionState(){
  try{
    const api=shared?.ensure?.();
    if(!api)return{api:null,session:null};
    const result=await api.auth.getSession();
    if(result.error)return{api,session:null,error:result.error};
    return{api,session:result.data?.session||null};
  }catch(error){return{api:null,session:null,error};}
}
async function refreshCurrentSession(){
  const state=await sessionState();
  if(!state.api||!state.session)return false;
  try{
    const result=await state.api.auth.refreshSession();
    return !result.error&&!!result.data?.session;
  }catch(_){return false;}
}

function installBridgeSingleFlight(){
  const Bridge=window.H38Bridge;
  const proto=Bridge?.prototype;
  if(!proto||typeof proto.connect!=='function')return false;
  if(proto.connect.__h38PlayAuthSingleFlight)return true;
  const baseConnect=proto.connect;
  const guarded=function(...args){
    if(this.__h38PlayConnectPromise)return this.__h38PlayConnectPromise;
    const instance=this;
    const originalOnError=instance.onError;
    const task=(async()=>{
      let capturedTransient='';
      const intercept=function(scope,message){
        const rendered=text(message);
        if(transientTiming(rendered)){capturedTransient=rendered;return;}
        if(typeof originalOnError==='function')originalOnError.call(instance,scope,message);
      };
      instance.onError=intercept;
      try{
        await baseConnect.apply(instance,args);
        if(!capturedTransient)return;
        await delay(900);
        const refreshed=await refreshCurrentSession();
        capturedTransient='';
        if(!refreshed){
          if(typeof originalOnError==='function')originalOnError.call(instance,'authorization',friendlyAuthMessage);
          return;
        }
        await baseConnect.apply(instance,args);
        if(capturedTransient&&typeof originalOnError==='function'){
          originalOnError.call(instance,'authorization',friendlyAuthMessage);
        }
      }finally{
        instance.onError=originalOnError;
      }
    })();
    let wrapped;
    wrapped=task.finally(()=>{
      if(instance.__h38PlayConnectPromise===wrapped)instance.__h38PlayConnectPromise=null;
    });
    instance.__h38PlayConnectPromise=wrapped;
    return wrapped;
  };
  guarded.__h38PlayAuthSingleFlight=true;
  guarded.__h38PlayAuthBase=baseConnect;
  proto.connect=guarded;
  return true;
}

function installRecoveryRetry(){
  const recovery=window.H38_SUPABASE_SESSION_RECOVERY;
  if(!recovery?.enabled||typeof recovery.validate!=='function')return false;
  if(recovery.playTimingRetry===true)return true;
  const baseValidate=recovery.validate.bind(recovery);
  let active=null;
  async function validate(){
    if(active)return active;
    active=(async()=>{
      const first=await baseValidate();
      if(first!==false||!navigator.onLine)return first;
      const state=await sessionState();
      if(!state.session)return false;
      await delay(700);
      await refreshCurrentSession();
      return baseValidate();
    })().finally(()=>{active=null;});
    return active;
  }
  window.H38_SUPABASE_SESSION_RECOVERY=Object.freeze({...recovery,validate,playTimingRetry:true,singleFlightValidation:true});
  return true;
}

function installQuoteCircuit(){
  const Bridge=window.H38Bridge;
  const proto=Bridge?.prototype;
  if(!window.H38_QUOTE_AI_AUTH_FIX?.enabled||!proto||typeof proto.request!=='function')return false;
  if(proto.request.__h38PlayQuoteAuthCircuit)return true;
  const baseRequest=proto.request;
  const guarded=async function(action,args,timeout){
    if(!['aiBuildQuoteDraft','aiRenderQuoteConcept'].includes(action))return baseRequest.call(this,action,args,timeout);
    const now=Date.now();
    if(Number(this.__h38PlayQuoteAuthBlockedUntil||0)>now)throw new Error(friendlyAuthMessage);
    const key=action;
    this.__h38PlayQuoteInflight=this.__h38PlayQuoteInflight||Object.create(null);
    if(this.__h38PlayQuoteInflight[key])return this.__h38PlayQuoteInflight[key];
    const task=(async()=>{
      const recovery=window.H38_SUPABASE_SESSION_RECOVERY;
      if(recovery?.validate){
        const valid=await recovery.validate();
        if(valid===false){
          this.__h38PlayQuoteAuthBlockedUntil=Date.now()+15000;
          throw new Error(friendlyAuthMessage);
        }
      }
      try{return await baseRequest.call(this,action,args,timeout);}
      catch(error){
        if(authLike(error?.message||error)){
          this.__h38PlayQuoteAuthBlockedUntil=Date.now()+15000;
          throw new Error(friendlyAuthMessage);
        }
        throw error;
      }
    })();
    this.__h38PlayQuoteInflight[key]=task.finally(()=>{delete this.__h38PlayQuoteInflight[key];});
    return this.__h38PlayQuoteInflight[key];
  };
  guarded.__h38PlayQuoteAuthCircuit=true;
  guarded.__h38PlayQuoteAuthBase=baseRequest;
  proto.request=guarded;
  return true;
}

function apply(){
  installBridgeSingleFlight();
  installRecoveryRetry();
  installQuoteCircuit();
}
apply();
setTimeout(apply,0);
setTimeout(apply,250);
setInterval(apply,1000);
window.H38_PLAY_AUTH_RUNTIME_REPAIR=Object.freeze({build:BUILD,singleFlightConnect:true,transientJwtTimingRetry:true,rawJwtTimingErrorSuppressed:true,quoteAuthCircuitBreaker:true,duplicateQuoteRequestsCollapsed:true,automaticAuthRetry:false,automaticApproval:false,automaticCustomerSending:false});
})();
