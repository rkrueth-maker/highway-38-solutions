(function () {
  'use strict';

  const auth=window.H38_SUPABASE_AUTH;
  const Bridge=window.H38Bridge;
  if(!auth || auth.enabled!==true || !Bridge || !Bridge.prototype)return;

  const BUILD='20260812-2206';
  const ENDPOINT='h38-assistant-ai';
  const previousRequest=Bridge.prototype.request;
  const routedChat=[];
  let personalObserver=null;

  function text(value){return String(value==null?'':value);}
  function esc(value){return typeof window.esc==='function'?window.esc(value):text(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function localAnswer(question,pageKey){
    const q=text(question).toLowerCase();
    const page=text(pageKey || 'today');
    if(/task|assign|crew|employee/.test(q)){
      return 'Open Work & Tasks. Choose the job, enter the task, select an active business user, set the due time, and save. The assignment stays internal and synchronizes to the active Supabase business.';
    }
    if(/photo|file|document|drive/.test(q)){
      return 'Use Documents & Photos or the photo button inside the job or quote. Supabase private storage is the default. A client-owned Google Drive can be connected during business onboarding, while Supabase keeps the authoritative file metadata and permissions.';
    }
    if(/quote|price|estimate/.test(q)){
      return 'Open Quote Builder, select Generic Quote Customer or the correct customer, add scope and measurements, search the cached Price Book first, and save the draft. All prices and delivery remain owner-review required.';
    }
    if(/offline|sync|internet/.test(q)){
      return 'Work created without service remains in this user-scoped device queue. Reconnect, reopen the verified business, and press Sync. Nothing is sent, paid, approved, purchased, published, or filed automatically.';
    }
    if(/schedule|calendar|appointment/.test(q)){
      return 'Open Schedule, link the job, choose the assigned user, set start and end times, and save. This creates an internal schedule record only.';
    }
    return `H38 AI cloud service is unavailable right now. I can still guide the ${page} workflow from the installed app. Use the page forms to save internal work; every external action remains disabled or owner-controlled.`;
  }

  function safeContext(args){
    const supplied=args&&args.context&&typeof args.context==='object'?args.context:{};
    const state=window.state||{};
    const context={
      source:text(supplied.source||'h38-ai'),
      shell:text(supplied.shell||state.shell||'office'),
      pageKey:text(supplied.pageKey||args&&args.pageKey||state.page||'today'),
      pageLabel:text(supplied.pageLabel||''),
      businessName:text(supplied.businessName||state.snapshot?.business?.businessName||''),
      roleName:text(supplied.roleName||state.snapshot?.user?.roleName||''),
      quoteId:text(supplied.quoteId||''),
      projectTitle:text(supplied.projectTitle||''),
      scope:text(supplied.scope||''),
      measurementNotes:text(supplied.measurementNotes||''),
      conversationId:text(supplied.conversationId||args&&args.aiConversationId||'')
    };
    return context;
  }

  function howToQuestion(question){
    return /^(how|where|what|why|when|which|can you explain|could you explain|show me how|teach me|help me understand)\b/i.test(text(question).trim());
  }

  function controlledActionRequest(question){
    const q=text(question).trim();
    if(!q || howToQuestion(q))return false;
    return /^(please\s+)?(send|reply|email|text|message|approve|reject|buy|purchase|order|pay|refund|post|export|file|finalize|release|deliver|delete|invite|deploy|convert)\b/i.test(q)
      || /\b(approve and send|send it|pay it|buy it|purchase it|place the order|file the return|export payroll|post the accounting|change permissions|deploy this)\b/i.test(q);
  }

  function controlledActionAnswer(question){
    const q=text(question).toLowerCase();
    if(/send|reply|email|text|message|deliver|release/.test(q))return 'I can help prepare or review the message, but I will not send or release it. Open the existing communications or quote-delivery control, review the recipient and final content, then use its explicit owner action.';
    if(/approve|reject/.test(q))return 'I can summarize what needs review, but I will not approve or reject a business record. Open the source record and use its existing explicit approval control.';
    if(/buy|purchase|order/.test(q))return 'I can help identify what is needed, but I will not purchase or order anything. Review the item, quantity, vendor and price in the existing Office workflow before using its controlled purchase action.';
    if(/pay|refund/.test(q))return 'I can help review the amount and supporting records, but I will not move money. Use the existing Money workflow and its explicit payment control.';
    if(/post|export payroll|file|finalize/.test(q))return 'I can prepare a review summary, but accounting posting, payroll export, tax filing and finalization stay behind the existing owner-controlled workflow.';
    if(/deploy|permissions|invite|delete/.test(q))return 'That request changes system access or production state. The assistant will not execute it; use the dedicated administrative control after reviewing the exact target and impact.';
    return 'That request would create an external commitment or modify shared business state. I can explain or prepare the work, but execution must use the existing Business Office control.';
  }

  async function cloudAnswer(args,timeout){
    if(!navigator.onLine)throw new Error('Offline');
    const api=window.H38_SUPABASE_SHARED_CLIENT?.ensure?.();
    if(!api)throw new Error('Supabase client unavailable');
    const sessionResult=await api.auth.getSession();
    if(sessionResult.error)throw sessionResult.error;
    const session=sessionResult.data?.session;
    if(!session?.access_token)throw new Error('Sign in again before using H38 AI.');
    if(api.functions&&typeof api.functions.setAuth==='function')api.functions.setAuth(session.access_token);
    const businessId=text(args?.businessId||window.state?.businessId).trim();
    if(!businessId)throw new Error('Open an authorized business before using H38 AI.');
    const timeoutMs=Math.max(15000,Math.min(Number(timeout)||50000,65000));
    let timer=null;
    try{
      const invoke=api.functions.invoke(ENDPOINT,{
        body:{businessId,question:text(args?.question).trim(),context:safeContext(args||{})},
        headers:{authorization:`Bearer ${session.access_token}`,'x-client-info':'h38-assistant-router-v1'}
      });
      const timed=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('H38 AI timed out.')),timeoutMs);});
      const result=await Promise.race([invoke,timed]);
      if(result?.error)throw new Error(text(result.error.message||result.error));
      const payload=result?.data||{};
      if(payload.status!=='PASS'||!text(payload.answer).trim())throw new Error(text(payload.message||'H38 AI did not return an answer.'));
      return payload;
    }finally{if(timer)clearTimeout(timer);}
  }

  async function ask(args,timeout){
    const question=text(args?.question).trim();
    if(!question)throw new Error('Ask a question first.');
    const conversationId=text(args?.aiConversationId)||`H38-AI-${Date.now()}`;
    if(controlledActionRequest(question)){
      return {
        status:'PASS',aiConversationId:conversationId,answer:controlledActionAnswer(question),provider:'H38 deterministic authority gate',
        specialist:'general',recommendedPage:'',requiresExistingOfficeControl:true,externalActionOccurred:false
      };
    }
    try{
      const cloud=await cloudAnswer(args||{},timeout);
      return {...cloud,aiConversationId:conversationId,externalActionOccurred:false};
    }catch(error){
      return {
        status:'PASS',aiConversationId:conversationId,answer:localAnswer(question,args?.pageKey),provider:'H38 local guidance',
        specialist:'general',recommendedPage:'',requiresExistingOfficeControl:false,externalActionOccurred:false,
        cloudFallbackReason:text(error?.message||error).slice(0,300)
      };
    }
  }

  Bridge.prototype.request=async function(action,args,timeout){
    if(action==='aiAsk')return ask(args||{},timeout);
    if(action==='aiBuildQuoteDraft'){
      return {
        status:'HOLD',
        message:'The Supabase operational app is ready, but a business AI provider is not connected yet. The quote was not changed, approved, or sent.',
        externalActionOccurred:false
      };
    }
    if(action==='aiMeasurePhoto'){
      return {
        status:'HOLD',
        message:'AI photo measuring needs a separately connected business AI provider. The photo and site notes remain available for manual measurement and verification.',
        externalActionOccurred:false
      };
    }
    return previousRequest.call(this,action,args,timeout);
  };

  function personalCommandStaysLocal(command){
    const q=text(command).toLowerCase();
    return /^remind\s+me\b|^remember\b|^note\b|^add(?:\s+a)?\s+task\b|\bevery\s+(day|week|month)\b|\b(daily|weekly|monthly)\b/.test(q)
      || /what.*(today|need|do)|my day|what's next|whats next/.test(q)
      || /reminder|personal task/.test(q)
      || /blocked|stuck|needs attention|follow.?up/.test(q)
      || /^find\s+|^search\s+/.test(q)
      || /receipt|expense|mileage|schedule|calendar|appointment/.test(q);
  }

  function renderRoutedChat(){
    const chat=document.getElementById('paChat');
    if(!chat||!routedChat.length)return;
    chat.querySelectorAll('[data-h38-routed-chat]').forEach(node=>node.remove());
    routedChat.slice(-10).forEach(message=>{
      const bubble=document.createElement('div');
      bubble.className=`pa-bubble ${message.role}`;
      bubble.dataset.h38RoutedChat='1';
      bubble.innerHTML=esc(message.body).replace(/\n/g,'<br>');
      chat.appendChild(bubble);
    });
    chat.scrollTop=chat.scrollHeight;
  }

  async function routePersonalBusinessCommand(form,command){
    routedChat.push({role:'user',body:command});
    renderRoutedChat();
    const state=window.state||{};
    const result=await ask({
      businessId:state.businessId,
      question:command,
      pageKey:state.page,
      aiConversationId:'',
      context:{
        source:'personal-assistant',shell:state.shell,pageKey:state.page,
        businessName:state.snapshot?.business?.businessName||'',roleName:state.snapshot?.user?.roleName||''
      }
    },50000);
    routedChat.push({role:'assistant',body:text(result.answer)});
    renderRoutedChat();
    try{
      if('speechSynthesis'in window){window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text(result.answer).slice(0,1200));window.speechSynthesis.speak(utterance);}
    }catch(_){}
  }

  document.addEventListener('submit',event=>{
    const form=event.target;
    if(!(form instanceof HTMLFormElement)||form.id!=='paCommandForm')return;
    const command=text(new FormData(form).get('command')).trim();
    if(!command||personalCommandStaysLocal(command))return;
    event.preventDefault();
    event.stopImmediatePropagation();
    form.reset();
    routePersonalBusinessCommand(form,command).catch(error=>{
      routedChat.push({role:'assistant',body:`I could not answer that business question: ${text(error?.message||error)}`});
      renderRoutedChat();
    });
  },true);

  function installPersonalObserver(){
    if(personalObserver||!document.documentElement)return;
    personalObserver=new MutationObserver(()=>{if(document.getElementById('paChat'))renderRoutedChat();});
    personalObserver.observe(document.documentElement,{childList:true,subtree:true});
  }
  installPersonalObserver();

  window.H38_ASSISTANT_ROUTER=Object.freeze({
    enabled:true,build:BUILD,endpoint:ENDPOINT,readOnly:true,sharedBusinessGuidance:true,personalRecordsPrivate:true,
    specialistExecution:false,externalActionsEnabled:false,automaticApproval:false,automaticCustomerSending:false,
    automaticPurchasing:false,automaticPayment:false,ask
  });

  window.H38_SUPABASE_AI_FALLBACK={
    enabled:true,
    provider:'local-guidance',
    cloudProviderConnected:false,
    cloudAdvisoryEndpoint:ENDPOINT,
    externalActionsEnabled:false,
    readOnlyCloudAdvisory:true
  };
})();
