// H38 Voice Commands — hands-free field actions (v2.0)
// Web Speech API for capture + client-side pattern matching for parsing.
// No AI, no network needed for parsing. Every action requires confirmation.
// Manual-first: voice is a shortcut; every action is also doable by hand.
(function(){
'use strict';

var text=function(v){return String(v==null?'':v).trim();};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
var lower=function(s){return text(s).toLowerCase();};

// ---------- Number words ----------
var NUMBER_WORDS={
  'a':1,'an':1,'one':1,'two':2,'three':3,'four':4,'five':5,'six':6,'seven':7,
  'eight':8,'nine':9,'ten':10,'eleven':11,'twelve':12,'thirteen':13,'fourteen':14,
  'fifteen':15,'sixteen':16,'seventeen':17,'eighteen':18,'nineteen':19,'twenty':20,
  'half':0.5,'quarter':0.25
};
function parseHours(token){
  var t=lower(token);
  if(NUMBER_WORDS[t]!==undefined)return NUMBER_WORDS[t];
  var n=parseFloat(t.replace(/[^0-9.]/g,''));
  return isFinite(n)&&n>0?n:null;
}

// ---------- Record access (defensive: works even if app globals shift) ----------
function allRecords(name){
  try{
    if(typeof records==='function')return records(name)||[];
    if(window.state&&window.state.snapshot)return window.state.snapshot[name]||[];
  }catch(e){}
  return [];
}
function rowVal(row){
  var keys=Array.prototype.slice.call(arguments,1);
  try{
    if(typeof v==='function')return v.apply(null,[row].concat(keys));
  }catch(e){}
  for(var i=0;i<keys.length;i++){
    var k=keys[i];
    if(row&&row[k]!==undefined&&row[k]!==null&&row[k]!=='')return row[k];
  }
  return '';
}
function rowKey(row){
  var keys=Array.prototype.slice.call(arguments,1);
  try{
    if(typeof rowId==='function')return String(rowId.apply(null,[row].concat(keys)));
  }catch(e){}
  return String(rowVal.apply(null,[row].concat(keys)));
}
function bizId(){
  try{return text(window.state&&window.state.businessId);}catch(e){return '';}
}
function userId(){
  try{return text(window.state&&window.state.snapshot&&window.state.snapshot.user&&window.state.snapshot.user.userId);}catch(e){return '';}
}
function toastMsg(msg,isErr){
  try{
    if(typeof toast==='function'){toast(msg,!!isErr);return;}
  }catch(e){}
  try{ if(isErr)console.error(msg); else console.log(msg); }catch(_){}
}
function speakMsg(msg){
  try{
    if(typeof speak==='function'){speak(msg);return;}
    if('speechSynthesis' in window&&msg){
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(String(msg).slice(0,1500)));
    }
  }catch(e){}
}

// ---------- Fuzzy matching ----------
// Score: how many query words appear in the haystack. Returns best match or null.
function fuzzyFind(rows,query,fields){
  var q=lower(query).replace(/^(the|a|an)\s+/,'').trim();
  if(!q)return null;
  var qWords=q.split(/\s+/).filter(function(w){return w.length>1;});
  if(!qWords.length)return null;
  var best=null,bestScore=0;
  rows.forEach(function(row){
    var hay=fields.map(function(f){return lower(rowVal(row,f));}).join(' ');
    var score=0;
    qWords.forEach(function(w){ if(hay.indexOf(w)>=0)score+=w.length; });
    // Bonus: full query appears verbatim
    if(hay.indexOf(q)>=0)score+=q.length*2;
    if(score>bestScore){bestScore=score;best=row;}
  });
  return bestScore>0?{row:best,score:bestScore}:null;
}
function findJob(query){
  var jobs=allRecords('jobs');
  var customers=allRecords('customers');
  // Build haystack fields: project title, job number, customer name
  var enriched=jobs.map(function(job){
    var custId=rowVal(job,'Customer ID','customerId');
    var cust=customers.find(function(c){return rowKey(c,'Customer ID','customerId')===String(custId);});
    return {row:job,customerName:cust?rowVal(cust,'Customer Name','name'):''};
  });
  var q=lower(query).replace(/^(the|a|an)\s+/,'').trim();
  var qWords=q.split(/\s+/).filter(function(w){return w.length>1;});
  var best=null,bestScore=0;
  enriched.forEach(function(e){
    var hay=lower(rowVal(e.row,'Project Title','projectTitle'))+' '+
            lower(rowVal(e.row,'Job Number','jobNumber'))+' '+
            lower(e.customerName);
    var score=0;
    qWords.forEach(function(w){ if(hay.indexOf(w)>=0)score+=w.length; });
    if(hay.indexOf(q)>=0)score+=q.length*2;
    if(score>bestScore){bestScore=score;best=e.row;}
  });
  return bestScore>0?best:null;
}
function findCustomer(query){
  var m=fuzzyFind(allRecords('customers'),query,['Customer Name','name']);
  return m?m.row:null;
}
function jobLabel(job){
  if(!job)return 'unknown job';
  var title=rowVal(job,'Project Title','projectTitle');
  var num=rowVal(job,'Job Number','jobNumber');
  return title+(num?' ('+num+')':'');
}
function customerLabel(cust){
  if(!cust)return 'unknown customer';
  return rowVal(cust,'Customer Name','name');
}

// ---------- Command parser ----------
// Returns {action, params, summary} or {action:'unknown', transcript}
function parseCommand(transcript){
  var t=text(transcript);
  var s=lower(t);
  if(!t)return {action:'unknown',transcript:t};

  var m;

  // "what jobs today" / "what's on today" / "read my schedule"
  if(/\b(what|which)\b.*\b(jobs?|appointments?|schedule)\b.*\b(today|on)\b/.test(s)||
     /\bwhat'?s on\b/.test(s)||
     /\bread( my)? (day|schedule)\b/.test(s)||
     /\b(today'?s )?(jobs|schedule)\b/.test(s)&&/\bwhat\b/.test(s)){
    return {action:'schedule',params:{},transcript:t,
      summary:'Read back today\'s schedule'};
  }

  // "log 3 hours on johnson" / "log three hours on the johnson job"
  m=s.match(/\b(?:log|record)\s+(?:time\s+)?(?:(\d+(?:\.\d+)?|[a-z]+)\s*(?:hours?|hrs?)\s+)?(?:on|for)\s+(?:the\s+)?(.+?)(?:\s+job)?$/);
  if(m){
    var hours=parseHours(m[1]||'');
    var jobQuery=text(m[2]).replace(/\s+job$/,'');
    if(jobQuery){
      return {action:'log_time',params:{hours:hours,jobQuery:jobQuery},transcript:t,
        summary:hours?('Log '+hours+' hour'+(hours===1?'':'s')+' on "'+jobQuery+'"')
                      :('Log time on "'+jobQuery+'" — hours not heard, say e.g. "log 3 hours on '+jobQuery+'"')};
    }
  }

  // "mark johnson complete" / "complete the johnson job" / "finish johnson"
  m=s.match(/\bmark\s+(?:the\s+)?(.+?)(?:\s+job)?\s+(complete|completed|done|finished)\b/)||
    s.match(/\b(complete|finish|close(?: out)?)\s+(?:the\s+)?(.+?)(?:\s+job)?$/);
  if(m){
    var q=text(m[2]||m[1]).replace(/\s+job$/,'');
    if(q)return {action:'mark_complete',params:{jobQuery:q},transcript:t,
      summary:'Mark "'+q+'" complete'};
  }

  // "add note to johnson: replaced filter" / "note on johnson replaced filter"
  m=s.match(/\badd\s+note\s+(?:to|on|for)\s+(?:the\s+)?(.+?)\s*[:\-]\s*(.+)/)||
    s.match(/\bnote\s+(?:to|on|for)\s+(?:the\s+)?(.+?)\s*[:\-]\s*(.+)/)||
    s.match(/\badd\s+(?:a\s+)?note\s+(?:to|on|for)\s+(?:the\s+)?(.+?)\s+(?=[a-z])(.+)/);
  if(m){
    var nq=text(m[1]).replace(/\s+job$/,'');
    var body=text(m[2]);
    if(nq&&body){
      return {action:'add_note',params:{jobQuery:nq,body:body},transcript:t,
        summary:'Add note to "'+nq+'": "'+(body.length>60?body.slice(0,60)+'…':body)+'"'};
    }
  }

  // "create invoice for 450 to smith" / "invoice smith for $450" / "bill smith 450"
  m=s.match(/\b(?:create\s+)?invoice\s+(?:for\s+\$?([\d,]+(?:\.\d{1,2})?)\s+)?to\s+(.+)/)||
    s.match(/\binvoice\s+(.+?)\s+for\s+\$?([\d,]+(?:\.\d{1,2})?)/)||
    s.match(/\bbill\s+(.+?)\s+(?:for\s+)?\$?([\d,]+(?:\.\d{1,2})?)/)||
    s.match(/\bcreate\s+(?:an?\s+)?invoice\s+for\s+\$?([\d,]+(?:\.\d{1,2})?)\s*(?:to\s+(.+))?/);
  if(m){
    var amountStr=m[1]&&/[\d]/.test(m[1])?m[1]:m[2];
    var custQuery=m[1]&&/[\d]/.test(m[1])?m[2]:m[1];
    var amount=amountStr?parseFloat(String(amountStr).replace(/,/g,'')):null;
    custQuery=text(custQuery||'');
    if(amount>0&&custQuery){
      return {action:'create_invoice',params:{amount:amount,customerQuery:custQuery},transcript:t,
        summary:'Create $'+amount.toFixed(2)+' invoice draft for "'+custQuery+'"'};
    }
    if(custQuery&&!amount){
      return {action:'create_invoice',params:{amount:null,customerQuery:custQuery},transcript:t,
        summary:'Open invoice draft for "'+custQuery+'" (amount not heard)'};
    }
  }

  // "take photo for johnson" / "photo for the johnson job" / "take a picture of johnson"
  m=s.match(/\btake\s+(?:a\s+)?(?:photo|picture)\s+(?:for|of)\s+(?:the\s+)?(.+?)(?:\s+job)?$/)||
    s.match(/\b(?:photo|picture)\s+(?:for|of)\s+(?:the\s+)?(.+?)(?:\s+job)?$/);
  if(m){
    var pq=text(m[1]).replace(/\s+job$/,'');
    if(pq)return {action:'take_photo',params:{jobQuery:pq},transcript:t,
      summary:'Take photo for "'+pq+'"'};
  }

  return {action:'unknown',transcript:t};
}

// ---------- Action executors (reuse existing queueOperation patterns) ----------
function newRecordId(prefix){
  try{
    if(typeof newId==='function')return newId(prefix);
  }catch(e){}
  return prefix+'-'+Math.random().toString(36).slice(2,10).toUpperCase()+Date.now().toString(36).toUpperCase();
}
function nowIso(){
  try{
    if(typeof now==='function')return now();
  }catch(e){}
  return new Date().toISOString();
}
function toNum(x){
  try{
    if(typeof num==='function')return num(x);
  }catch(e){}
  var n=Number(x);return isFinite(n)?n:0;
}
function queue(op,label,id,payload,syncSpec){
  if(typeof queueOperation!=='function')return Promise.reject(new Error('Sync queue unavailable.'));
  return queueOperation(op,label,id,payload,syncSpec);
}

async function execLogTime(params){
  if(!params.hours||!(params.hours>0))
    throw new Error('How many hours? Try "log 3 hours on '+params.jobQuery+'".');
  var job=findJob(params.jobQuery);
  if(!job)throw new Error('Could not find a job matching "'+params.jobQuery+'". Try the job name or customer name.');
  var jobId=rowKey(job,'Job ID','jobId');
  var id=newRecordId('TIME');
  var record={
    'Time Entry ID':id,'Business ID':bizId(),'User ID':userId(),'Job ID':jobId,
    'Hours':params.hours,'Status':'Recorded','Notes':'Voice entry',
    'Created Time':nowIso(),'Updated Time':nowIso(),'Record Version':1
  };
  await queue('RECORD_TIME','Time Entry',id,{timeEntryId:id,hours:params.hours,jobId:jobId,timeSource:'voice'},
    {collection:'timeEntries',record:record,idKeys:['Time Entry ID']});
  return 'Logged '+params.hours+' hour'+(params.hours===1?'':'s')+' on '+jobLabel(job)+'.';
}

async function execAddNote(params){
  var job=findJob(params.jobQuery);
  if(!job)throw new Error('Could not find a job matching "'+params.jobQuery+'".');
  var jobId=rowKey(job,'Job ID','jobId');
  var id=newRecordId('JOB-NOTE');
  var record={
    'Job Note ID':id,'Business ID':bizId(),'Job ID':jobId,
    'Note Type':'Progress','Body':params.body,'Visibility':'Internal',
    'Created By':userId(),'Created Time':nowIso(),'Record Version':1
  };
  await queue('SAVE_ENTITY','Job Note',id,{entity:'jobNotes',record:record},
    {collection:'jobNotes',record:record,idKeys:['Job Note ID']});
  return 'Note saved on '+jobLabel(job)+'.';
}

async function execMarkComplete(params){
  var job=findJob(params.jobQuery);
  if(!job)throw new Error('Could not find a job matching "'+params.jobQuery+'".');
  var jobId=rowKey(job,'Job ID','jobId');
  var st=lower(rowVal(job,'Status'));
  if(st==='complete')return jobLabel(job)+' is already marked complete.';
  // Reuse the customer-comms mark-complete (handles review prompt + re-render)
  if(window.H38CustomerComms&&typeof window.H38CustomerComms.markJobComplete==='function'){
    await window.H38CustomerComms.markJobComplete(jobId);
  }else{
    var record=Object.assign({},job,{
      'Status':'Complete','Updated Time':nowIso(),
      'Record Version':(parseInt(rowVal(job,'Record Version','recordVersion'),10)||0)+1
    });
    await queue('SAVE_JOB','Job',jobId,{jobId:jobId,record:record},
      {collection:'jobs',record:record,idKeys:['Job ID']});
  }
  return 'Marked '+jobLabel(job)+' complete.';
}

async function execCreateInvoice(params){
  var cust=findCustomer(params.customerQuery);
  if(!cust)throw new Error('Could not find a customer matching "'+params.customerQuery+'".');
  var custId=rowKey(cust,'Customer ID','customerId');
  var amount=params.amount||0;
  var line={description:'Field work (voice entry)',quantity:1,unit:'each',unitPrice:amount};
  var id=newRecordId('INVOICE');
  var record={
    'Invoice ID':id,'Business ID':bizId(),'Customer ID':custId,'Job ID':'',
    'Invoice Number':'LOCAL-'+Date.now(),'Status':'Draft','Due Date':'',
    'Subtotal':amount,'Tax':0,'Total':amount,'Balance':amount,
    'Created Time':nowIso(),'Updated Time':nowIso(),'Record Version':1
  };
  await queue('SAVE_INVOICE','Invoice',id,
    {invoiceId:id,customerId:custId,jobId:'',dueDate:'',lines:[line],tax:0},
    {collection:'invoices',record:record,idKeys:['Invoice ID']});
  // Open the Money page so the draft is visible for review/edit
  try{
    if(typeof openPage==='function')setTimeout(function(){openPage('money');},400);
  }catch(e){}
  return 'Invoice draft '+(amount>0?('$'+amount.toFixed(2)+' '):'')+'created for '+customerLabel(cust)+'. Nothing sent — review it on the Money page.';
}

function execSchedule(){
  var out=todayScheduleText();
  speakMsg(out.speech);
  return out.display;
}
function todayScheduleText(){
  var evts=allRecords('scheduleEvents').filter(function(row){
    var st=rowVal(row,'Start Time','startTime');
    if(!st)return false;
    var d=new Date(st).getTime();
    var nowMs=Date.now();
    // today: from 2h ago to end of day
    var start=new Date();start.setHours(0,0,0,0);
    var end=new Date();end.setHours(23,59,59,999);
    return d>=start.getTime()-2*3600000&&d<=end.getTime();
  }).sort(function(a,b){
    return new Date(rowVal(a,'Start Time','startTime'))-new Date(rowVal(b,'Start Time','startTime'));
  }).slice(0,6);
  // Also surface active jobs (Scheduled / In Progress) as "on the board"
  var jobs=allRecords('jobs').filter(function(row){
    return /scheduled|in progress/i.test(rowVal(row,'Status'));
  }).slice(0,6);
  var speech,display;
  if(!evts.length&&!jobs.length){
    speech='Nothing on the schedule today.';
    display='Nothing on the schedule today.';
  }else{
    var parts=[];
    evts.forEach(function(row){
      var title=rowVal(row,'Title')||'Appointment';
      var tm='';
      try{tm=new Date(rowVal(row,'Start Time','startTime')).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});}catch(e){}
      parts.push(title+(tm?' at '+tm:''));
    });
    jobs.forEach(function(row){parts.push(jobLabel(row));});
    speech='Today: '+parts.join('. ')+'.';
    display='Today\'s schedule:\n• '+parts.join('\n• ');
  }
  return {speech:speech,display:display};
}

