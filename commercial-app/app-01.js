const {put,get,all,remove,clearAll,newId}=window.H38DB;
const H38Bridge=window.H38Bridge;

const BRIDGE_URL='https://script.google.com/macros/s/AKfycbyY8cbfvGLzllw7rMhRY46wx_eIKhsK5oLlV6vIcDxDIKuCzX0_oTi4EyVufSxonLdxow/exec?bridge=1';
const PAGE_DEFS={
  today:['🏠','Today'],customers:['👥','Customers'],work:['🧰','Work'],quotes:['🧾','Quotes'],measure:['📐','Measure'],schedule:['📅','Schedule'],messages:['💬','Messages'],field:['📷','Field'],inventory:['📦','Inventory'],fleet:['🚚','Fleet'],money:['💵','Money'],documents:['📁','Documents'],social:['📣','Social'],ai:['✨','H38 AI'],settings:['⚙️','Settings']
};
const SHELL_PAGES={office:Object.keys(PAGE_DEFS),quote:['today','customers','quotes','measure','messages','documents','ai','settings'],field:['today','work','measure','schedule','messages','field','fleet','documents','ai'],inventory:['today','work','messages','inventory','fleet','documents','ai'],social:['today','messages','social','ai','settings']};
const SHELL_LABELS={office:'Full Business Office',quote:'Standalone Quote Builder',field:'Field & Crew',inventory:'Inventory & Fleet',social:'Social Control'};
const state={shell:'office',page:'today',businessId:'',snapshot:null,bridge:null,bridgeReady:false,quote:{quoteId:'',lines:[]},selectedConversation:'',messageTab:'internal',aiConversationId:'',aiChat:[],drivingMode:false,listening:false};
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const v=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const num=value=>Number(value||0);
const now=()=>new Date().toISOString();
const money=value=>num(value).toLocaleString(undefined,{style:'currency',currency:v(state.snapshot?.business,'currency','Currency')||'USD'});
const dateTime=value=>value?new Date(value).toLocaleString():'Not set';
const dateOnly=value=>value?new Date(`${String(value).slice(0,10)}T12:00:00`).toLocaleDateString():'Not set';
const empty=text=>`<div class="empty">${esc(text)}</div>`;
const pill=(text,kind='')=>`<span class="pill ${kind}">${esc(text||'Unknown')}</span>`;
const rowId=(row,...keys)=>String(v(row,...keys));
const industryPacks=business=>{const raw=business?.industryPacks??business?.industryPack??[];if(Array.isArray(raw))return raw.filter(Boolean);if(typeof raw==='string'){try{const parsed=JSON.parse(raw);if(Array.isArray(parsed))return parsed.filter(Boolean);}catch(error){}return raw.split(',').map(x=>x.trim()).filter(Boolean);}return[];};

async function init(){
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  const query=new URLSearchParams(location.search);state.shell=SHELL_PAGES[query.get('shell')]?query.get('shell'):'office';$('shellLabel').textContent=SHELL_LABELS[state.shell];
  const settings=await get('meta','settings')||{id:'settings',bridgeUrl:BRIDGE_URL,drivingMode:false};state.drivingMode=!!settings.drivingMode;
  const requestedBusinessId=(query.get('businessId')||'').trim(),cachedBusinessId=(await get('meta','selectedBusiness'))?.businessId||'';state.businessId=requestedBusinessId||cachedBusinessId;
  if(requestedBusinessId)await put('meta',{id:'selectedBusiness',businessId:requestedBusinessId});
  bindGlobal();renderNav();network();await loadCached();await updatePending();
  state.bridge=new H38Bridge($('bridgeFrame'),settings.bridgeUrl||BRIDGE_URL,async status=>{state.bridgeReady=status==='ready';$('businessStatus').textContent=status==='ready'?'Secure Google connection ready.':status==='connecting'?'Connecting to secure Google account…':'Secure bridge unavailable; cached offline work remains available.';if(state.bridgeReady){await listBusinesses();if(state.businessId)await loadBusiness(state.businessId,true);await sync(false);}});state.bridge.connect();
  addEventListener('online',async()=>{network();state.bridge?.connect();});addEventListener('offline',network);
  if(!state.snapshot)renderWelcome();else openPage(state.page,false);
}
function bindGlobal(){
  $('loadBusinessButton').onclick=()=>loadBusiness($('businessSelect').value,false);$('syncButton').onclick=()=>sync(true);$('voiceButton').onclick=toggleVoice;
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&navigator.onLine){network();state.bridge?.connect();}});
}
function can(capability){const user=state.snapshot?.user;if(!user)return true;if(user.owner||user.permissions?.all===true)return true;return user.permissions?.[capability]===true;}
function allowedPages(){const requirements={customers:['viewCustomers','manageWork','manageQuotes'],work:['manageWork','viewAssignedWork','manageAssignedWork'],quotes:['manageQuotes','manageWork'],measure:['manageField','manageQuotes','captureEvidence'],schedule:['manageSchedule','manageWork','viewAssignedWork'],messages:['manageCommunications'],field:['manageField','viewAssignedWork','captureEvidence'],inventory:['manageInventory','useInventory'],fleet:['manageAssets','useAssets','manageMaintenance'],money:['manageFinancial','viewFinancial'],documents:['manageWork','manageQuotes','manageField','captureEvidence'],social:['manageSocial'],settings:['manageSettings','manageUsers']};return SHELL_PAGES[state.shell].filter(page=>!requirements[page]||requirements[page].some(can));}
function renderNav(){const pages=allowedPages();$('mainNav').innerHTML=pages.map(key=>`<button type="button" data-page="${key}" class="${key===state.page?'active':''}"><span class="nav-icon">${PAGE_DEFS[key][0]}</span><span>${PAGE_DEFS[key][1]}</span></button>`).join('');$('mainNav').querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>openPage(button.dataset.page));}
function network(){const online=navigator.onLine;$('networkBadge').textContent=online?'Online':'Offline';$('networkBadge').className=`badge ${online?'online':'offline'}`;}
function toast(message,bad=false){const node=$('toast');node.textContent=message;node.className=`toast${bad?' bad':''}`;clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.add('hidden'),4800);}
function renderWelcome(){$('mainContent').innerHTML=`<section class="welcome"><h1>H38 Commercial Office</h1><p>Open a business while online once. The app then keeps important work available on this device when service disappears.</p><div class="notice warn">External sending, social publishing, payments, purchasing and destructive changes remain approval-controlled.</div></section>`;}
async function listBusinesses(){try{const businesses=await state.bridge.request('listBusinesses');$('businessSelect').innerHTML='<option value="">Select business</option>'+businesses.map(b=>`<option value="${esc(b.businessId)}">${esc(b.businessName)}${industryPacks(b).length?' — '+esc(industryPacks(b).join(', ')):''}</option>`).join('');if(!state.businessId&&businesses.length===1){state.businessId=businesses[0].businessId;await put('meta',{id:'selectedBusiness',businessId:state.businessId});}$('businessSelect').value=state.businessId;}catch(error){toast(error.message,true);}}
