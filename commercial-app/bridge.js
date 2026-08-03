export class H38Bridge{
  constructor(frame,url,onState){this.frame=frame;this.url=url;this.onState=onState||(()=>{});this.ready=false;this.pending=new Map();this.bound=this.handle.bind(this);window.addEventListener('message',this.bound);}
  connect(){this.ready=false;this.onState('connecting');this.frame.src=this.url;}
  setUrl(url){this.url=url;this.connect();}
  handle(event){const message=event.data||{};if(message.type==='H38_BRIDGE_READY'){this.ready=true;this.onState('ready');return;}if(message.type!=='H38_BRIDGE_RESPONSE'||!message.requestId)return;const pending=this.pending.get(message.requestId);if(!pending)return;this.pending.delete(message.requestId);clearTimeout(pending.timer);message.ok?pending.resolve(message.result):pending.reject(new Error(message.error||'Bridge request failed.'));}
  request(action,args={},timeoutMs=25000){if(!navigator.onLine)return Promise.reject(new Error('Offline. Request saved on this device.'));if(!this.ready)return Promise.reject(new Error('Secure bridge is not ready. Sign in to the Commercial Office beta in this browser, then retry.'));const requestId=crypto.randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(requestId);reject(new Error('Bridge request timed out.'));},timeoutMs);this.pending.set(requestId,{resolve,reject,timer});this.frame.contentWindow.postMessage({type:'H38_BRIDGE_REQUEST',requestId,action,args},'*');});}
  destroy(){window.removeEventListener('message',this.bound);}
}
