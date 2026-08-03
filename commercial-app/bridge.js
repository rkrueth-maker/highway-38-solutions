'use strict';
(()=>{
  class H38Bridge{
    constructor(frame,url,onStatus,onBootstrap,onFullSnapshot,onError){
      this.frame=frame;this.url=url;this.onStatus=onStatus||(()=>{});this.onBootstrap=onBootstrap||(()=>{});this.onFullSnapshot=onFullSnapshot||(()=>{});this.onError=onError||(()=>{});
      this.ready=false;this.bootstrapped=false;this.pending=new Map();this.popup=null;this.transport=null;this.relayReady=false;
      this.parentHost=window.parent&&window.parent!==window?window.parent:null;
      this.embedded=new URLSearchParams(location.search).get('embedded')==='1'&&!!this.parentHost;
      this.channelId=window.H38_BRIDGE_CHANNEL||this.randomId();this.channelName=`h38-secure-${this.channelId}`;
      this.bridgeToOfficeKey=`h38-bridge-to-office:${this.channelId}`;this.officeToBridgeKey=`h38-office-to-bridge:${this.channelId}`;
      this.listener=event=>this.receive(event);addEventListener('message',this.listener);
      this.storageListener=event=>this.receiveStorage(event);addEventListener('storage',this.storageListener);
      this.relay=!this.embedded&&'BroadcastChannel' in window?new BroadcastChannel(this.channelName):null;
      if(this.relay)this.relay.onmessage=event=>this.receiveRelay(event.data||{});
    }
    randomId(){try{return crypto.randomUUID();}catch(error){return`${Date.now()}-${Math.random().toString(36).slice(2)}`;}}
    withChannel(url){const value=new URL(url,location.href);value.searchParams.set('channel',this.channelId);return value.toString();}
    setUrl(url){this.url=url;this.ready=false;this.bootstrapped=false;this.transport=null;this.connect();}
    connect(){
      if(this.embedded){
        this.ready=false;this.bootstrapped=false;this.transport='parent';this.onStatus('connecting');
        try{this.parentHost.postMessage({type:'H38_BRIDGE_CLIENT_READY',channelId:this.channelId},'*');}catch(error){}
        clearTimeout(this.timer);this.timer=setTimeout(()=>{if(!this.bootstrapped)this.onStatus('sign-in-required');},12000);return;
      }
      if(!this.url)return;this.ready=false;this.bootstrapped=false;if(!this.popup||this.popup.closed)this.transport=null;this.onStatus('connecting');const bridgeUrl=this.withChannel(this.url);this.frame.src=bridgeUrl+(bridgeUrl.includes('?')?'&':'?')+'v='+Date.now();clearTimeout(this.timer);this.timer=setTimeout(()=>{if(!this.bootstrapped)this.onStatus('sign-in-required');},8000);
    }
    authorize(){
      if(this.embedded){try{this.parentHost.postMessage({type:'H38_BRIDGE_CLIENT_READY',channelId:this.channelId},'*');}catch(error){}this.onStatus('connecting');return true;}
      if(!this.url)return false;
      if((!this.popup||this.popup.closed)&&window.h38SecurePopup&&!window.h38SecurePopup.closed)this.popup=window.h38SecurePopup;
      if(this.popup&&!this.popup.closed){try{this.popup.focus();}catch(error){}this.onStatus('authorizing');return true;}
      const base=this.withChannel(this.url),authUrl=base+(base.includes('?')?'&':'?')+'authorize=1&v='+Date.now();
      let popup=null;
      try{popup=window.open(authUrl,'h38-secure-signin','popup=yes,width=520,height=720,resizable=yes,scrollbars=yes');}catch(error){}
      if(!popup){this.onStatus('popup-blocked');return false;}
      this.popup=popup;window.h38SecurePopup=popup;try{popup.focus();}catch(error){}
      this.onStatus('authorizing');clearTimeout(this.authTimer);this.authTimer=setTimeout(()=>{if(!this.bootstrapped)this.onStatus('sign-in-timeout');},60000);return true;
    }
    trustedOrigin(origin){try{const host=new URL(origin).hostname;return host==='script.google.com'||host==='script.googleusercontent.com'||host.endsWith('.script.googleusercontent.com');}catch(error){return false;}}
    useTransport(source,sourceWindow){
      if(source==='frame')this.transport=this.frame.contentWindow;
      else if(source==='popup')this.transport=sourceWindow||this.popup;
      else if(source==='relay')this.transport='relay';
      else if(source==='parent')this.transport='parent';
      this.ready=true;
    }
    receive(event){
      const message=event.data||{};let source='',sourceWindow=event.source;
      if(this.embedded&&event.source===this.parentHost&&this.trustedOrigin(event.origin||''))source='parent';
      else if(event.source===this.frame.contentWindow)source='frame';
      else if(this.popup&&event.source===this.popup)source='popup';
      else if(String(message.type||'').startsWith('H38_BRIDGE_')&&this.trustedOrigin(event.origin||'')){this.popup=event.source;window.h38SecurePopup=event.source;source='popup';}
      if(!source)return;this.handleMessage(message,source,sourceWindow);
    }
    receiveRelay(envelope){
      if(!envelope||envelope.channelId!==this.channelId)return;
      if(envelope.direction==='relay-ready'){this.relayReady=true;this.onStatus('relay-connected');return;}
      if(envelope.direction!=='bridge-to-office')return;
      this.relayReady=true;this.handleMessage(envelope.payload||{},'relay',null);
    }
    receiveStorage(event){
      if(event.key!==this.bridgeToOfficeKey||!event.newValue)return;
      try{this.receiveRelay(JSON.parse(event.newValue));}catch(error){}
    }
    handleMessage(message,source,sourceWindow){
      if(message.type==='H38_BRIDGE_READY'){this.useTransport(source,sourceWindow);this.onStatus('connected');return;}
      if(message.type==='H38_BRIDGE_BOOTSTRAP'){this.useTransport(source,sourceWindow);this.bootstrapped=true;clearTimeout(this.timer);clearTimeout(this.authTimer);this.onBootstrap(message.startup||{});this.onStatus('bootstrapped');return;}
      if(message.type==='H38_BRIDGE_FULL_SNAPSHOT'){this.onFullSnapshot(message.snapshot||{},message.businessId||'');return;}
      if(message.type==='H38_BRIDGE_BOOTSTRAP_ERROR'){clearTimeout(this.timer);clearTimeout(this.authTimer);this.onError('startup',message.error||'Secure startup failed.');this.onStatus('startup-error');return;}
      if(message.type==='H38_BRIDGE_REFRESH_ERROR'){this.onError('refresh',message.error||'Latest-record refresh failed.');return;}
      if(message.type!=='H38_BRIDGE_RESPONSE')return;
      const pending=this.pending.get(message.requestId);if(!pending)return;this.pending.delete(message.requestId);clearTimeout(pending.timer);message.ok?pending.resolve(message.result):pending.reject(new Error(message.error||'Secure connection request failed.'));
    }
    sendRelay(payload){
      const envelope={channelId:this.channelId,direction:'office-to-bridge',payload,id:this.randomId(),sentAt:Date.now()};
      if(this.relay){this.relay.postMessage(envelope);return;}
      try{localStorage.setItem(this.officeToBridgeKey,JSON.stringify(envelope));}catch(error){}
    }
    request(action,args={},timeout=45000){
      const requestId=this.randomId(),payload={type:'H38_BRIDGE_REQUEST',requestId,action,args};
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{this.pending.delete(requestId);reject(new Error(`${action} timed out.`));},timeout);this.pending.set(requestId,{resolve,reject,timer});
        if(this.transport==='parent'&&this.parentHost){this.parentHost.postMessage(payload,'*');return;}
        if(this.transport==='relay'||this.relayReady){this.sendRelay(payload);return;}
        const target=this.transport&&(!(this.transport.closed))?this.transport:(this.popup&&!this.popup.closed?this.popup:this.frame.contentWindow);
        if(!this.ready||!target){clearTimeout(timer);this.pending.delete(requestId);reject(new Error('Secure Google connection is not ready. Open Business Office securely, then try again.'));return;}
        target.postMessage(payload,'*');
      });
    }
  }
  window.H38Bridge=H38Bridge;
})();
