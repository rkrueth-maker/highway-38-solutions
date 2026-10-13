function friendlyModuleName(slug){const names={'accounting':'Accounting','ai':'Hank','approvals':'Approvals','checklists':'Checklists','communications':'Communications','controls':'Owner Controls','customers':'Customers','documents':'Documents','error-log':'Error Log','field':'Field Work','fleet':'Fleet','inventory':'Inventory','jobs':'Jobs','measure':'Measure','money':'Money','payroll-prep':'Payroll Prep','people':'Team','price-book':'Price Book','proof-log':'Proof Log','quotes':'Quotes','reports':'Reports','schedule':'Schedule','service-subscriptions':'Service Plans','settings':'Settings','social':'Social','storage-providers':'Storage','tasks':'Tasks'};if(names[slug])return names[slug];return String(slug).replace(/-/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();});}
function renderSettings(){const users=records('users'),roles=records('roles'),providers=records('providers'),modules=state.snapshot.modules||[];$('mainContent').innerHTML=pageHead('Settings & Apps','Manage users, roles, app views, providers, offline storage and owner controls.')+`<div class="grid"><section class="card span5"><h2>Add business user</h2><form id="userForm"><label>Email</label><input name="email" type="email" required><label>Display name</label><input name="displayName"><label>Role</label><select name="roleId">${optionRows(roles,['Role ID'],row=>v(row,'Role Name'),'Select role')}</select><div class="actions"><button>Save user access</button></div></form><div class="list">${users.length?users.map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Display Name','Email'))}</strong>${pill(v(row,'Status'))}</div><small>${esc(v(row,'Email'))} · ${esc(v(row,'Role ID'))}</small></div>`).join(''):empty('No users.')}</div></section><section class="card span4"><h2>Provider connections</h2><div class="list">${providers.map(row=>`<div class="row provider"><div><strong>${esc(v(row,'Provider Name'))}</strong><small>${esc(v(row,'Provider Type'))}</small></div>${pill(v(row,'Connection Status'),v(row,'Connection Status')==='Connected'?'good':'pending')}</div>`).join('')}</div><p class="muted small">Email, SMS, social and AI providers are connected per business. Credentials are never copied from one business to another.</p></section><section class="card span3"><h2>Installed modules</h2><div class="list">${modules.map(module=>`<div class="row"><strong>${esc(friendlyModuleName(module))}</strong></div>`).join('')}</div></section><section class="card span6"><h2>Business Profile</h2><div id="businessProfileSection"><p class="muted small">Loading business profile…</p></div></section><section class="card span6"><h2>Trade Package</h2><div id="tradePackageSection"><p class="muted small">Loading trade packages…</p></div></section><section class="card span6" id="aiUsageCard"><h2>AI usage this month</h2><div id="aiUsageSection"><p class="muted small">Loading AI usage…</p></div></section><section class="card span12"><h2>Owner Controls</h2><div id="ownerControlsSection"></div></section><section class="card span6"><h2>App views</h2><div class="list">${Object.entries(SHELL_LABELS).map(([key,label])=>`<div class="row"><div class="row-top"><strong>${esc(label)}</strong><a class="app-view-open" href="./?shell=${key}">Open view</a></div><small>Uses the same business records and upgrade path.</small></div>`).join('')}</div></section><section class="card span6"><h2>Business setup &amp; onboarding</h2><p class="muted small">New to the Office, or setting up another business? Run the guided setup — business profile, services, customers, and team — or work through the setup checklist at your own pace. AI help is optional at every step and nothing saves without your approval.</p><div class="actions"><button type="button" data-h38-onboarding-open="onboarding">🧭 Start guided setup</button><button type="button" class="secondary" data-h38-onboarding-open="setupChecklist">✅ Open setup checklist</button><button type="button" class="secondary" data-h38-tour>🎓 Take the office tour</button></div></section><section class="card span6"><h2>Offline device</h2><p class="muted">Last synced: ${dateTime(state.snapshot.cachedAt)}</p><label>Sync server URL</label><input id="bridgeUrlSetting" value="${esc(state.bridge.url||BRIDGE_URL)}"><label><input id="settingsDrivingMode" type="checkbox" ${state.drivingMode?'checked':''}> Driving mode</label><div class="actions"><button id="saveLocalSettings">Save device settings</button><button id="clearDevice" class="danger">Clear this device</button></div>${serverSafeguard()}</section></div>`;bindForm('userForm',async(data,form)=>{requireValue(data.email,'Email is required.');await queueOperation('SAVE_USER','User',newId('USER'),data);form.reset();toast('User access queued. The user will only see this business after synchronization.');});$('saveLocalSettings').onclick=async()=>{const settings={id:'settings',bridgeUrl:$('bridgeUrlSetting').value.trim()||BRIDGE_URL,drivingMode:$('settingsDrivingMode').checked};await put('meta',settings);state.drivingMode=settings.drivingMode;state.bridge.setUrl(settings.bridgeUrl);toast('Device settings saved.');};$('clearDevice').onclick=async()=>{if(!confirm('Clear all Commercial Office data saved on this device? Server records will not be deleted.'))return;await clearAll();location.reload();};if(window.H38CustomerComms){try{
  var prof=window.H38CustomerComms.getBusinessProfile();
  $('businessProfileSection').innerHTML='<label>Business name</label><input id="bpBusinessName" value="'+prof.businessName.replace(/"/g,'&quot;')+'" disabled><label>Google Review Link</label><input id="bpReviewLink" type="url" placeholder="https://g.page/..." value="'+(prof.googleReviewLink||'').replace(/"/g,'&quot;')+'"><label>Facebook Review Link</label><input id="bpReviewLinkFb" type="url" placeholder="https://www.facebook.com/yourpage/reviews" value="'+(prof.facebookReviewLink||'').replace(/"/g,'&quot;')+'"><label>Yelp Review Link</label><input id="bpReviewLinkYelp" type="url" placeholder="https://www.yelp.com/biz/your-business" value="'+(prof.yelpReviewLink||'').replace(/"/g,'&quot;')+'"><p class="muted small">Used in review request texts. Requests rotate across the links you set (Google, then Facebook, then Yelp) so reviews spread out. Find them on each platform&#39;s business page.</p><label>Review request message</label><textarea id="bpReviewTemplate" rows="3" placeholder="Thanks for choosing [Business]! Would you mind leaving us a quick review? [Link]">'+esc(prof.reviewRequestTemplate||'')+'</textarea><p class="muted small">Placeholders: [Business], [Customer], [Link]. This is the exact text customers get.</p><label>Auto-send delay</label><select id="bpReviewDelay">'+window.H38CustomerComms.reviewDelayOptions().map(function(o){return '<option value="'+o.key+'"'+(o.key===(prof.reviewRequestDelay||'3h')?' selected':'')+'>'+esc(o.label)+'</option>';}).join('')+'</select><p class="muted small">Only applies when "Auto-send review requests" is on in Owner Controls. Texts never go out 9pm&ndash;8am.</p><div class="actions"><button id="saveReviewLink">Save review settings</button></div><h3>Recent review requests</h3><div class="list">'+(function(){var rows=window.H38CustomerComms.reviewRequestsLog(10);return rows.length?rows.map(function(r){return '<div class="row"><div class="row-top"><strong>'+esc(r.to||'—')+'</strong>'+pill(r.status)+'</div><small>'+esc(r.purpose)+(r.sentAt?' · '+esc(r.sentAt):'')+(r.deliverAfter?' · after '+esc(r.deliverAfter):'')+'</small></div>';}).join(''):empty('No review requests sent yet.');})()+'</div>';
  try{var bpRec=(records('businessProfile')||[])[0];if(bpRec){var bpRows=[['Business Type',v(bpRec,'Business Type')],['Phone',v(bpRec,'Phone')],['Email',v(bpRec,'Email')],['Address',v(bpRec,'Address')]].filter(function(pair){return pair[1];});if(bpRows.length){var bpDiv=document.createElement('div');bpDiv.id='bpOnboardingProfile';bpDiv.innerHTML='<h3>Business profile (from guided setup)</h3><div class="list">'+bpRows.map(function(pair){return '<div class="row"><div class="row-top"><strong>'+esc(pair[0])+'</strong></div><small>'+esc(pair[1])+'</small></div>';}).join('')+'</div><p class="muted small">Saved by the guided setup wizard. Re-run guided setup to update it.</p>';$('businessProfileSection').appendChild(bpDiv);}}}catch(e){}
  $('saveReviewLink').onclick=function(){window.H38CustomerComms.saveReviewLinks({google:$('bpReviewLink').value.trim(),facebook:$('bpReviewLinkFb').value.trim(),yelp:$('bpReviewLinkYelp').value.trim()});window.H38CustomerComms.saveReviewTemplate($('bpReviewTemplate').value);window.H38CustomerComms.saveReviewDelay($('bpReviewDelay').value);toast('Review settings saved.');};
}catch(e){$('businessProfileSection').innerHTML='<p class="muted">Business profile unavailable.</p>';}}
try{var aiCard=document.getElementById('aiUsageCard');if(aiCard){var aiUser=state.snapshot&&state.snapshot.user;var aiIsOwnerAdmin=!!(aiUser&&(aiUser.owner===true||['owner','administrator','admin'].includes(String(aiUser.roleId||aiUser.roleName||'').toLowerCase())));if(!aiIsOwnerAdmin)aiCard.remove();else loadAiUsageCard();}}catch(e){var aiSec=document.getElementById('aiUsageSection');if(aiSec)aiSec.innerHTML='<p class="muted">Usage unavailable right now</p>';}
if(window.H38OwnerControls){$('ownerControlsSection').innerHTML=window.H38OwnerControls.render();window.H38OwnerControls.bind();}
renderTradePackageSection();}

async function loadAiUsageCard(){
  const section=document.getElementById('aiUsageSection');
  if(!section)return;
  try{
    // Lightest existing authenticated channel: the shared Supabase client
    // (supabase-single-client.js). RLS on ai_usage_log already permits an
    // owner/administrator to read their own business's rows. Read-only:
    // this card never writes and never gates anything.
    let client=null;
    try{client=window.H38_SUPABASE_SHARED_CLIENT&&typeof window.H38_SUPABASE_SHARED_CLIENT.ensure==='function'?window.H38_SUPABASE_SHARED_CLIENT.ensure():null;}catch(e){}
    if(!client){
      const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{};
      if(!window.supabase||!cfg.url||!cfg.publishableKey)throw new Error('Supabase client unavailable.');
      client=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
    }
    const bid=String(state.businessId||(window.H38_SUPABASE_AUTH&&window.H38_SUPABASE_AUTH.getState?window.H38_SUPABASE_AUTH.getState().selectedBusinessId:'')||'');
    if(!bid)throw new Error('No active business.');
    const nowUtc=new Date();
    const monthStart=new Date(Date.UTC(nowUtc.getUTCFullYear(),nowUtc.getUTCMonth(),1)).toISOString();
    const result=await client.from('ai_usage_log').select('id',{count:'exact',head:true}).eq('business_id',bid).gte('created_at',monthStart);
    if(result.error)throw result.error;
    const used=Number(result.count||0),limit=5000,pct=Math.min(100,Math.round(used/limit*100));
    let note='';
    if(used>=limit)note='<p class="notice warn">Monthly AI action limit reached — manual tools keep working.</p>';
    else if(used>=Math.floor(limit*0.75))note='<p class="notice warn">You\'re past 75% of your monthly AI actions.</p>';
    section.innerHTML='<p><strong>'+used.toLocaleString('en-US')+' of 5,000 AI actions used</strong></p><div style="background:#e2e8f0;border-radius:999px;height:10px;overflow:hidden;margin:8px 0"><div style="background:'+(used>=limit?'#dc2626':pct>=75?'#d97706':'#0f766e')+';height:100%;width:'+pct+'%"></div></div>'+note+'<p class="muted small">Resets on the 1st. AI assists; it never gates — every workflow also works fully by hand.</p>';
  }catch(e){
    // Fail quiet: a usage readout must never break Settings.
    section.innerHTML='<p class="muted">Usage unavailable right now</p>';
  }
}

function renderTradePackageSection(){
  const section=$('tradePackageSection');
  if(!section)return;
  if(!window.H38TradePackages){
    section.innerHTML='<p class="muted">Trade packages unavailable.</p>';
    return;
  }
  const loaded=window.H38TradePackages.getLoaded();
  const list=window.H38TradePackages.list();
  section.innerHTML=
    (loaded
      ? `<p><strong>Active package:</strong> ${esc(loaded.tradeName)} <span class="muted small">(loaded ${esc((loaded.loadedAt||'').slice(0,10))})</span></p>`
      : `<p class="muted">No trade package loaded. Pick one below to pre-fill your price book, checklists, job types, and quote language.</p>`)
    + `<label>Trade</label><select id="tradePackageSelect">`
    + list.map(t=>`<option value="${esc(t.id)}"${loaded&&loaded.tradeId===t.id?' selected':''}>${esc(t.name)} — ${t.items} price book items</option>`).join('')
    + `</select>`
    + `<div class="actions" style="margin-top:8px"><button id="loadTradePackageBtn">Load package</button></div>`
    + `<p class="muted small">Loading adds new price book items (existing SKUs are skipped). You can edit or delete everything afterwards.</p>`;
  $('loadTradePackageBtn').onclick=async()=>{
    const tradeId=$('tradePackageSelect').value;
    const btn=$('loadTradePackageBtn');
    btn.disabled=true;btn.textContent='Loading…';
    try{
      const result=await window.H38TradePackages.load(tradeId);
      toast(`Trade package loaded: ${result.added} price book items added${result.skipped?` (${result.skipped} already present)`:''}.`);
      renderTradePackageSection();
    }catch(e){
      toast('Package load failed: '+(e.message||e),true);
      btn.disabled=false;btn.textContent='Load package';
    }
  };
}

function parseJson(value,fallback={}){try{return value?JSON.parse(value):fallback;}catch{return fallback;}}
function readMyDay(){const btn=document.getElementById('readDayButton');if(btn){btn.disabled=true;btn.textContent='Reading...';setTimeout(()=>{btn.disabled=false;btn.textContent='Read my day';},3000);}const events=records('scheduleEvents').filter(row=>new Date(v(row,'Start Time')).getTime()>=Date.now()-2*3600000).sort((a,b)=>new Date(v(a,'Start Time'))-new Date(v(b,'Start Time'))).slice(0,5),tasks=records('tasks').filter(row=>['OPEN','ACCEPTED','STARTED','WAITING','BLOCKED'].includes(String(v(row,'Status')).toUpperCase())).slice(0,5);let text=events.length?`You have ${events.length} upcoming schedule items. `+events.map(row=>`${v(row,'Title')} at ${new Date(v(row,'Start Time')).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`).join('. '):'You have no upcoming schedule items in the cached pack.';if(tasks.length)text+=` You also have ${tasks.length} open tasks.`;speak(text);toast(text);}
function speak(text){if(!('speechSynthesis'in window)||!text)return;window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(String(text).slice(0,1500));utterance.rate=1;window.speechSynthesis.speak(utterance);}
function toggleVoice(){const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Recognition){toast('Voice recognition is not available in this browser. You can still use voice notes through the phone keyboard.',true);return;}if(state.listening){state.recognition?.stop();return;}const recognition=new Recognition();state.recognition=recognition;recognition.lang='en-US';recognition.interimResults=false;recognition.maxAlternatives=1;recognition.onstart=()=>{state.listening=true;$('voiceButton').classList.add('voice-listening');toast('Listening…');};recognition.onend=()=>{state.listening=false;$('voiceButton').classList.remove('voice-listening');};recognition.onerror=event=>toast(`Voice error: ${event.error}`,true);recognition.onresult=event=>handleVoiceTranscript(event.results[0][0].transcript);recognition.start();}