function execTakePhoto(params){
  var job=findJob(params.jobQuery);
  if(!job)throw new Error('Could not find a job matching "'+params.jobQuery+'".');
  var jobId=rowKey(job,'Job ID','jobId');
  // Reuse the Field page photo input when present
  var input=document.getElementById('fieldPhotoInput');
  var jobSelect=null;
  try{
    var form=document.getElementById('jobNoteForm');
    if(form&&form.elements&&form.elements.jobId){
      jobSelect=form.elements.jobId;
      // Preselect the matched job so the existing onchange handler attaches it correctly
      for(var i=0;i<jobSelect.options.length;i++){
        if(String(jobSelect.options[i].value)===String(jobId)){jobSelect.selectedIndex=i;break;}
      }
    }
  }catch(e){}
  if(input){
    toastMsg('Opening camera for '+jobLabel(job)+' — take the photo.');
    input.click();
    return 'Camera opened for '+jobLabel(job)+'.';
  }
  throw new Error('Photo capture is not available on this page. Open the Field page first.');
}

async function executeParsed(parsed){
  switch(parsed.action){
    case 'log_time':return execLogTime(parsed.params);
    case 'add_note':return execAddNote(parsed.params);
    case 'mark_complete':return execMarkComplete(parsed.params);
    case 'create_invoice':return execCreateInvoice(parsed.params);
    case 'schedule':return execSchedule();
    case 'take_photo':return execTakePhoto(parsed.params);
    default:throw new Error('I did not understand that command. Try "log 3 hours on the Johnson job" or "what jobs today".');
  }
}

