(function () {
  'use strict';

  const auth=window.H38_SUPABASE_AUTH;
  const Bridge=window.H38Bridge;
  if(!auth || auth.enabled!==true || !Bridge || !Bridge.prototype)return;

  const previousRequest=Bridge.prototype.request;

  function text(value){return String(value==null?'':value);}
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
    return `H38 AI cloud service is not connected yet. I can still guide the ${page} workflow from the installed app. Use the page forms to save internal work; every external action remains disabled or owner-controlled.`;
  }

  Bridge.prototype.request=async function(action,args,timeout){
    if(action==='aiAsk'){
      return {
        status:'PASS',
        aiConversationId:text(args && args.aiConversationId) || `LOCAL-${Date.now()}`,
        answer:localAnswer(args && args.question,args && args.pageKey),
        provider:'H38 local guidance',
        externalActionOccurred:false
      };
    }
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

  window.H38_SUPABASE_AI_FALLBACK={
    enabled:true,
    provider:'local-guidance',
    cloudProviderConnected:false,
    externalActionsEnabled:false
  };
})();
