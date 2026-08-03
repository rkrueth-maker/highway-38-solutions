'use strict';
(()=>{
  const SESSION_KEY='h38-execution-session-v1';
  const AUTH_ENTRY='/open-business-office.html';
  function decodeBase64Url(value){
    const normalized=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
    const padded=normalized+'='.repeat((4-normalized.length%4)%4);
    const binary=atob(padded);const bytes=new Uint8Array(binary.length);
    for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  function consumeHashHandoff(){
    try{
      const raw=new URLSearchParams(location.hash.replace(/^#/,'' )).get('h38');
      if(!raw)return null;
      const handoff=decodeBase64Url(raw);
      history.replaceState(null,'',location.pathname+location.search);
      return handoff;
    }catch(error){
      try{history.replaceState(null,'',location.pathname+location.search);}catch(ignore){}
      return null;
    }
  }
  function readSession(){
    const handoff=consumeHashHandoff();
    if(handoff&&handoff.handoffType==='H38_EXECUTION_HANDOFF'&&handoff.accessToken&&handoff.startup){
      const session={
        accessToken:String(handoff.accessToken),
        apiDeploymentId:String(handoff.apiDeploymentId||''),
        scriptId:String(handoff.scriptId||''),
        issuedAt:String(handoff.issuedAt||new Date().toISOString()),
        refreshAfterMs:Number(handoff.refreshAfterMs||600000),
        startup:handoff.startup,
        safeguards:handoff.safeguards||{}
      };
      try{sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));}catch(error){}
      return session;
    }
    try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');}catch(error){return null;}
  }
  function clearSession(){try{sessionStorage.removeItem(SESSION_KEY);}catch(error){}}
  function executionError(payload,status){
    const detail=payload?.error?.details?.[0]?.errorMessage||payload?.error?.message||payload?.message||'';
    const error=new Error(detail||`Google execution request failed (${status||'unknown'}).`);
    error.status=status||0;error.payload=payload;return error;
  }
  class H38Bridge{
    constructor(frame,url,onStatus,onBootstrap,onFullSnapshot,onError){
      this.frame=frame;this.url=url;this.onStatus=onStatus||(()=>{});this.onBootstrap=onBootstrap||(()=>{});this.onFullSnapshot=onFullSnapshot||(()=>{});this.onError=onError||(()=>{});
      this.session=readSession();this.ready=false;this.bootstrapped=false;this.transport='execution-api';
      window.H38_EXECUTION_SESSION=this.session;
    }
    setUrl(url){this.url=url;}
    authorize(){clearSession();location.assign(AUTH_ENTRY);return true;}
    connect(){
      this.session=readSession()||this.session;window.H38_EXECUTION_SESSION=this.session;
      if(!this.session?.accessToken||!this.session?.startup){this.ready=false;this.onStatus('sign-in-required');return;}
      this.ready=true;this.onStatus('connected');
      queueMicrotask(()=>{
        if(this.bootstrapped)return;
        this.bootstrapped=true;
        this.onBootstrap(this.session.startup||{});
        this.onStatus('bootstrapped');
      });
    }
    async callDeployment(deploymentId,action,args,timeout){
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);
      try{
        const response=await fetch(`https://script.googleapis.com/v1/scripts/${encodeURIComponent(deploymentId)}:run`,{
          method:'POST',mode:'cors',cache:'no-store',credentials:'omit',signal:controller.signal,
          headers:{authorization:`Bearer ${this.session.accessToken}`,'content-type':'application/json'},
          body:JSON.stringify({function:'cbApi',parameters:[{action,args:args||{}}],devMode:false})
        });
        let payload={};try{payload=await response.json();}catch(error){}
        if(!response.ok)throw executionError(payload,response.status);
        if(payload.error)throw executionError(payload,response.status);
        if(payload.done===false)throw new Error(`${action} did not finish.`);
        if(!payload.response||!Object.prototype.hasOwnProperty.call(payload.response,'result'))throw new Error(`${action} returned no result.`);
        return payload.response.result;
      }finally{clearTimeout(timer);}
    }
    async request(action,args={},timeout=120000){
      if(!this.ready||!this.session?.accessToken){const error=new Error('Secure Google session is not ready.');error.code='AUTH_REQUIRED';throw error;}
      const candidates=[this.session.apiDeploymentId,this.session.scriptId].filter((value,index,array)=>value&&array.indexOf(value)===index);
      let lastError=null;
      for(let index=0;index<candidates.length;index++){
        try{return await this.callDeployment(candidates[index],action,args,timeout);}
        catch(error){
          lastError=error;
          if(error.status===401){clearSession();this.ready=false;this.onStatus('auth-expired');break;}
          if(error.status!==404||index===candidates.length-1)break;
        }
      }
      const message=lastError?.message||'Secure Google request failed.';
      this.onError(lastError?.status===401?'authorization':'request',message);
      throw lastError||new Error(message);
    }
  }
  window.H38Bridge=H38Bridge;
})();