// ---------- Speech recognition ----------
var recognition=null,listening=false;
function recognitionSupported(){
  return !!(window.SpeechRecognition||window.webkitSpeechRecognition);
}
function startListening(onTranscript){
  var API=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!API){
    showTextFallback();
    toastMsg('Voice recognition is not available in this browser. Type the command instead.',true);
    return false;
  }
  if(listening){stopListening();return false;}
  try{
    recognition=new API();
  }catch(e){
    showTextFallback();
    return false;
  }
  recognition.lang=navigator.language||'en-US';
  recognition.interimResults=true;
  recognition.maxAlternatives=1;
  recognition.onstart=function(){
    listening=true;
    updateMicUI(true);
    setStatus('Listening… speak a command.');
  };
  recognition.onend=function(){
    listening=false;
    updateMicUI(false);
    if(!pendingTranscript)setStatus('Tap the mic and speak a command.');
  };
  recognition.onerror=function(event){
    listening=false;
    updateMicUI(false);
    var msg='Voice error: '+(event&&event.error?event.error:'unknown');
    if(event&&event.error==='not-allowed')msg='Microphone blocked. Allow microphone access, or type the command instead.';
    if(event&&event.error==='no-speech')msg='Did not hear anything. Try again or type the command.';
    toastMsg(msg,true);
    setStatus(msg);
    showTextFallback();
  };
  var pendingTranscript='';
  recognition.onresult=function(event){
    var interim='',final='';
    for(var i=event.resultIndex;i<event.results.length;i++){
      var res=event.results[i];
      if(res.isFinal)final+=res[0].transcript;
      else interim+=res[0].transcript;
    }
    var shown=(final||interim).trim();
    if(shown){pendingTranscript=final.trim()||pendingTranscript;setTranscript(shown,!!final);}
    if(final&&final.trim()){
      try{recognition.stop();}catch(e){}
      var t=final.trim();
      pendingTranscript='';
      if(typeof onTranscript==='function')onTranscript(t);
    }
  };
  try{
    recognition.start();
    return true;
  }catch(e){
    toastMsg('Could not start voice recognition.',true);
    return false;
  }
}
function stopListening(){
  listening=false;
  try{if(recognition)recognition.stop();}catch(e){}
  recognition=null;
  updateMicUI(false);
}

