'use strict';
(()=>{
  const SESSION_KEY='h38-gateway-session-v1';
  const LEGACY_SESSION_KEY='h38-execution-session-v1';
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
  function normalizedSession(handoff){
    if(!handoff||handoff.handoffType!=='H38_GATEWAY_HANDOFF'||!handoff.gatewaySession||!handoff.gatewayUrl||!handoff.startup)return null;
    if(Object.prototype.hasOwnProperty.call(handoff,'accessToken')||handoff.browserReceivesGoogleToken!==false)return null;
    return{
      gatewaySession:String(handoff.gatewaySession),
      gatewayUrl:String(handoff.gatewayUrl),
      issuedAt:String(handoff.issuedAt||new Date().toISOString()),
      expiresAt:String(handoff.expiresAt||''),
      refreshAfterMs:Number(handoff.refreshAfterMs||2400000),
      startup:handoff.startup,
      safeguards:handoff.safeguards||{},
      browserReceivesGoogleToken:false,
      transport:'supabase-gateway'
    };
  }
  function readSession(){
    const handoff=consumeHashHandoff(),session=normalizedSession(handoff);
    if(session){
      try{sessionStorage.removeItem(LEGACY_SESSION_KEY);sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));}catch(error){}
      return session;
    }
    try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');}catch(error){return null;}
  }
  function clearSession(){try{sessionStorage.removeItem(SESSION_KEY);sessionStorage.removeItem(LEGACY_SESSION_KEY);}catch(error){}}
  function expired(session){const time=new Date(session?.expiresAt||0).getTime();return Number.isFinite(time)&&time>0&&time<=Date.now()+30000;}
  function gatewayError(payload,status){
    const detail=payload?.error||payload?.message||'';
    const error=new Error(detail||`Secure Office gateway request failed (${status||'unknown'}).`);
    error.status=status||0;error.payload=payload;return error;
  }
  class H38Bridge{
    constructor(frame,url,onStatus,onBootstrap,onFullSnapshot,onError){
      this.frame=frame;this.url=url;this.onStatus=onStatus||(()=>{});this.onBootstrap=onBootstrap||(()=>{});this.onFullSnapshot=onFullSnapshot||(()=>{});this.onError=onError||(()=>{});
      this.session=readSession();this.ready=false;this.bootstrapped=false;this.transport='supabase-gateway';
      window.H38_GATEWAY_SESSION=this.session;window.H38_EXECUTION_SESSION=null;
    }
    setUrl(url){this.url=url;}
    authorize(){clearSession();location.assign(AUTH_ENTRY);return true;}
    connect(){
      this.session=readSession()||this.session;window.H38_GATEWAY_SESSION=this.session;window.H38_EXECUTION_SESSION=null;
      if(!this.session?.gatewaySession||!this.session?.gatewayUrl||!this.session?.startup||expired(this.session)){
        if(expired(this.session))clearSession();this.ready=false;this.onStatus(expired(this.session)?'auth-expired':'sign-in-required');return;
      }
      this.ready=true;this.onStatus('connected');
      queueMicrotask(()=>{
        if(this.bootstrapped)return;
        this.bootstrapped=true;
        this.onBootstrap(this.session.startup||{});
        this.onStatus('bootstrapped');
      });
    }
    async request(action,args={},timeout=120000){
      if(!this.ready||!this.session?.gatewaySession||expired(this.session)){
        if(expired(this.session)){clearSession();this.ready=false;this.onStatus('auth-expired');}
        const error=new Error('Secure Office gateway session is not ready.');error.code='AUTH_REQUIRED';throw error;
      }
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
      try{
        const response=await fetch(this.session.gatewayUrl,{
          method:'POST',mode:'cors',cache:'no-store',credentials:'omit',signal:controller.signal,
          headers:{'x-h38-gateway-session':this.session.gatewaySession,'content-type':'application/json','x-h38-request-id':crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`},
          body:JSON.stringify({type:'api',action,args:args||{}})
        });
        let payload={};try{payload=await response.json();}catch(error){}
        if(!response.ok||payload.status==='FAIL')throw gatewayError(payload,response.status);
        if(!Object.prototype.hasOwnProperty.call(payload,'result'))throw new Error(`${action} returned no result.`);
        return payload.result;
      }catch(error){
        if(error?.status===401){clearSession();this.ready=false;this.onStatus('auth-expired');this.onError('authorization',error.message||String(error));}
        else this.onError('request',error?.message||String(error));
        throw error;
      }finally{clearTimeout(timer);}
    }
  }
  window.H38Bridge=H38Bridge;
})();
