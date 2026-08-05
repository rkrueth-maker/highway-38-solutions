(function () {
  'use strict';

  const config = window.H38_BUSINESS_OFFICE_SUPABASE || {};
  const auth = window.H38_SUPABASE_AUTH;
  const Bridge = window.H38Bridge;
  if (!auth || auth.enabled !== true || !Bridge || !Bridge.prototype || !window.supabase) return;

  const STORAGE_BUCKET = 'business-office-files';
  const MAX_RECORDS = 5000;
  const ROLE_ROWS = [
    {'Role ID':'owner','Role Name':'Owner'},
    {'Role ID':'administrator','Role Name':'Administrator'},
    {'Role ID':'staff','Role Name':'Staff'},
    {'Role ID':'viewer','Role Name':'Viewer'}
  ];
  const DEFAULT_PROVIDERS = [
    {'Provider ID':'email','Provider Type':'email','Provider Name':'Email','Connection Status':'Not Connected'},
    {'Provider ID':'sms','Provider Type':'sms','Provider Name':'Business SMS','Connection Status':'Not Connected'},
    {'Provider ID':'social','Provider Type':'social','Provider Name':'Social publishing','Connection Status':'Not Connected'},
    {'Provider ID':'ai','Provider Type':'ai','Provider Name':'Cloud AI','Connection Status':'Not Connected'}
  ];
  const DEFAULT_QUICK_ACTIONS = [
    {'Quick Action ID':'TASK','Label':'Assign task','Page Key':'work'},
    {'Quick Action ID':'QUOTE','Label':'Build quote','Page Key':'quotes'},
    {'Quick Action ID':'SCHEDULE','Label':'Schedule work','Page Key':'schedule'},
    {'Quick Action ID':'FIELD','Label':'Daily field log','Page Key':'field'},
    {'Quick Action ID':'FILES','Label':'Add photos or files','Page Key':'documents'}
  ];
  const DEFAULT_AI_KNOWLEDGE = [
    {'Knowledge ID':'TASKS','Topic':'tasks','Title':'Task assignment','Content':'Open Work & Tasks, choose a job and active business user, add a due time, then save. Tasks synchronize to the active Supabase business and never notify customers automatically.'},
    {'Knowledge ID':'OFFLINE','Topic':'offline','Title':'Offline work','Content':'Work created without service stays in the user-scoped device queue. Reconnect and press Sync to write it to the active Supabase business.'},
    {'Knowledge ID':'SAFETY','Topic':'approvals','Title':'Owner controls','Content':'Quotes, messages, payments, purchases, social posts and other external actions remain drafts or records until separately reviewed and explicitly authorized.'}
  ];

  let dataClient = null;
  let installPrompt = null;
  const originalConnect = Bridge.prototype.connect;
  const originalRequest = Bridge.prototype.request;

  function client() {
    if (dataClient) return dataClient;
    dataClient = window.supabase.createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce'
      },
      global: { headers: { 'x-client-info': 'highway-38-business-office-operational-app' } }
    });
    return dataClient;
  }

  function clean(value) {
    if (Array.isArray(value)) return value.map(clean);
    if (!value || typeof value !== 'object') return value;
    const output = {};
    Object.entries(value).forEach(([key, item]) => {
      if (key === '__localPending' || key === 'base64Data') return;
      output[key] = clean(item);
    });
    return output;
  }

  function text(value) { return String(value == null ? '' : value); }
  function number(value) { const parsed = Number(value || 0); return Number.isFinite(parsed) ? parsed : 0; }
  function isoNow() { return new Date().toISOString(); }
  function selectedBusinessId(args) {
    return text(args && args.businessId || auth.getState().selectedBusinessId || window.state?.businessId).trim();
  }
  function normalizeRole(value) {
    const role = text(value).toLowerCase();
    return ['owner','administrator','staff','viewer'].includes(role) ? role : 'viewer';
  }
  function legacyId(record, keys) {
    for (const key of keys || []) {
      if (record && record[key] != null && text(record[key]).trim()) return text(record[key]).trim();
    }
    return '';
  }
  function activeSnapshotRecord(collection, recordKey) {
    const rows = window.state?.snapshot?.[collection] || [];
    return rows.find(row => legacyId(row, idKeysFor(collection)) === text(recordKey)) || null;
  }
  function idKeysFor(collection) {
    const map = {
      customers:['Customer ID','customerId'], properties:['Property ID','propertyId'], requests:['Request ID','requestId'],
      jobs:['Job ID','jobId'], tasks:['Task ID','taskId'], scheduleEvents:['Schedule Event ID','scheduleEventId'],
      conversations:['Conversation ID','conversationId'], messages:['Message ID','messageId'],
      emailThreads:['Email Thread ID','emailThreadId'], emailMessages:['Email Message ID','emailMessageId'],
      smsThreads:['SMS Thread ID','smsThreadId'], smsMessages:['SMS Message ID','smsMessageId'],
      portalThreads:['Portal Thread ID','portalThreadId'], portalMessages:['Portal Message ID','portalMessageId'],
      quotes:['Quote ID','quoteId'], measurements:['Measurement ID','measurementId'],
      inventoryTransactions:['Transaction ID','transactionId'], materialRequests:['Material Request ID','materialRequestId'],
      assets:['Asset ID','assetId'], assignments:['Assignment ID','assignmentId'], maintenance:['Maintenance ID','maintenanceId'],
      inspections:['Inspection ID','inspectionId'], timeEntries:['Time Entry ID','timeEntryId'], jobNotes:['Job Note ID','jobNoteId'],
      dailyLogs:['Daily Log ID','dailyLogId'], checklists:['Checklist ID','checklistId'], changeOrders:['Change Order ID','changeOrderId'],
      payments:['Payment ID','paymentId'], invoices:['Invoice ID','invoiceId'], expenses:['Expense ID','expenseId'],
      documents:['Document ID','documentId'], socialPosts:['Social Post ID','socialPostId'], socialMetrics:['Social Metric ID','socialMetricId'],
      campaigns:['Campaign ID','campaignId'], featureRequests:['Feature Request ID','featureRequestId'],
      aiRecommendations:['Recommendation ID','recommendationId'], usageLogs:['Usage Log ID','usageLogId']
    };
    return map[collection] || ['id'];
  }

  async function sessionUser() {
    const { data, error } = await client().auth.getSession();
    if (error) throw error;
    if (!data.session || !data.session.user) throw new Error('Supabase Auth session is required.');
    return data.session.user;
  }

  async function optionalQuery(promise, fallback) {
    try {
      const response = await promise;
      if (response.error) throw response.error;
      return response.data || fallback;
    } catch (error) {
      console.warn('Optional Supabase Business Office query:', error.message || error);
      return fallback;
    }
  }

  async function hydrateSnapshot(baseSnapshot, businessId) {
    const snapshot = Object.assign({}, baseSnapshot || {});
    const db = client();
    const [recordRows, memberships, priceRows, approvals, proofRows, errorRows, modules] = await Promise.all([
      optionalQuery(db.from('business_records').select('collection,record_key,payload,updated_at').eq('business_id', businessId).eq('record_status','active').order('updated_at',{ascending:false}).range(0,MAX_RECORDS-1), []),
      optionalQuery(db.from('business_memberships').select('id,auth_user_id,invited_email,role,status,accepted_at').eq('business_id',businessId).in('status',['active','invited']).order('created_at',{ascending:true}), []),
      optionalQuery(db.from('price_book_items').select('id,item_code,category,description,unit,unit_cost,source_type,source_note,approval_status,active,updated_at').eq('business_id',businessId).eq('active',true).order('category').order('description').range(0,999), []),
      optionalQuery(db.from('business_approvals').select('*').eq('business_id',businessId).order('requested_at',{ascending:false}).limit(250), []),
      optionalQuery(db.from('business_proof_log').select('*').eq('business_id',businessId).order('created_at',{ascending:false}).limit(500), []),
      optionalQuery(db.from('business_error_log').select('*').eq('business_id',businessId).order('created_at',{ascending:false}).limit(250), []),
      optionalQuery(db.from('business_module_settings').select('module_key,enabled,config').eq('business_id',businessId).order('module_key'), [])
    ]);

    recordRows.forEach(row => {
      if (!snapshot[row.collection]) snapshot[row.collection] = [];
      snapshot[row.collection].push(clean(row.payload));
    });

    snapshot.users = memberships.map(row => ({
      'User ID': row.auth_user_id || row.id,
      'Display Name': row.invited_email,
      'Email': row.invited_email,
      'Role ID': row.role,
      'Status': row.status === 'active' ? 'Active' : 'Invited',
      'Accepted Time': row.accepted_at || ''
    }));
    snapshot.roles = ROLE_ROWS.slice();
    snapshot.providers = Array.isArray(snapshot.providers) && snapshot.providers.length ? snapshot.providers : DEFAULT_PROVIDERS.slice();
    snapshot.quickActions = Array.isArray(snapshot.quickActions) && snapshot.quickActions.length ? snapshot.quickActions : DEFAULT_QUICK_ACTIONS.slice();
    snapshot.aiKnowledge = Array.isArray(snapshot.aiKnowledge) && snapshot.aiKnowledge.length ? snapshot.aiKnowledge : DEFAULT_AI_KNOWLEDGE.slice();
    snapshot.priceBook = priceRows.map(row => ({
      'Item ID': row.id,
      'SKU': row.item_code,
      'Category': row.category,
      'Description': row.description,
      'Unit of Measure': row.unit,
      'Purchase Cost': number(row.unit_cost),
      'Selling Price': number(row.unit_cost),
      'Source Type': row.source_type,
      'Source Note': row.source_note || '',
      'Approval Status': row.approval_status,
      'Updated Time': row.updated_at
    }));
    snapshot.approvals = approvals.map(row => ({
      'Approval ID':row.id,'Entity Type':row.entity_type,'Entity ID':row.entity_id || '',
      'Action Type':row.action_type,'Status':row.status,'Requested By':row.requested_by || '',
      'Reviewed By':row.reviewed_by || '','Requested Time':row.requested_at,'Reviewed Time':row.reviewed_at || '',
      'Notes':row.notes || '','External Action Allowed':row.external_action_allowed === true
    }));
    snapshot.proofLog = proofRows.map(row => ({
      'Proof ID':row.id,'Action Type':row.action_type,'Entity Type':row.entity_type || '',
      'Entity ID':row.entity_id || '','Result':row.result,'Details':row.details || {},
      'External Action Occurred':row.external_action_occurred === true,'Created Time':row.created_at
    }));
    snapshot.errorLog = errorRows.map(row => ({
      'Error ID':row.id,'Source':row.source,'Error Code':row.error_code || '',
      'Message':row.message,'Severity':row.severity,'Status':row.status,
      'Context':row.context || {},'Created Time':row.created_at
    }));
    snapshot.moduleSettings = modules.map(row => ({moduleKey:row.module_key,enabled:row.enabled,config:row.config || {}}));
    snapshot.modules = modules.filter(row => row.enabled).map(row => row.module_key);
    snapshot.fullRefreshPending = false;
    snapshot.startupMode = 'SUPABASE_OPERATIONAL_APP';
    snapshot.version = 'supabase-operational-week-one';
    snapshot.schemaVersion = 'business-office-operational-v1';
    snapshot.cachedAt = isoNow();
    return snapshot;
  }

  async function saveRecord(businessId, collection, recordKey, record) {
    const user = await sessionUser();
    const db = client();
    const key = text(recordKey).trim();
    if (!businessId || !collection || !key) throw new Error('Supabase record identity is incomplete.');
    const payload = clean(record || {});
    const { data: existing, error: readError } = await db.from('business_records')
      .select('id').eq('business_id',businessId).eq('collection',collection).eq('record_key',key).maybeSingle();
    if (readError) throw readError;
    if (existing) {
      const { error } = await db.from('business_records').update({payload,record_status:'active',updated_by:user.id})
        .eq('id',existing.id).eq('business_id',businessId);
      if (error) throw error;
    } else {
      const { error } = await db.from('business_records').insert({
        business_id:businessId,collection,record_key:key,payload,record_status:'active',created_by:user.id,updated_by:user.id
      });
      if (error) throw error;
    }
    return payload;
  }

  async function recordProof(businessId, operation, collection, recordKey) {
    const user = await sessionUser();
    const { error } = await client().from('business_proof_log').insert({
      business_id:businessId,
      actor_user_id:user.id,
      action_type:text(operation.action || 'SAVE_BUSINESS_RECORD'),
      entity_type:text(operation.recordType || collection || 'Business Record'),
      result:'PASS',
      details:{operationId:operation.operationId || operation.id || '',collection:collection || '',recordKey:recordKey || '',transport:'supabase-operational-app'},
      external_action_occurred:false
    });
    if (error) console.warn('Proof Log write failed:', error.message || error);
  }

  async function recordFailure(businessId, operation, error) {
    try {
      const user = await sessionUser();
      await client().from('business_error_log').insert({
        business_id:businessId,actor_user_id:user.id,source:'commercial-app/supabase-data.js',
        error_code:'OPERATION_SYNC_FAILED',message:text(error && error.message || error).slice(0,4000),severity:'error',status:'open',
        context:{operationId:operation.operationId || operation.id || '',action:operation.action || '',recordType:operation.recordType || ''}
      });
    } catch (ignore) {}
  }

  function makeRecord(operation, collection, record) {
    const output = clean(record || {});
    const key = legacyId(output,idKeysFor(collection)) || text(operation.recordId || operation.operationId || operation.id);
    return {collection,recordKey:key,record:output};
  }

  function legacyOperationRecord(operation) {
    const p = operation.payload || {};
    const id = text(operation.recordId || operation.operationId || operation.id);
    if (p.__h38Record && p.__h38Record.collection && p.__h38Record.record) {
      return makeRecord(operation,p.__h38Record.collection,p.__h38Record.record);
    }
    switch (operation.action) {
      case 'SAVE_CUSTOMER': return makeRecord(operation,'customers',{'Customer ID':p.customerId || id,'Business ID':operation.businessId,'Customer Name':p.customerName,'Email':p.email,'Phone':p.phone,'Status':'Active','Created Time':operation.localTimestamp || isoNow(),'Updated Time':isoNow(),'Record Version':1});
      case 'SAVE_PROPERTY': return makeRecord(operation,'properties',{'Property ID':p.propertyId || id,'Business ID':operation.businessId,'Customer ID':p.customerId,'Property Name':p.propertyName || p.address,'Address':p.address,'Status':'Active','Created Time':operation.localTimestamp || isoNow(),'Updated Time':isoNow(),'Record Version':1});
      case 'SAVE_REQUEST': return makeRecord(operation,'requests',{'Request ID':p.requestId || id,'Business ID':operation.businessId,'Customer ID':p.customerId,'Source':p.source,'Subject':p.subject,'Details':p.details,'Priority':p.priority,'Status':'New','Created Time':operation.localTimestamp || isoNow(),'Updated Time':isoNow(),'Record Version':1});
      case 'SAVE_JOB': return makeRecord(operation,'jobs',{'Job ID':p.jobId || id,'Business ID':operation.businessId,'Customer ID':p.customerId,'Job Number':`H38-${Date.now()}`,'Project Title':p.projectTitle,'Status':p.status || 'Lead','Created Time':operation.localTimestamp || isoNow(),'Updated Time':isoNow(),'Record Version':1});
      case 'SAVE_TASK': return makeRecord(operation,'tasks',{'Task ID':p.taskId || id,'Business ID':operation.businessId,'Job ID':p.jobId,'Task Title':p.taskTitle,'Assigned User ID':p.assignedUserId,'Priority':p.priority || 'Normal','Status':p.status || 'Open','Due Time':p.dueTime,'Created Time':operation.localTimestamp || isoNow(),'Updated Time':isoNow(),'Record Version':1});
      case 'SAVE_SCHEDULE': return makeRecord(operation,'scheduleEvents',{'Schedule Event ID':p.scheduleEventId || id,'Business ID':operation.businessId,'Event Type':'Job','Title':p.title,'Related Record Type':p.relatedRecordType || 'Job','Related Record ID':p.relatedRecordId,'Assigned User ID':p.assignedUserId,'Start Time':p.startTime,'End Time':p.endTime,'Location':p.location,'Status':p.status || 'Scheduled','Notes':p.notes,'Created Time':operation.localTimestamp || isoNow(),'Updated Time':isoNow(),'Record Version':1});
      case 'CREATE_CONVERSATION': return makeRecord(operation,'conversations',{'Conversation ID':id,'Business ID':operation.businessId,'Conversation Type':p.conversationType,'Subject':p.subject,'Participant IDs JSON':JSON.stringify(p.participantUserIds || []),'Status':'Active','Created Time':operation.localTimestamp || isoNow(),'Updated Time':isoNow(),'Record Version':1});
      case 'SEND_INTERNAL_MESSAGE': return makeRecord(operation,'messages',{'Message ID':id,'Business ID':operation.businessId,'Conversation ID':p.conversationId,'Sender User ID':auth.getState().userId,'Message Type':'Text','Body':p.body,'Status':'Sent Internal','Created Time':operation.localTimestamp || isoNow(),'Record Version':1});
      case 'SAVE_MEASUREMENT': return makeRecord(operation,'measurements',{'Measurement ID':p.measurementId || id,'Business ID':operation.businessId,'Job ID':p.jobId,'Quote ID':p.quoteId,'Measurement Name':p.measurementName,'Measurement Type':p.measurementType,'Value':number(p.value),'Unit':p.unit,'Method':p.method,'Confidence':p.confidence,'Reference Size':number(p.referenceSize),'Reference Unit':p.referenceUnit,'Notes':p.notes,'Status':'Active','Created By':auth.getState().userId,'Created Time':operation.localTimestamp || isoNow(),'Updated Time':isoNow(),'Record Version':1});
      case 'SAVE_QUOTE': {
        const lines = Array.isArray(p.lines) ? p.lines : [];
        const total = lines.reduce((sum,line)=>sum+number(line.quantity)*number(line.unitPrice),0);
        return makeRecord(operation,'quotes',{'Quote ID':p.quoteId || id,'Business ID':operation.businessId,'Customer ID':p.customerId,'Quote Number':`H38-${Date.now()}`,'Project Title':p.projectTitle,'Scope':p.scope,'Measurement Notes':p.measurementNotes,'Status':'Draft','Revision':1,'Subtotal':total,'Tax':number(p.tax),'Total':total+number(p.tax),'Created Time':operation.localTimestamp || isoNow(),'Updated Time':isoNow(),'Record Version':1,lines});
      }
      case 'SAVE_ENTITY': return makeRecord(operation,text(p.entity || 'actionQueue'),p.record || {'Record ID':id,...p});
      case 'RECORD_TIME': return makeRecord(operation,'timeEntries',{'Time Entry ID':p.timeEntryId || id,'Business ID':operation.businessId,'User ID':auth.getState().userId,'Job ID':p.jobId,'Start Time':p.startTime,'End Time':p.endTime,'Break Minutes':number(p.breakMinutes),'Hours':p.startTime&&p.endTime?Math.max(0,(new Date(p.endTime)-new Date(p.startTime))/3600000-number(p.breakMinutes)/60):0,'Status':'Recorded','Notes':p.notes,'Created Time':operation.localTimestamp || isoNow(),'Updated Time':isoNow(),'Record Version':1});
      case 'SAVE_INVOICE': return makeRecord(operation,'invoices',{'Invoice ID':p.invoiceId || id,'Business ID':operation.businessId,'Customer ID':p.customerId,'Job ID':p.jobId,'Invoice Number':`H38-${Date.now()}`,'Status':'Draft','Due Date':p.dueDate,'Subtotal':(p.lines || []).reduce((sum,line)=>sum+number(line.quantity)*number(line.unitPrice),0),'Tax':number(p.tax),'Total':(p.lines || []).reduce((sum,line)=>sum+number(line.quantity)*number(line.unitPrice),0)+number(p.tax),'Balance':(p.lines || []).reduce((sum,line)=>sum+number(line.quantity)*number(line.unitPrice),0)+number(p.tax),'Created Time':operation.localTimestamp || isoNow(),'Updated Time':isoNow(),'Record Version':1});
      case 'SAVE_EXPENSE': return makeRecord(operation,'expenses',{'Expense ID':p.expenseId || id,'Business ID':operation.businessId,'Job ID':p.jobId,'Category':p.category,'Description':p.description,'Expense Date':p.expenseDate,'Amount':number(p.amount),'Status':'Recorded','Created Time':operation.localTimestamp || isoNow(),'Updated Time':isoNow(),'Record Version':1});
      case 'RECORD_PAYMENT': return makeRecord(operation,'payments',{'Payment ID':id,'Business ID':operation.businessId,'Invoice ID':p.invoiceId,'Amount':number(p.amount),'Method':p.method,'Reference':p.reference,'Status':'Manually Recorded — No Money Moved','Created Time':operation.localTimestamp || isoNow(),'Record Version':1});
      case 'SAVE_SOCIAL_POST': return makeRecord(operation,'socialPosts',{'Social Post ID':p.socialPostId || id,'Business ID':operation.businessId,'Campaign ID':p.campaignId,'Platform':p.platform,'Title':p.title,'Body':p.body,'Link URL':p.linkUrl,'Status':p.scheduledTime?'Draft Scheduled — Approval Required':'Draft','Scheduled Time':p.scheduledTime,'Created By':auth.getState().userId,'Created Time':operation.localTimestamp || isoNow(),'Updated Time':isoNow(),'Record Version':1});
      case 'SAVE_CAMPAIGN': return makeRecord(operation,'campaigns',{'Campaign ID':p.campaignId || id,'Business ID':operation.businessId,'Campaign Name':p.campaignName,'Campaign Type':'Organic','Start Date':p.startDate,'End Date':p.endDate,'Status':'Active','Goal':p.goal,'Created Time':operation.localTimestamp || isoNow(),'Updated Time':isoNow(),'Record Version':1});
      case 'RECORD_SOCIAL_METRIC': return makeRecord(operation,'socialMetrics',{'Social Metric ID':id,'Business ID':operation.businessId,'Social Post ID':p.socialPostId,'Platform':p.platform || 'Manual','Metric Date':p.metricDate,'Reach':number(p.reach),'Engagements':number(p.engagements),'Leads':number(p.leads),'Revenue':number(p.revenue),'Source':p.source || 'Manual','Created Time':operation.localTimestamp || isoNow(),'Record Version':1});
      case 'SAVE_FEATURE_REQUEST': return makeRecord(operation,'featureRequests',{'Feature Request ID':p.featureRequestId || id,'Business ID':operation.businessId,'Requested By':auth.getState().userId,'Page Key':p.pageKey,'User Role':window.state?.snapshot?.user?.roleName || '','Title':p.title,'Problem':p.problem,'Current Workaround':p.currentWorkaround,'Frequency':p.frequency,'Proposed Action':p.proposedAction,'Status':'Open','Created Time':operation.localTimestamp || isoNow(),'Updated Time':isoNow(),'Record Version':1});
      case 'RECORD_USAGE_EVENT': return makeRecord(operation,'usageLogs',{'Usage Log ID':id,'Business ID':operation.businessId,'Page Key':p.pageKey,'Action Key':p.actionKey,'Device ID':p.deviceId,'Metadata':p.metadata || {},'Created Time':operation.localTimestamp || isoNow()});
      default: return null;
    }
  }

  async function updateExistingRecord(operation, collection, recordKey, changes) {
    const existing = activeSnapshotRecord(collection,recordKey) || {};
    const merged = Object.assign({},clean(existing),clean(changes),{'Updated Time':isoNow()});
    if (!legacyId(merged,idKeysFor(collection))) merged[idKeysFor(collection)[0]] = recordKey;
    await saveRecord(operation.businessId,collection,recordKey,merged);
    return {collection,recordKey,record:merged};
  }

  function safePathPart(value, fallback) {
    const result = text(value).trim().replace(/[^A-Za-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,100);
    return result || fallback;
  }

  function base64Bytes(base64) {
    const binary = atob(text(base64));
    const bytes = new Uint8Array(binary.length);
    for (let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
    return bytes;
  }

  async function uploadAttachment(operation) {
    const p = operation.payload || {};
    if (!p.base64Data) throw new Error('Attachment data is missing from the offline queue.');
    const fileName = safePathPart(p.fileName,'file');
    const path = [operation.businessId,safePathPart(p.relatedRecordType,'record'),safePathPart(p.relatedRecordId,'unlinked'),`${safePathPart(p.attachmentId || p.id || operation.recordId,'attachment')}-${fileName}`].join('/');
    const { error } = await client().storage.from(STORAGE_BUCKET).upload(path,base64Bytes(p.base64Data),{contentType:p.mimeType || 'application/octet-stream',upsert:true,cacheControl:'3600'});
    if (error) throw error;
    const record = {
      'Document ID':p.attachmentId || p.id || operation.recordId,
      'Business ID':operation.businessId,
      'File Name':p.fileName,
      'Mime Type':p.mimeType,
      'File Size':p.fileSize,
      'Source Type':p.relatedRecordType,
      'Source ID':p.relatedRecordId,
      'Access Classification':p.visibility || 'Internal',
      'Storage Bucket':STORAGE_BUCKET,
      'Storage Path':path,
      'Status':'Available — Private',
      'Created Time':p.captureTime || operation.localTimestamp || isoNow(),
      'Updated Time':isoNow(),
      'Record Version':1
    };
    await saveRecord(operation.businessId,'documents',record['Document ID'],record);
    try {
      const local = await window.H38DB.get('attachments',p.id || p.attachmentId);
      if (local) await window.H38DB.put('attachments',Object.assign({},local,{syncStatus:'SYNCED',storagePath:path,base64Data:''}));
    } catch (ignore) {}
    return {collection:'documents',recordKey:record['Document ID'],record};
  }

  async function saveMembership(operation) {
    const p = operation.payload || {};
    const user = await sessionUser();
    const email = text(p.email).trim().toLowerCase();
    if (!email) throw new Error('User email is required.');
    const { error } = await client().from('business_memberships').insert({
      business_id:operation.businessId,auth_user_id:null,invited_email:email,role:normalizeRole(p.roleId),status:'invited',invited_by:user.id
    });
    if (error && !/duplicate|unique/i.test(error.message || '')) throw error;
    return {collection:'users',recordKey:email,record:{'User ID':email,'Display Name':p.displayName || email,'Email':email,'Role ID':normalizeRole(p.roleId),'Status':'Invited'}};
  }

  async function processOperation(operation) {
    if (operation.action === 'SAVE_ATTACHMENT') return uploadAttachment(operation);
    if (operation.action === 'SAVE_USER') return saveMembership(operation);
    if (operation.action === 'ASSIGN_ASSET') return updateExistingRecord(operation,'assets',operation.payload.assetId,{'Assigned Job ID':operation.payload.jobId,'Availability':'Assigned','Condition Out':operation.payload.conditionOut});
    if (operation.action === 'RETURN_ASSET') return updateExistingRecord(operation,'assets',operation.payload.assetId,{'Assigned Job ID':'','Availability':'Available','Condition In':operation.payload.conditionIn});
    if (operation.action === 'REQUEST_SOCIAL_REVIEW') return updateExistingRecord(operation,'socialPosts',operation.payload.socialPostId,{'Status':'Review Requested — Owner Action Required'});
    if (operation.action === 'APPROVE_SOCIAL_POST') return updateExistingRecord(operation,'socialPosts',operation.payload.socialPostId,{'Status':'Owner Approved — Manual Posting Only','Approved By':auth.getState().userId,'Approved Time':isoNow()});
    if (operation.action === 'MARK_SOCIAL_POSTED') return updateExistingRecord(operation,'socialPosts',operation.payload.socialPostId,{'Status':'Manually Posted','Public URL':operation.payload.publicUrl,'Published Time':operation.payload.publishedTime});
    const normalized = legacyOperationRecord(operation);
    if (!normalized) throw new Error(`${operation.action} is not yet mapped to Supabase operational records.`);
    await saveRecord(operation.businessId,normalized.collection,normalized.recordKey,normalized.record);
    return normalized;
  }

  async function synchronize(operations) {
    const results = [];
    for (const operation of operations || []) {
      try {
        const businessId = text(operation.businessId);
        if (!businessId || businessId !== auth.getState().selectedBusinessId) throw new Error('Operation business does not match the active Supabase membership.');
        const saved = await processOperation(operation);
        await recordProof(businessId,operation,saved.collection,saved.recordKey);
        results.push({operationId:operation.operationId || operation.id,status:'SYNCED',recordType:operation.recordType,recordId:saved.recordKey});
      } catch (error) {
        await recordFailure(operation.businessId,operation,error);
        results.push({operationId:operation.operationId || operation.id,status:'FAILED',message:text(error && error.message || error)});
      }
    }
    return {status:'PASS',transport:'supabase-operational-app',results,externalActionOccurred:false};
  }

  Bridge.prototype.request = async function (action, args, timeout) {
    if (action === 'completionSync') return synchronize(args && args.operations || []);
    if (action === 'fullStartupRefresh' || action === 'completionBootstrap') {
      const base = await originalRequest.call(this,action,args,timeout);
      return hydrateSnapshot(base,selectedBusinessId(args));
    }
    if (action === 'aiRecommendationDecision') {
      const businessId = selectedBusinessId(args);
      const id = text(args && args.recommendationId);
      const status = args && args.decision === 'POSTPONE' ? 'Postponed' : args && args.decision === 'DISMISS' ? 'Dismissed' : 'Applied — Internal Only';
      const saved = await updateExistingRecord({businessId,payload:{},action:'AI_RECOMMENDATION_DECISION',recordType:'AI Recommendation'},'aiRecommendations',id,{'Status':status,'Decision Time':isoNow()});
      await recordProof(businessId,{action:'AI_RECOMMENDATION_DECISION',recordType:'AI Recommendation',recordId:id},saved.collection,id);
      return {status:'PASS',recommendationId:id,decision:args.decision,externalActionOccurred:false};
    }
    return originalRequest.call(this,action,args,timeout);
  };

  Bridge.prototype.connect = async function () {
    const result = await originalConnect.apply(this,arguments);
    const businessId = auth.getState().selectedBusinessId;
    if (this.ready && businessId && window.state?.snapshot) {
      try {
        const hydrated = await hydrateSnapshot(window.state.snapshot,businessId);
        await this.onFullSnapshot(hydrated,businessId);
      } catch (error) {
        console.warn('Supabase operational hydration:',error.message || error);
      }
    }
    return result;
  };

  const legacyQueueOperation = window.queueOperation;
  if (typeof legacyQueueOperation === 'function') {
    const decoratedQueueOperation = async function (action,recordType,recordId,payload,optimistic,autoSync) {
      const decorated = Object.assign({},payload || {});
      if (optimistic && optimistic.collection && optimistic.record) {
        decorated.__h38Record = {
          collection:optimistic.collection,
          recordKey:legacyId(optimistic.record,optimistic.idKeys || idKeysFor(optimistic.collection)) || text(recordId),
          record:clean(optimistic.record),
          idKeys:optimistic.idKeys || idKeysFor(optimistic.collection)
        };
      }
      return legacyQueueOperation(action,recordType,recordId,decorated,optimistic,autoSync);
    };
    window.queueOperation = decoratedQueueOperation;
    try { queueOperation = decoratedQueueOperation; } catch (ignore) {}
  }

  function queueRecord(collection,record,recordType) {
    const key = legacyId(record,idKeysFor(collection));
    return window.queueOperation('SAVE_ENTITY',recordType || collection,key,{entity:collection,record},{collection,record,idKeys:idKeysFor(collection)});
  }

  function enhanceToday() {
    const grid = document.querySelector('#mainContent .grid');
    if (!grid || document.getElementById('supabaseAssignedTasks')) return;
    const currentUser = auth.getState().userId;
    const tasks = (window.state.snapshot.tasks || []).filter(row => {
      const status = text(row['Status']).toUpperCase();
      return !['DONE','COMPLETE','CANCELLED','CLOSED'].includes(status) && (!row['Assigned User ID'] || row['Assigned User ID'] === currentUser);
    }).slice(0,12);
    const card = document.createElement('section');
    card.id='supabaseAssignedTasks';card.className='card span7';
    card.innerHTML=`<h2>Assigned tasks</h2><div class="list">${tasks.length?tasks.map(row=>`<div class="row"><div class="row-top"><strong>${window.esc(row['Task Title'])}</strong>${window.pill(row['Status'] || 'Open')}</div><small>${window.esc(window.jobName(row['Job ID']))} · ${window.dateTime(row['Due Time'])}</small></div>`).join(''):window.empty('No open tasks assigned to you.')}</div><div class="actions"><button id="openTaskAssignment">Assign or update tasks</button></div>`;
    grid.appendChild(card);
    document.getElementById('openTaskAssignment').onclick=()=>window.openPage('work');
  }

  function enhanceWork() {
    const title = document.querySelector('#mainContent .page-head h1');
    if (title) title.textContent='Work & Task Assignment';
    const grid = document.querySelector('#mainContent .grid');
    if (!grid || document.getElementById('supabaseTaskBoard')) return;
    const tasks = window.state.snapshot.tasks || [];
    const jobs = window.state.snapshot.jobs || [];
    const taskBoard = document.createElement('section');
    taskBoard.id='supabaseTaskBoard';taskBoard.className='card';
    taskBoard.innerHTML=`<h2>Task board and punch list</h2><div class="list">${tasks.length?tasks.slice(0,100).map(row=>{const id=legacyId(row,idKeysFor('tasks'));return`<div class="row"><div class="row-top"><strong>${window.esc(row['Task Title'])}</strong>${window.pill(row['Status'] || 'Open')}</div><small>${window.esc(window.jobName(row['Job ID']))} · ${window.esc(window.userName(row['Assigned User ID']))} · ${window.dateTime(row['Due Time'])}</small><div class="row-actions"><button data-task-state="Started" data-task-id="${window.esc(id)}">Start</button><button data-task-state="Blocked" data-task-id="${window.esc(id)}">Block</button><button data-task-state="Complete" data-task-id="${window.esc(id)}">Complete</button></div></div>`;}).join(''):window.empty('No tasks yet. Use Assign task above.')}</div>`;
    grid.appendChild(taskBoard);
    taskBoard.querySelectorAll('[data-task-state]').forEach(button=>button.onclick=async()=>{
      const row=tasks.find(item=>legacyId(item,idKeysFor('tasks'))===button.dataset.taskId);if(!row)return;
      const updated=Object.assign({},row,{'Status':button.dataset.taskState,'Updated Time':isoNow()});
      await queueRecord('tasks',updated,'Task');window.toast('Task status queued.');window.renderWork();
    });

    const checklist = document.createElement('section');
    checklist.id='supabaseChecklist';checklist.className='card span6';
    checklist.innerHTML=`<h2>Job checklist</h2><form id="supabaseChecklistForm"><label>Job</label><select name="jobId">${window.optionRows(jobs,['Job ID'],row=>`${row['Job Number'] || ''} — ${row['Project Title'] || ''}`,'Select job')}</select><label>Checklist name</label><input name="title" required placeholder="Arrival, closeout, punch list…"><label>Items — one per line</label><textarea name="items" required></textarea><div class="actions"><button>Create checklist</button></div></form><div class="list">${(window.state.snapshot.checklists || []).slice(0,30).map(row=>`<div class="row"><div class="row-top"><strong>${window.esc(row['Title'])}</strong>${window.pill(row['Status'] || 'Open')}</div><small>${window.esc(window.jobName(row['Job ID']))} · ${(row['Items'] || []).length} items</small></div>`).join('') || window.empty('No checklists.')}</div>`;
    grid.appendChild(checklist);
    document.getElementById('supabaseChecklistForm').onsubmit=async event=>{event.preventDefault();const data=new FormData(event.currentTarget),id=window.newId('CHECKLIST'),record={'Checklist ID':id,'Business ID':window.state.businessId,'Job ID':data.get('jobId'),'Title':text(data.get('title')).trim(),'Items':text(data.get('items')).split(/\r?\n/).map(item=>item.trim()).filter(Boolean).map(item=>({text:item,complete:false})),'Status':'Open','Created By':auth.getState().userId,'Created Time':isoNow(),'Updated Time':isoNow(),'Record Version':1};await queueRecord('checklists',record,'Checklist');event.currentTarget.reset();window.toast('Checklist queued.');window.renderWork();};

    const change = document.createElement('section');
    change.id='supabaseChangeOrder';change.className='card span6';
    change.innerHTML=`<h2>Change request</h2><form id="supabaseChangeForm"><label>Job</label><select name="jobId">${window.optionRows(jobs,['Job ID'],row=>row['Project Title'] || 'Job','Select job')}</select><label>Title</label><input name="title" required><label>Scope and reason</label><textarea name="description" required></textarea><label>Estimated impact</label><input name="estimatedImpact" placeholder="Cost or schedule estimate"><div class="actions"><button>Save for owner review</button></div></form><div class="notice warn">This creates an internal draft only. It is not approved or sent to a customer.</div>`;
    grid.appendChild(change);
    document.getElementById('supabaseChangeForm').onsubmit=async event=>{event.preventDefault();const data=new FormData(event.currentTarget),id=window.newId('CHANGE'),record={'Change Order ID':id,'Business ID':window.state.businessId,'Job ID':data.get('jobId'),'Title':text(data.get('title')).trim(),'Description':text(data.get('description')).trim(),'Estimated Impact':text(data.get('estimatedImpact')).trim(),'Status':'Draft — Owner Review Required','Created By':auth.getState().userId,'Created Time':isoNow(),'Updated Time':isoNow(),'Record Version':1};await queueRecord('changeOrders',record,'Change Request');event.currentTarget.reset();window.toast('Change request saved for owner review.');};
  }

  function enhanceField() {
    const title = document.querySelector('#mainContent .page-head h1');
    if (title) title.textContent='Field & Daily Logs';
    const grid = document.querySelector('#mainContent .grid');
    if (!grid || document.getElementById('supabaseDailyLog')) return;
    const jobs = window.state.snapshot.jobs || [];
    const logs = window.state.snapshot.dailyLogs || [];
    const card = document.createElement('section');
    card.id='supabaseDailyLog';card.className='card';
    card.innerHTML=`<h2>Daily job log</h2><form id="supabaseDailyLogForm"><div class="two"><div><label>Job</label><select name="jobId" required>${window.optionRows(jobs,['Job ID'],row=>row['Project Title'] || 'Job','Select job')}</select></div><div><label>Progress percent</label><input name="progress" type="number" min="0" max="100"></div></div><label>Work completed</label><textarea name="summary" required></textarea><div class="two"><div><label>Weather / site condition</label><input name="weather"></div><div><label>Blockers or follow-up</label><input name="blockers"></div></div><div class="actions"><button>Save daily log</button></div></form><div class="list">${logs.slice(0,40).map(row=>`<div class="row"><div class="row-top"><strong>${window.esc(window.jobName(row['Job ID']))}</strong>${window.pill(`${number(row['Progress Percent'])}%`)}</div><small>${window.esc(row['Summary'])} · ${window.dateTime(row['Created Time'])}</small></div>`).join('') || window.empty('No daily logs.')}</div>`;
    grid.appendChild(card);
    document.getElementById('supabaseDailyLogForm').onsubmit=async event=>{event.preventDefault();const data=new FormData(event.currentTarget),id=window.newId('DAILY-LOG'),record={'Daily Log ID':id,'Business ID':window.state.businessId,'Job ID':data.get('jobId'),'Summary':text(data.get('summary')).trim(),'Weather':text(data.get('weather')).trim(),'Blockers':text(data.get('blockers')).trim(),'Progress Percent':number(data.get('progress')),'Created By':auth.getState().userId,'Created Time':isoNow(),'Updated Time':isoNow(),'Record Version':1};await queueRecord('dailyLogs',record,'Daily Log');event.currentTarget.reset();window.toast('Daily log queued.');window.renderField();};
  }

  function enhanceSettings() {
    const grid = document.querySelector('#mainContent .grid');
    if (!grid || document.getElementById('supabaseAppInstall')) return;
    const card = document.createElement('section');card.id='supabaseAppInstall';card.className='card span6';
    card.innerHTML=`<h2>Install H38 Office</h2><p class="muted">Install this Supabase Business Office on Android or Chromebook for a standalone app window and offline shell.</p><div class="actions"><button id="installH38App" ${installPrompt?'':'disabled'}>Install app</button></div><div class="notice">Operational records synchronize to Supabase. Google Office remains rollback only, and no legacy records are copied automatically.</div>`;
    grid.appendChild(card);
    document.getElementById('installH38App').onclick=async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;window.renderSettings();};
  }

  function wrapRenderer(name,enhancer) {
    const original = window[name];
    if (typeof original !== 'function') return;
    const wrapped = function () { const result=original.apply(this,arguments);enhancer();return result; };
    window[name]=wrapped;
    try { eval(`${name}=wrapped`); } catch (ignore) {}
  }

  if (window.PAGE_DEFS) {
    window.PAGE_DEFS.work[1]='Work & Tasks';
    window.PAGE_DEFS.field[1]='Field & Logs';
  }
  wrapRenderer('renderToday',enhanceToday);
  wrapRenderer('renderWork',enhanceWork);
  wrapRenderer('renderField',enhanceField);
  wrapRenderer('renderSettings',enhanceSettings);

  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
  window.addEventListener('appinstalled',()=>{installPrompt=null;});
  window.H38_SUPABASE_OPERATIONAL = {
    enabled:true,
    storageBucket:STORAGE_BUCKET,
    hydrateSnapshot,
    synchronize,
    safeguards:{externalActionsEnabled:false,googleDataImported:false,northernLakesEnabled:false}
  };
})();