// ---------- UI ----------
var pendingTranscript='';
function voiceBarHTML(){
  return ''+
  '<section class="card span12" id="h38VoiceBar" aria-label="Voice commands">'+
    '<div class="h38-voice-bar">'+
      '<button type="button" id="h38VoiceMic" class="h38-voice-mic" aria-label="Start voice command">Mic</button>'+
      '<div class="h38-voice-main">'+
        '<div id="h38VoiceStatus" class="h38-voice-status">Tap the mic and speak a command.</div>'+
        '<div id="h38VoiceTranscript" class="h38-voice-transcript" aria-live="polite"></div>'+
      '</div>'+
      '<button type="button" id="h38VoiceTypeToggle" class="secondary">Type</button>'+
    '</div>'+
    '<div id="h38VoiceTypeRow" class="h38-voice-type-row hidden">'+
      '<input id="h38VoiceTypeInput" placeholder=\'Try "log 3 hours on the Johnson job"\'>'+
      '<button type="button" id="h38VoiceTypeGo" class="secondary">Run</button>'+
    '</div>'+
    '<div id="h38VoiceConfirm" class="h38-voice-confirm hidden"></div>'+
    '<p class="muted small h38-voice-hint">Commands: "log 2 hours on Smith", "add note to Johnson: replaced filter", '+
    '"mark Johnson complete", "invoice Smith for 450", "what jobs today", "take photo for Johnson". '+
    'Every action asks for confirmation first.</p>'+
  '</section>';
}
function ensureVoiceBar(){
  var bar=document.getElementById('h38VoiceBar');
  if(bar)return bar;
  // Insert at top of the field grid if present
  var grid=document.querySelector('#mainContent .grid');
  if(grid){grid.insertAdjacentHTML('afterbegin',voiceBarHTML());}
  else{
    var main=document.getElementById('mainContent');
    if(main)main.insertAdjacentHTML('afterbegin',voiceBarHTML());
  }
  bindVoiceBar();
  return document.getElementById('h38VoiceBar');
}
function bindVoiceBar(){
  var mic=document.getElementById('h38VoiceMic');
  var typeToggle=document.getElementById('h38VoiceTypeToggle');
  var typeGo=document.getElementById('h38VoiceTypeGo');
  var typeInput=document.getElementById('h38VoiceTypeInput');
  if(mic&&!mic.dataset.bound){
    mic.dataset.bound='1';
    mic.onclick=function(){toggle();};
  }
  if(typeToggle&&!typeToggle.dataset.bound){
    typeToggle.dataset.bound='1';
    typeToggle.onclick=function(){
      var row=document.getElementById('h38VoiceTypeRow');
      if(row)row.classList.toggle('hidden');
      var inp=document.getElementById('h38VoiceTypeInput');
      if(inp&&!row.classList.contains('hidden'))inp.focus();
    };
  }
  if(typeGo&&!typeGo.dataset.bound){
    typeGo.dataset.bound='1';
    typeGo.onclick=function(){
      var inp=document.getElementById('h38VoiceTypeInput');
      var t=text(inp&&inp.value);
      if(t)handleTranscript(t);
    };
  }
  if(typeInput&&!typeInput.dataset.bound){
    typeInput.dataset.bound='1';
    typeInput.addEventListener('keydown',function(e){
      if(e.key==='Enter'){e.preventDefault();var t=text(typeInput.value);if(t)handleTranscript(t);}
    });
  }
}
function updateMicUI(isListening){
  var mic=document.getElementById('h38VoiceMic');
  if(!mic)return;
  mic.classList.toggle('h38-voice-listening',!!isListening);
  mic.textContent=isListening?'Stop':'Mic';
  mic.setAttribute('aria-label',isListening?'Stop listening':'Start voice command');
}
function setStatus(msg){
  var el=document.getElementById('h38VoiceStatus');
  if(el)el.textContent=text(msg);
}
function setTranscript(msg,isFinal){
  var el=document.getElementById('h38VoiceTranscript');
  if(!el)return;
  el.textContent=(isFinal?'Heard: ':'… ')+text(msg);
  el.classList.toggle('h38-voice-final',!!isFinal);
}
function showTextFallback(){
  var row=document.getElementById('h38VoiceTypeRow');
  if(row)row.classList.remove('hidden');
}
function showConfirmation(parsed){
  var box=document.getElementById('h38VoiceConfirm');
  if(!box)return;
  if(parsed.action==='unknown'){
    box.classList.remove('hidden');
    box.innerHTML='<div class="notice">Did not understand: "'+esc(parsed.transcript)+'". '+
      'Try "log 3 hours on the Johnson job" or tap Type to retry.</div>'+
      '<div class="actions"><button type="button" class="secondary" id="h38VoiceConfirmDismiss">Dismiss</button></div>';
    var d=document.getElementById('h38VoiceConfirmDismiss');
    if(d)d.onclick=function(){box.classList.add('hidden');box.innerHTML='';setStatus('Tap the mic and speak a command.');};
    speakMsg('I did not understand that command.');
    return;
  }
  box.classList.remove('hidden');
  box.innerHTML=
    '<div class="h38-voice-confirm-card" role="dialog" aria-label="Confirm voice command">'+
      '<div class="small muted">I heard: "'+esc(parsed.transcript)+'"</div>'+
      '<div class="h38-voice-confirm-action">'+esc(parsed.summary)+'</div>'+
      '<div class="actions">'+
        '<button type="button" id="h38VoiceConfirmYes" class="primary">Confirm</button>'+
        '<button type="button" id="h38VoiceConfirmNo" class="secondary">Cancel</button>'+
      '</div>'+
    '</div>';
  document.getElementById('h38VoiceConfirmYes').onclick=function(){
    box.classList.add('hidden');box.innerHTML='';
    runConfirmed(parsed);
  };
  document.getElementById('h38VoiceConfirmNo').onclick=function(){
    box.classList.add('hidden');box.innerHTML='';
    setStatus('Cancelled. Tap the mic to try again.');
    toastMsg('Voice command cancelled.');
  };
}
async function runConfirmed(parsed){
  setStatus('Working: '+parsed.summary);
  try{
    var result=await executeParsed(parsed);
    setStatus('Done.');
    setTranscript('',false);
    var el=document.getElementById('h38VoiceTranscript');
    if(el)el.textContent='';
    toastMsg(result);
    speakMsg(result);
    // Refresh the field page lists so the new record is visible
    try{if(typeof renderField==='function'&&window.state&&window.state.page==='field')renderField();}catch(e){}
  }catch(err){
    var msg=(err&&err.message)||String(err);
    setStatus('Could not complete: '+msg);
    toastMsg(msg,true);
    speakMsg('Could not complete that. '+msg);
  }
}
function handleTranscript(t){
  setTranscript(t,true);
  setStatus('Parsing…');
  var parsed;
  try{
    parsed=parseCommand(t);
  }catch(e){
    parsed={action:'unknown',transcript:t};
  }
  showConfirmation(parsed);
}
function toggle(){
  ensureVoiceBar();
  bindVoiceBar();
  if(!recognitionSupported()){
    showTextFallback();
    toastMsg('Voice recognition is not available in this browser. Type the command instead.',true);
    setStatus('Voice unavailable — type the command below.');
    return;
  }
  if(listening){stopListening();setStatus('Stopped. Tap the mic to try again.');return;}
  startListening(handleTranscript);
}

// ---------- Driving mode integration ----------
// When driving mode is on, surface voice as the primary input on the Field page.
function drivingVoiceNudge(){
  try{
    if(!(window.state&&window.state.drivingMode))return '';
    return '<div class="notice h38-driving-voice">Driving mode is on — use voice commands instead of typing. '+
      '<button type="button" class="secondary" id="h38DrivingVoiceBtn">Start voice command</button></div>';
  }catch(e){return '';}
}
function bindDrivingVoice(){
  var btn=document.getElementById('h38DrivingVoiceBtn');
  if(btn&&!btn.dataset.bound){
    btn.dataset.bound='1';
    btn.onclick=function(){toggle();};
  }
}

// ---------- Public API ----------
window.H38VoiceCommands={
  toggle:toggle,
  start:startListening,
  stop:stopListening,
  parse:parseCommand,
  supported:recognitionSupported,
  ensureBar:ensureVoiceBar,
  bindDrivingVoice:bindDrivingVoice,
  drivingVoiceNudge:drivingVoiceNudge,
  // Exposed for tests
  _parseHours:parseHours,
  _findJob:findJob,
  _findCustomer:findCustomer
};
})();
