/** H38 AI owner assistant — guarded intelligence, coaching, email and improvement telemetry. */
var H38_AI_EVENT_LIMIT=250;
var H38_AI_ALLOWED_LAYOUT_KEYS=['density','startModule','pinnedModules','collapsedGroups','showCoach','voiceReplies'];

function boAiBootstrap_(){
 const props=PropertiesService.getUserProperties();
 return{enabled:!!PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY'),model:PropertiesService.getScriptProperties().getProperty('OPENAI_MODEL')||'gpt-5-mini',policy:boAiPolicy_(),actions:boAiActionCatalogForClient_(),preferences:boAiSanitizeLayout_(boAiJson_(props.getProperty('H38_AI_LAYOUT'),{})),recommendations:boAiRecommendations_()};
}
function boAiPolicy_(){return{
 may:['read approved business context','explain the app','draft content','recommend improvements','change reversible user layout preferences','prepare allowlisted business actions'],
 mustConfirm:['send email','approve or reject records','convert quotes','create invoices','post approved accounting entries','export approved payroll','finalize approved tax preparation reports'],
 never:['modify source code','deploy code','change permissions or credentials','move money','fund payroll','file tax returns','silently send, approve, post, export or finalize']
};}
function boAiChat_(payload){
 payload=payload||{};
 const message=String(payload.message||'').trim();
 boAssert_(message,'AI message is required.');
 const context=boAiSafeContext_(payload.context||{});
 const role=String((boGetClientContext()||{}).role||'User');
 const instructions='You are H38, a concise role-aware business operations assistant. Teach the user how to use the current module, answer business questions using only supplied context, and recommend faster workflows. Never claim an action was completed unless the H38 deterministic system result says so. Never instruct the user to bypass approvals. Source code, deployments, permissions, credentials, money movement, payroll funding and tax filing are forbidden. External communication, approvals, accounting posting, payroll export and tax preparation finalization require the exact owner confirmation shown by H38. Role: '+role+'.';
 const response=boAiOpenAi_(instructions,JSON.stringify({question:message,context:context,policy:boAiPolicy_()}));
 boAiRecordEvent_({type:'ai_chat',module:context.module||'',outcome:'answered',durationMs:response.durationMs||0});
 return{answer:response.text,policy:boAiPolicy_()};
}
function boAiCoach_(payload){payload=payload||{};const context=boAiSafeContext_(payload.context||{}),task=String(payload.task||'Help me use this screen.');return boAiChat_({message:'Teach me the next best step for this task: '+task+'. Give only the next step, explain why it matters, and mention any approval required.',context:context});}
function boAiEmailBrief_(options){
 options=options||{};const limit=Math.max(1,Math.min(Number(options.limit)||5,10));
 const threads=GmailApp.getInboxThreads(0,limit);
 const items=threads.map(function(thread){const messages=thread.getMessages(),m=messages[messages.length-1];return{id:thread.getId(),subject:m.getSubject(),from:m.getFrom(),date:m.getDate(),snippet:String(m.getPlainBody()||'').replace(/\s+/g,' ').slice(0,1200)};});
 if(!items.length)return{summary:'There are no inbox messages to review.',items:[]};
 const ai=boAiOpenAi_('Summarize these inbox messages for a busy business owner. Prioritize urgency, commitments, money, schedule changes and requested decisions. Do not invent details. Return a short spoken briefing.',JSON.stringify(items));
 boAiRecordEvent_({type:'email_brief',module:'email',outcome:'read',count:items.length});
 return{summary:ai.text,items:items.map(function(x){return{id:x.id,subject:x.subject,from:x.from,date:x.date};})};
}

/* Compatibility routes now use the same owner-approval action engine as voice commands. */
function boAiPrepareEmail_(payload){
 const action=boAiPrepareAction_({actionId:'email.send',arguments:payload||{},context:(payload&&payload.context)||{}});
 return{confirmationToken:action.actionToken,actionToken:action.actionToken,draft:{to:String(payload&&payload.to||''),subject:String(payload&&payload.subject||'Highway 38 follow-up'),body:action.preview.split('\n\n').slice(1).join('\n\n')},preview:action.preview,confirmation:action.confirmation,expiresAt:action.expiresAt,requiresConfirmation:true,requiresOwnerApproval:true};
}
function boAiSendEmail_(payload){return boAiConfirmAction_({actionToken:payload&&(payload.actionToken||payload.confirmationToken),confirmation:payload&&payload.confirmation});}
function boAiSendViaGmailApi_(draft){
 const to=boAiCleanHeader_(draft&&draft.to),subject=boAiCleanHeader_(draft&&draft.subject),body=String(draft&&draft.body||'');
 boAssert_(to&&to.indexOf('@')>0,'A valid email recipient is required.');
 boAssert_(body,'The reviewed email body is required.');
 const mime=['To: '+to,'Subject: '+subject,'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','',body].join('\r\n');
 const encoded=Utilities.base64EncodeWebSafe(mime,Utilities.Charset.UTF_8).replace(/=+$/,'');
 const response=UrlFetchApp.fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},payload:JSON.stringify({raw:encoded}),muteHttpExceptions:true});
 boAssert_(response.getResponseCode()>=200&&response.getResponseCode()<300,'Confirmed email could not be sent.');
}
function boAiSaveLayout_(layout){const clean=boAiSanitizeLayout_(layout||{});PropertiesService.getUserProperties().setProperty('H38_AI_LAYOUT',JSON.stringify(clean));boAiRecordEvent_({type:'layout_change',module:String(clean.startModule||''),outcome:'saved'});return clean;}
function boAiTelemetry_(event){boAiRecordEvent_(event||{});return{recorded:true};}
function boAiRecommendations_(){
 const events=boAiEvents_(),counts={};events.forEach(function(e){const key=[e.type||'event',e.module||'general',e.outcome||''].join('|');counts[key]=(counts[key]||0)+1;});const recommendations=[];
 Object.keys(counts).sort(function(a,b){return counts[b]-counts[a];}).slice(0,8).forEach(function(key){const p=key.split('|'),n=counts[key];if(n<3)return;if(p[0]==='module_open')recommendations.push({type:'layout',title:'Pin '+p[1],reason:'Opened '+n+' times recently.',risk:'low',requiresApproval:false});if(p[0]==='workflow_error')recommendations.push({type:'module',title:'Review '+p[1]+' workflow',reason:n+' recent workflow errors.',risk:'medium',requiresApproval:true});if(p[0]==='ai_chat')recommendations.push({type:'coaching',title:'Create guided help for '+p[1],reason:'Users repeatedly asked AI for help here.',risk:'low',requiresApproval:true});});return recommendations.slice(0,5);
}
function boAiRecordEvent_(event){const props=PropertiesService.getScriptProperties(),events=boAiJson_(props.getProperty('H38_AI_EVENTS'),[]),clean={at:new Date().toISOString(),type:String(event.type||'event').slice(0,40),module:String(event.module||'').slice(0,40),outcome:String(event.outcome||'').slice(0,60),durationMs:Number(event.durationMs)||0,count:Number(event.count)||0,role:String((boGetClientContext()||{}).role||'').slice(0,30)};events.push(clean);while(events.length>H38_AI_EVENT_LIMIT)events.shift();props.setProperty('H38_AI_EVENTS',JSON.stringify(events));}
function boAiEvents_(){return boAiJson_(PropertiesService.getScriptProperties().getProperty('H38_AI_EVENTS'),[]);}
function boAiSafeContext_(context){const clean={},allowed=['module','screen','recordType','recordId','recordSummary','task','businessName'];allowed.forEach(function(k){if(context[k]!==undefined&&context[k]!==null)clean[k]=String(context[k]).slice(0,k==='recordSummary'?6000:500);});return clean;}
function boAiSanitizeLayout_(layout){const clean={};H38_AI_ALLOWED_LAYOUT_KEYS.forEach(function(k){if(layout[k]!==undefined)clean[k]=layout[k];});if(clean.pinnedModules&&!Array.isArray(clean.pinnedModules))delete clean.pinnedModules;if(clean.collapsedGroups&&!Array.isArray(clean.collapsedGroups))delete clean.collapsedGroups;return clean;}
function boAiJson_(value,fallback){try{return value?JSON.parse(value):fallback;}catch(error){return fallback;}}
function boAiOpenAi_(instructions,input){
 const props=PropertiesService.getScriptProperties(),key=props.getProperty('OPENAI_API_KEY');boAssert_(key,'AI is not configured. Add OPENAI_API_KEY to Apps Script properties.');
 const started=Date.now(),payload={model:props.getProperty('OPENAI_MODEL')||'gpt-5-mini',instructions:instructions,input:input,max_output_tokens:900};
 const result=UrlFetchApp.fetch('https://api.openai.com/v1/responses',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+key},payload:JSON.stringify(payload),muteHttpExceptions:true});
 const code=result.getResponseCode(),raw=result.getContentText();boAssert_(code>=200&&code<300,'AI request failed ('+code+').');const json=JSON.parse(raw),text=String(json.output_text||boAiExtractText_(json)||'').trim();boAssert_(text,'AI returned no answer.');return{text:text,durationMs:Date.now()-started};
}
function boAiExtractText_(json){let text='';(json.output||[]).forEach(function(item){(item.content||[]).forEach(function(c){if(c.type==='output_text'&&c.text)text+=c.text;});});return text;}
