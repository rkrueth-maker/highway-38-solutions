import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// H38 Deals shared shell login recovery.
// Scope: auth/session bootstrap + entitlement chooser only.
// Penny, Resale and Couponing remain independent hosted products.
// v315 forces an HTML-typed body to recover normal Chrome rendering.
// v317 (2026-10-13): Deal alerts card on the hub itself (registration no
// longer requires opening Penny/Resale first), and the boot paint no longer
// flashes the sign-in form before the saved session has been restored —
// a neutral "restoring" state shows until auth resolves, and a stored
// session is never stomped by a transient boot error.
const html = String.raw`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#0b2438"><title>H38 Deals</title><style>
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f3f6f8;color:#102331}.wrap{max-width:560px;margin:auto;padding:calc(18px + env(safe-area-inset-top)) 16px calc(28px + env(safe-area-inset-bottom))}.hero{text-align:center;padding:20px 8px 18px}.logo{width:72px;height:72px;border-radius:22px;background:#0b2438;color:#fff;display:grid;place-items:center;margin:auto;font-size:27px;font-weight:900}.hero h1{margin:12px 0 4px;font-size:30px}.hero p{margin:0;color:#5a6b76}.card{background:white;border:1px solid #dbe3e8;border-radius:22px;padding:18px;margin:12px 0;box-shadow:0 7px 22px rgba(11,36,56,.06)}.card h2{margin:0 0 5px;font-size:22px}.card p{margin:0 0 14px;color:#586a75;line-height:1.35}.row{display:flex;gap:10px;align-items:center}.grow{flex:1}.pill{font-size:12px;padding:5px 8px;border-radius:999px;background:#e8eef2}.pill.on{background:#e3f6e8;color:#17622c}.pill.off{background:#fff0df;color:#8b4a00}button,a.btn{border:0;border-radius:14px;padding:13px 16px;font-weight:750;font-size:15px;text-decoration:none;text-align:center;background:#0b2438;color:#fff;display:inline-block}.secondary{background:#e8eef2!important;color:#102331!important}.auth{background:#fff;border:1px solid #dbe3e8;border-radius:18px;padding:14px;margin-top:8px}input{width:100%;padding:13px;border:1px solid #cbd5dc;border-radius:12px;margin:5px 0 9px;font-size:16px}.small{font-size:12px;color:#667782}.hidden{display:none!important}.status{min-height:18px;margin:8px 0;color:#5d6d77;font-size:13px}.status.error{color:#9c2525}.top{display:flex;justify-content:space-between;align-items:center}.top strong{font-size:14px}.unlock{opacity:.72}.foot{text-align:center;color:#788791;font-size:12px;margin-top:18px}.system-card{border-style:dashed}.system-card h2{font-size:18px}.system-card .btn{background:#e8eef2;color:#102331}
.alerts-card h2{font-size:19px}.alertrow{display:flex;align-items:center;gap:8px;padding:6px 0}.alertrow label{flex:1;font-weight:750}.alertrow input{width:22px;height:22px;flex:0 0 auto;margin:0;padding:0}.bootstatus{text-align:center;color:#5d6d77;font-size:13px;min-height:18px;margin:10px 0}
</style></head><body data-h38-auth="booting" data-h38-login-repair="v317-hub-alerts"><main class="wrap"><div class="top"><strong>Highway 38 Solutions</strong><button id="signout" class="secondary hidden" type="button">Sign out</button></div><section class="hero"><div class="logo">H38</div><h1>H38 Deals</h1><p>Start with the best opportunities, or open a specialized shopping tool.</p></section><div id="bootstatus" class="bootstatus" aria-live="polite">Restoring your session…</div><form id="loginForm" class="auth hidden"><strong>Sign in</strong><p class="small">One account controls which products you can open.</p><input id="email" name="email" type="email" autocomplete="username" inputmode="email" placeholder="Email" required><input id="password" name="password" type="password" autocomplete="current-password" placeholder="Password" required><button id="signin" type="submit">Sign in</button><div id="authstatus" class="status" aria-live="polite"></div></form><section id="products" class="hidden">
<section id="scoutAlerts" class="card alerts-card"><h2>🔔 Deal alerts</h2><p id="saStatus" class="small">Checking your deal alerts…</p><div id="saOneTap" class="hidden"><button id="saEnable" class="btn" type="button" style="width:100%">Turn on phone notifications</button><p class="small">Your phone will ask permission once. After that, new penny and resale deals buzz this phone automatically.</p></div><div class="alertrow"><label for="saPenny">New penny deals</label><input id="saPenny" type="checkbox" role="switch"></div><div class="alertrow"><label for="saResale">New resale deals</label><input id="saResale" type="checkbox" role="switch"></div></section>
<div id="engine-card" class="card hidden"><div class="row"><div class="grow"><h2>Today's Best</h2><p>One ranked view across Penny Deals, Resale, Couponing and your shared watches.</p></div><span class="pill on">New</span></div><a class="btn open" href="/functions/v1/h38-deal-engine-web">Open Best Opportunities</a></div>
<div id="product-penny" class="card" data-product="penny"><div class="row"><div class="grow"><h2>Penny Deals</h2><p>Penny items and deep-clearance retail deals.</p></div><span class="pill">Checking</span></div><a class="btn open" href="/functions/v1/h38-penny-web">Open Penny Deals</a><button class="unlock hidden" type="button">Unlock</button></div>
<div id="product-resale" class="card" data-product="resale"><div class="row"><div class="grow"><h2>Resale</h2><p>Marketplace, auctions and proven buy-to-resell opportunities.</p></div><span class="pill">Checking</span></div><a class="btn open" href="/functions/v1/h38-resale-web">Open Resale</a><button class="unlock hidden" type="button">Unlock</button></div>
<div id="product-coupon" class="card" data-product="coupon"><div class="row"><div class="grow"><h2>Couponing</h2><p>Shopping lists, coupon stacks, real savings and trip optimization.</p></div><span class="pill">Checking</span></div><a class="btn open" href="/functions/v1/h38-coupon-web">Open Couponing</a><button class="unlock hidden" type="button">Unlock</button></div>
<div id="maintenance-card" class="card system-card hidden"><div class="row"><div class="grow"><h2>System Health</h2><p>Owner-only source health, cache checks and safe maintenance.</p></div><span class="pill on">Owner</span></div><a class="btn" href="/functions/v1/h38-deals-maintenance-web">Open System Health</a></div>
</section><div class="foot">Web-backed products update without reinstalling the Android app.</div></main><script>
'use strict';
const SUPABASE_URL='https://jqukmwtsgcsaruucnqja.supabase.co';
const KEY='sb_publishable_XrF41kGmTC2SmSTgPvo5OQ_vqcBd0N1';
const SDK_URLS=['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/dist/umd/supabase.min.js','https://unpkg.com/@supabase/supabase-js@2.57.4/dist/umd/supabase.min.js'];
const $=id=>document.getElementById(id);
let sb=null,clientPromise=null,renderGeneration=0;
function setStatus(text,isError=false){const el=$('authstatus');el.textContent=text||'';el.classList.toggle('error',!!isError);}
function renderSignedOut(){document.body.dataset.h38Auth='signed-out';$('bootstatus').classList.add('hidden');$('loginForm').classList.remove('hidden');$('products').classList.add('hidden');$('signout').classList.add('hidden');$('maintenance-card').classList.add('hidden');$('signin').disabled=false;}
function loadScript(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');let done=false;const finish=(ok,err)=>{if(done)return;done=true;clearTimeout(timer);if(!ok)s.remove();ok?resolve():reject(err||new Error('SDK_LOAD_FAILED'));};s.src=src;s.async=true;s.onload=()=>finish(true);s.onerror=()=>finish(false,new Error('SDK_LOAD_FAILED'));const timer=setTimeout(()=>finish(false,new Error('SDK_LOAD_TIMEOUT')),12000);document.head.appendChild(s);});}
async function ensureClient(){if(sb)return sb;if(clientPromise)return clientPromise;clientPromise=(async()=>{if(!(window.supabase&&typeof window.supabase.createClient==='function')){let last=null;for(const src of SDK_URLS){try{await loadScript(src);if(window.supabase&&typeof window.supabase.createClient==='function')break;}catch(e){last=e;}}if(!(window.supabase&&typeof window.supabase.createClient==='function'))throw last||new Error('SIGNIN_COMPONENT_UNAVAILABLE');}sb=window.supabase.createClient(SUPABASE_URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});return sb;})().catch(e=>{clientPromise=null;throw e;});return clientPromise;}
async function renderSignedIn(session){if(!session){renderSignedOut();return;}const generation=++renderGeneration;document.body.dataset.h38Auth='signed-in';$('bootstatus').classList.add('hidden');$('loginForm').classList.add('hidden');$('products').classList.remove('hidden');$('signout').classList.remove('hidden');const client=await ensureClient();const {data,error}=await client.from('h38_product_entitlements').select('product_key,active,expires_at').eq('active',true);if(generation!==renderGeneration)return;const allowed=new Set((data||[]).filter(x=>!x.expires_at||new Date(x.expires_at)>new Date()).map(x=>x.product_key));$('engine-card').classList.toggle('hidden',allowed.size===0);document.querySelectorAll('[data-product]').forEach(card=>{const key=card.dataset.product,on=allowed.has(key),pill=card.querySelector('.pill');pill.textContent=on?'Included':'Locked';pill.className='pill '+(on?'on':'off');card.querySelector('.open').classList.toggle('hidden',!on);card.querySelector('.unlock').classList.toggle('hidden',on);card.classList.toggle('unlock',!on);card.dataset.entitled=on?'true':'false';});try{const health=await client.functions.invoke('h38-deals-maintenance',{body:{action:'check',deep:false}});if(generation===renderGeneration&&!health.error&&health.data&&!health.data.error)$('maintenance-card').classList.remove('hidden');else $('maintenance-card').classList.add('hidden');}catch(e){$('maintenance-card').classList.add('hidden');}if(error){console.error(error);setStatus('Signed in, but product access could not be loaded.',true);}else setStatus('');if(window.__saRetry)window.__saRetry();}
$('signin').addEventListener('pointerdown',()=>{if(!$('signin').disabled)setStatus('Starting secure sign-in…');},{passive:true});
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();const email=$('email').value.trim(),password=$('password').value;if(!email||!password){setStatus('Enter email and password.',true);return;}$('signin').disabled=true;setStatus('Signing in…');try{const client=await ensureClient();const {data,error}=await client.auth.signInWithPassword({email,password});if(error)throw error;if(!data||!data.session)throw new Error('NO_SESSION_RETURNED');await renderSignedIn(data.session);}catch(e){renderSignedOut();const m=String(e&&e.message||e||'Sign-in failed');if(m==='Invalid login credentials')setStatus('Email or password is incorrect.',true);else if(m==='NO_SESSION_RETURNED')setStatus('Sign-in did not return a session. Try again.',true);else if(m.includes('SDK_LOAD')||m.includes('SIGNIN_COMPONENT'))setStatus('Secure sign-in could not start. Check the connection and tap Sign in to retry.',true);else setStatus('Sign-in failed: '+m,true);}finally{$('signin').disabled=false;}});
$('signout').addEventListener('click',async()=>{renderGeneration++;setStatus('');try{const client=await ensureClient();await client.auth.signOut();}catch(e){console.error(e);}finally{renderSignedOut();}});
document.querySelectorAll('.unlock').forEach(b=>b.addEventListener('click',()=>alert('This product is not enabled for this account.')));
function storedSession(){try{const raw=localStorage.getItem('sb-jqukmwtsgcsaruucnqja-auth-token');if(!raw)return null;const s=JSON.parse(raw);const cur=s&&s.access_token?s:(s&&s.currentSession?s.currentSession:null);return cur&&(cur.access_token||cur.refresh_token)?cur:null;}catch(e){return null;}}
async function boot(){try{const client=await ensureClient();const {data,error}=await client.auth.getSession();if(error)throw error;if(data&&data.session)await renderSignedIn(data.session);else renderSignedOut();}catch(e){if(storedSession()){document.body.dataset.h38Auth='restore-error';const b=$('bootstatus');b.classList.remove('hidden');b.innerHTML='Your saved session could not be restored. Check your connection, then <button id="bootretry" class="secondary" type="button">tap to retry</button>.';const r=$('bootretry');if(r)r.addEventListener('click',()=>{b.textContent='Restoring your session…';boot();});}else{renderSignedOut();setStatus('Secure sign-in could not start. Tap Sign in to retry.',true);}}}
boot();
</script>
<script>
(function(){
'use strict';
// Scout deal alerts (Web Push) — hub copy of the Penny/Resale module. Talks to h38-scout-push; the push service
// worker (h38-scout-sw) is registered quietly and notification permission is
// requested ONLY from a tap: the one-tap button or an alert switch.
var SA_BASE='https://jqukmwtsgcsaruucnqja.supabase.co',SA_KEY='sb_publishable_XrF41kGmTC2SmSTgPvo5OQ_vqcBd0N1',SA_AUTH='sb-jqukmwtsgcsaruucnqja-auth-token',SA_API=SA_BASE+'/functions/v1/h38-scout-push',SA_SW='/functions/v1/h38-scout-sw';
var SA={key:'',state:null,reg:null};
function $(id){return document.getElementById(id)}
function sess(){try{var x=JSON.parse(localStorage.getItem(SA_AUTH)||'null');return x&&x.access_token?x:(x&&x.currentSession?x.currentSession:null)}catch(e){return null}}
async function token(){var s=sess();if(!s)return '';if(!s.expires_at||s.expires_at*1000>Date.now()+30000)return s.access_token;if(!s.refresh_token)return s.access_token;try{var r=await fetch(SA_BASE+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:SA_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token})});if(r.ok){var n=await r.json();localStorage.setItem(SA_AUTH,JSON.stringify(n));return n.access_token}}catch(e){}return s.access_token}
async function saApi(action,extra){var t=await token();var body={action:action};if(extra)for(var k in extra)body[k]=extra[k];var r=await fetch(SA_API,{method:'POST',headers:{apikey:SA_KEY,Authorization:'Bearer '+(t||SA_KEY),'Content-Type':'application/json'},body:JSON.stringify(body)});var d={};try{d=await r.json()}catch(e){}if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d}
function b64ToBytes(s){var pad='='.repeat((4-s.length%4)%4);var b=atob((s+pad).replace(/-/g,'+').replace(/_/g,'/'));var out=new Uint8Array(b.length);for(var i=0;i<b.length;i++)out[i]=b.charCodeAt(i);return out}
function render(){
  var st=SA.state;if(!st)return;var prefs=st.prefs||{};
  $('saPenny').checked=!!prefs.penny_alerts;$('saResale').checked=!!prefs.resale_alerts;
  var perm=(typeof Notification==='undefined')?'unsupported':Notification.permission,msg='',showTap=false;
  if(st.deviceSubscribed){msg='Deal alerts are ON for this phone.'}
  else if(perm==='denied'){msg='Notifications are blocked for this site. To fix it: open your browser settings for this page, allow Notifications, then reopen Scout.'}
  else if(prefs.prompt_on_open&&(prefs.penny_alerts||prefs.resale_alerts)&&(perm==='granted'||perm==='default')){msg='Deal alerts are turned ON for your account. One tap lets this phone show them:';showTap=true}
  else if(perm==='granted'&&(prefs.penny_alerts||prefs.resale_alerts)){msg='Deal alerts are on for your account but not for this phone yet. Flip a switch off and back on to finish this phone.'}
  else{msg='Deal alerts are off. Flip a switch below and this phone will ask permission once.'}
  $('saStatus').textContent=msg;
  $('saOneTap').classList.toggle('hidden',!showTap);
}
async function enableFlow(){
  var btn=$('saEnable');if(btn)btn.disabled=true;
  try{
    var perm=await Notification.requestPermission();
    if(perm!=='granted'){$('saStatus').textContent=perm==='denied'?'Notifications are blocked for this site. Allow them in your browser site settings, then reopen Scout.':'Permission was not given. Tap any time to try again.';$('saOneTap').classList.add('hidden');return}
    var reg=SA.reg||await navigator.serviceWorker.register(SA_SW,{scope:'/functions/v1/'});SA.reg=reg;
    await navigator.serviceWorker.ready;
    var sub=await reg.pushManager.getSubscription();
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToBytes(SA.key)});
    var j=sub.toJSON();
    var res=await saApi('subscribe',{subscription:{endpoint:j.endpoint,keys:j.keys},userAgent:navigator.userAgent});
    SA.state=await saApi('get_state',{endpoint:j.endpoint});
    render();
    var cu=res&&res.catchUp;
    $('saOneTap').classList.add('hidden');
    $('saStatus').textContent=(cu&&cu.sent>0)?'You are set — your first deal alert is on its way to this phone.':'You are set — this phone will buzz when new penny or resale deals land.';
  }catch(e){$('saStatus').textContent='Could not turn on notifications: '+(e&&e.message?e.message:e)}
  if(btn)btn.disabled=false;
}
async function togglesChanged(){
  var penny=$('saPenny').checked,resale=$('saResale').checked;
  try{
    var r=await saApi('set_prefs',{penny_alerts:penny,resale_alerts:resale});
    if(SA.state)SA.state.prefs=r.prefs;
    if((penny||resale)&&!(SA.state&&SA.state.deviceSubscribed)&&typeof Notification!=='undefined'&&Notification.permission!=='denied'){await enableFlow();return}
    render();
  }catch(e){$('saStatus').textContent='Could not save alert settings: '+(e&&e.message?e.message:e)}
}
async function init(){
  var mount=$('scoutAlerts');if(!mount)return;
  var unsupported=!('serviceWorker' in navigator)||!('PushManager' in window)||typeof Notification==='undefined';
  if(unsupported){
    var ios=/iphone|ipad|ipod/i.test(navigator.userAgent),standalone=!!(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches);
    $('saStatus').textContent=(ios&&!standalone)?'Deal alerts on iPhone need Scout on your Home Screen first: tap Share, then Add to Home Screen, and open Scout from that icon.':'This browser cannot show deal alerts.';
    $('saPenny').disabled=true;$('saResale').disabled=true;return;
  }
  try{
    var cfg=await saApi('config');SA.key=cfg.vapidPublicKey||'';
    if(!SA.key){mount.style.display='none';return}
    try{SA.reg=await navigator.serviceWorker.register(SA_SW,{scope:'/functions/v1/'});}catch(e){}
    var endpoint='';
    try{if(SA.reg){var existing=await SA.reg.pushManager.getSubscription();if(existing)endpoint=existing.endpoint}}catch(e){}
    SA.state=await saApi('get_state',{endpoint:endpoint});
    render();
  }catch(e){SA.failed=true;var ss=$('saStatus');if(ss&&!SA.state)ss.textContent='Deal alerts finish loading once you are signed in.'}
}
var enableBtn=$('saEnable');if(enableBtn)enableBtn.onclick=enableFlow;
$('saPenny').onchange=togglesChanged;
$('saResale').onchange=togglesChanged;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
window.__saRetry=function(){if(!SA.state||SA.failed){SA.failed=false;init();}};
})();
</script></body></html>`;

Deno.serve(()=>{
  const headers=new Headers();
  headers.set('Content-Type','text/html; charset=UTF-8');
  headers.set('Cache-Control','no-store, no-cache, must-revalidate');
  headers.set('Pragma','no-cache');
  headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com; connect-src 'self' https://jqukmwtsgcsaruucnqja.supabase.co wss://jqukmwtsgcsaruucnqja.supabase.co; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-ancestors 'self'");
  return new Response(html,{status:200,headers});
});
