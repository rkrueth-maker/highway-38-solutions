(function () {
  'use strict';

  const config = window.H38_BUSINESS_OFFICE_SUPABASE || {};
  const auth = window.H38_SUPABASE_AUTH;
  const Bridge = window.H38Bridge;
  if (!auth || auth.enabled !== true || !Bridge || !Bridge.prototype || !window.supabase) return;

  const previousRequest = Bridge.prototype.request;
  let dbClient = null;

  const COVERED_ACTIONS = new Set([
    'SAVE_PARITY_ENTITY',
    'POST_INVENTORY',
    'RECORD_INSPECTION',
    'SCHEDULE_MAINTENANCE',
    'SAVE_EMAIL_DRAFT',
    'SAVE_SMS_DRAFT',
    'SAVE_PORTAL_MESSAGE',
    'SAVE_VOICE_ITEM'
  ]);

  function client() {
    if (dbClient) return dbClient;
    dbClient = window.supabase.createClient(config.url, config.publishableKey, {
      auth: {persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'},
      global: {headers:{'x-client-info':'highway-38-business-office-operation-coverage'}}
    });
    return dbClient;
  }

  function text(value) { return String(value == null ? '' : value); }
  function number(value) { const parsed=Number(value || 0); return Number.isFinite(parsed) ? parsed : 0; }
  function now() { return new Date().toISOString(); }
  function clean(value) {
    if (Array.isArray(value)) return value.map(clean);
    if (!value || typeof value !== 'object') return value;
    const output={};
    Object.entries(value).forEach(([key,item])=>{
      if (key === '__localPending' || key === 'base64Data' || key === '__h38Record') return;
      output[key]=clean(item);
    });
    return output;
  }

  async function user() {
    const {data,error}=await client().auth.getSession();
    if (error) throw error;
    if (!data.session || !data.session.user) throw new Error('Supabase Auth session is required.');
    return data.session.user;
  }

  async function saveRecord(businessId,collection,recordKey,record) {
    const actor=await user();
    const key=text(recordKey).trim();
    if (!businessId || !collection || !key) throw new Error('Supabase record identity is incomplete.');
    const db=client();
    const {data:existing,error:readError}=await db.from('business_records')
      .select('id').eq('business_id',businessId).eq('collection',collection).eq('record_key',key).maybeSingle();
    if (readError) throw readError;
    if (existing) {
      const {error}=await db.from('business_records').update({payload:clean(record),record_status:'active',updated_by:actor.id})
        .eq('id',existing.id).eq('business_id',businessId);
      if (error) throw error;
    } else {
      const {error}=await db.from('business_records').insert({
        business_id:businessId,collection,record_key:key,payload:clean(record),record_status:'active',created_by:actor.id,updated_by:actor.id
      });
      if (error) throw error;
    }
    return {collection,recordKey:key,record:clean(record)};
  }

  async function proof(operation,saved) {
    try {
      const actor=await user();
      await client().from('business_proof_log').insert({
        business_id:operation.businessId,
        actor_user_id:actor.id,
        action_type:operation.action,
        entity_type:operation.recordType || saved.collection,
        result:'PASS',
        details:{operationId:operation.operationId || operation.id || '',collection:saved.collection,recordKey:saved.recordKey,transport:'supabase-operational-app'},
        external_action_occurred:false
      });
    } catch (error) { console.warn('Proof Log write failed:',error.message || error); }
  }

  async function failure(operation,error) {
    try {
      const actor=await user();
      await client().from('business_error_log').insert({
        business_id:operation.businessId,
        actor_user_id:actor.id,
        source:'commercial-app/supabase-operation-coverage.js',
        error_code:'OPERATION_COVERAGE_FAILED',
        message:text(error && error.message || error).slice(0,4000),
        severity:'error',status:'open',
        context:{operationId:operation.operationId || operation.id || '',action:operation.action || '',recordType:operation.recordType || ''}
      });
    } catch (ignore) {}
  }

  function id(operation,prefix) {
    return text(operation.recordId || operation.operationId || operation.id || `${prefix}-${Date.now()}`);
  }

  async function process(operation) {
    const p=operation.payload || {};
    const businessId=text(operation.businessId);
    const recordId=id(operation,'RECORD');

    if (operation.action === 'SAVE_PARITY_ENTITY') {
      const collection=text(p.entityKey || operation.recordType || 'parityRecords');
      const record=clean(p.record || {});
      return saveRecord(businessId,collection,recordId,record);
    }

    if (operation.action === 'POST_INVENTORY') {
      return saveRecord(businessId,'inventoryTransactions',recordId,{
        'Transaction ID':recordId,'Business ID':businessId,'Item ID':p.itemId,
        'Quantity':number(p.quantity),'Direction':p.direction,'Unit Cost':number(p.unitCost),
        'Job ID':p.jobId,'Reason':p.reason,'Timestamp':operation.localTimestamp || now(),'Record Version':1
      });
    }

    if (operation.action === 'RECORD_INSPECTION') {
      return saveRecord(businessId,'inspections',p.inspectionId || recordId,{
        'Inspection ID':p.inspectionId || recordId,'Business ID':businessId,'Asset ID':p.assetId,
        'Inspection Type':p.inspectionType,'Result':p.result,'Notes':p.notes,
        'Inspection Time':operation.localTimestamp || now(),'Record Version':1
      });
    }

    if (operation.action === 'SCHEDULE_MAINTENANCE') {
      return saveRecord(businessId,'maintenance',p.maintenanceId || recordId,{
        'Maintenance ID':p.maintenanceId || recordId,'Business ID':businessId,'Asset ID':p.assetId,
        'Maintenance Type':p.maintenanceType,'Status':'Scheduled','Priority':p.priority,
        'Due Date':p.dueDate,'Notes':p.notes,'Created Time':operation.localTimestamp || now(),
        'Updated Time':now(),'Record Version':1
      });
    }

    if (operation.action === 'SAVE_EMAIL_DRAFT') {
      const threadId=text(p.emailThreadId || `EMAIL-THREAD-${Date.now()}`);
      const messageId=recordId;
      await saveRecord(businessId,'emailThreads',threadId,{
        'Email Thread ID':threadId,'Business ID':businessId,'Provider':'Provider Neutral',
        'Subject':p.subject,'Status':'Draft','Last Message Time':operation.localTimestamp || now(),'Record Version':1
      });
      return saveRecord(businessId,'emailMessages',messageId,{
        'Email Message ID':messageId,'Business ID':businessId,'Email Thread ID':threadId,
        'Direction':'Outbound Draft','To Addresses JSON':JSON.stringify([p.toAddress]),
        'Subject':p.subject,'Body Preview':p.body,'Status':'Draft — Not Sent',
        'Created Time':operation.localTimestamp || now(),'Record Version':1
      });
    }

    if (operation.action === 'SAVE_SMS_DRAFT') {
      const threadId=text(p.smsThreadId || `SMS-THREAD-${Date.now()}`);
      const messageId=recordId;
      await saveRecord(businessId,'smsThreads',threadId,{
        'SMS Thread ID':threadId,'Business ID':businessId,'Provider':'Provider Neutral',
        'Customer Number':p.toNumber,'Consent Status':p.consentStatus,'Status':'Draft',
        'Last Message Time':operation.localTimestamp || now(),'Record Version':1
      });
      return saveRecord(businessId,'smsMessages',messageId,{
        'SMS Message ID':messageId,'Business ID':businessId,'SMS Thread ID':threadId,
        'Direction':'Outbound Draft','Customer Number':p.toNumber,'Body':p.body,
        'Consent Status':p.consentStatus,'Status':'Draft — Not Sent',
        'Created Time':operation.localTimestamp || now(),'Record Version':1
      });
    }

    if (operation.action === 'SAVE_PORTAL_MESSAGE') {
      const threadId=text(p.portalThreadId || `PORTAL-THREAD-${Date.now()}`);
      const messageId=recordId;
      await saveRecord(businessId,'portalThreads',threadId,{
        'Portal Thread ID':threadId,'Business ID':businessId,'Customer ID':p.customerId,
        'Subject':p.subject,'Status':'Draft — Customer Release Required',
        'Created Time':operation.localTimestamp || now(),'Updated Time':now(),'Record Version':1
      });
      return saveRecord(businessId,'portalMessages',messageId,{
        'Portal Message ID':messageId,'Business ID':businessId,'Portal Thread ID':threadId,
        'Customer ID':p.customerId,'Body':p.body,'Status':'Draft — Not Released',
        'Created Time':operation.localTimestamp || now(),'Record Version':1
      });
    }

    if (operation.action === 'SAVE_VOICE_ITEM') {
      return saveRecord(businessId,'voiceQueue',p.voiceQueueId || recordId,{
        'Voice Queue ID':p.voiceQueueId || recordId,'Business ID':businessId,
        'User ID':auth.getState().userId,'Mode':p.mode,'Transcript':p.transcript,
        'Intent':p.intent,'Risk Level':p.riskLevel,'Review Required':p.reviewRequired,
        'Status':p.reviewRequired === 'Yes' ? 'Review When Parked' : 'Captured',
        'Created Time':operation.localTimestamp || now(),'Updated Time':now(),'Record Version':1
      });
    }

    throw new Error(`${operation.action} is not covered by the Supabase operation adapter.`);
  }

  Bridge.prototype.request=async function(action,args,timeout) {
    if (action === 'aiBuildQuoteDraft') {
      return {status:'HOLD',message:'The Supabase operational app is ready, but a business AI provider is not connected yet. No quote was changed or approved.',externalActionOccurred:false};
    }
    if (action === 'aiMeasurePhoto') {
      return {status:'HOLD',message:'AI photo measuring needs a separately connected business AI provider. The photo and measurement notes remain saved for manual review.',externalActionOccurred:false};
    }
    if (action !== 'completionSync') return previousRequest.call(this,action,args,timeout);

    const operations=Array.isArray(args && args.operations) ? args.operations : [];
    const covered=operations.filter(operation=>COVERED_ACTIONS.has(operation.action));
    const remaining=operations.filter(operation=>!COVERED_ACTIONS.has(operation.action));
    const results=[];

    for (const operation of covered) {
      try {
        const saved=await process(operation);
        await proof(operation,saved);
        results.push({operationId:operation.operationId || operation.id,status:'SYNCED',recordType:operation.recordType,recordId:saved.recordKey});
      } catch (error) {
        await failure(operation,error);
        results.push({operationId:operation.operationId || operation.id,status:'FAILED',message:text(error && error.message || error)});
      }
    }

    if (remaining.length) {
      const response=await previousRequest.call(this,'completionSync',Object.assign({},args,{operations:remaining}),timeout);
      results.push(...(response.results || []));
    }

    return {status:'PASS',transport:'supabase-operational-app',results,externalActionOccurred:false};
  };
})();
