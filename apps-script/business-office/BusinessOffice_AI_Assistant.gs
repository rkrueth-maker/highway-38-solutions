/** H38 AI owner assistant — guarded intelligence, coaching, email and improvement telemetry. */
var H38_AI_EVENT_LIMIT=250;
var H38_AI_ALLOWED_LAYOUT_KEYS=['density','startModule','pinnedModules','collapsedGroups','showCoach','voiceReplies'];

function boAiBootstrap_(){
 const props=PropertiesService.getUserProperties();
 return{enabled:!!PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY'),model:PropertiesService.getScriptProperties().getProperty('OPENAI_MODEL')||'gpt-5-mini',policy:boAiPolicy_(),preferences:boAiSanitizeLayout_(boAiJson_(props.getProperty('H38_AI_LAYOUT'),{})),recommendations:boAiRecommendations_()};
}
function boAiPolicy_(){return{may:['read approved business context','explain the app','draft content','recommend improvements','change reversible user layout preferences'],mustConfirm:['send email','approve records','post accounting','export payroll','finalize tax','change shared configuration'],never:['modify source code','deploy code','change permissions','move money','silently send or finalize']};}
function boAiChat_(payload){
 payload=payload||{};
 const message=String(payload.message||'').trim();
 boAssert_(message,'AI message is required.');
 const context=boAiSafeContext_(payload.context||{});
 const role=String((boGetClientContext()||{}).role||'User');
 const instructions='You are H38, a concise role-aware business operations assistant. Teach the user how to use the current module, answer business questions using only supplied context, and recommend faster workflows. Never claim an action was completed unless the H38 system result says so. Never instruct the user to bypass approvals. Core code, permissions, financial posting, payroll, tax, deployment and sending remain approval-controlled. Role: '+role+'.';
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
function boAiPrepareEmail_(payload){
 payload=payload||{};const to=String(payload.to||'').trim(),subject=String(payload.subject||'').trim(),request=String(payload.request||'').trim();
 boAssert_(to&&request,'Recipient and email instructions are required.');
 const ai=boAiOpenAi_('Draft a clear professional business email. Return only the email body. Do not add facts not supplied.',JSON.stringify({to:to,subject:subject,instructions:request,context:boAiSafeContext_(payload.context||{})}));
 const token=Utilities.getUuid(),draft={to:to,subject:subject||'Highway 38 follow-up',body:ai.text,createdAt:new Date().toISOString(),createdBy:Session.getActiveUser().getEmail()||'current-user'};
 CacheService.getUserCache().put('H38_AI_SEND_'+token,JSON.stringify(draft),600);boAiRecordEvent_({type:'email_draft',module:'email',outcome:'prepared'});
 return{confirmationToken:token,draft:draft,expiresInSeconds:600,requiresConfirmation:true};
}
function boAiSendEmail_(payload){
 payload=payload||{};boAssert_(String(payload.confirmation||'').toUpperCase()==='SEND','Explicit SEND confirmation is required.');
 const key='H38_AI_SEND_'+String(payload.confirmationToken||''),cache=CacheService.getUserCache(),raw=cache.get(key);boAssert_(raw,'Email confirmation expired or is invalid. Prepare the draft again.');
 const draft=JSON.parse(raw);boAiSendViaGmailApi_(draft);cache.remove(key);boAiRecordEvent_({type:'email_send',module:'email',outcome:'confirmed_send'});
 return{sent:true,to:draft.to,subject:draft.subject,sentAt:new Date().toISOString()};
}
function boAiSendViaGmailApi_(draft){
 const mime=['To: '+draft.to,'Subject: '+draft.subject,'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','',draft.body].join('\r\n');
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
