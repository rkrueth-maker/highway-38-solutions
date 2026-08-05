(function () {
  'use strict';

  const config=window.H38_BUSINESS_OFFICE_SUPABASE || {};
  const auth=window.H38_SUPABASE_AUTH;
  const Bridge=window.H38Bridge;
  if(!auth || auth.enabled!==true || !Bridge || !Bridge.prototype || !window.supabase)return;

  const previousRequest=Bridge.prototype.request;
  const settingsCache=new Map();
  let dbClient=null;

  function client(){
    if(dbClient)return dbClient;
    dbClient=window.supabase.createClient(config.url,config.publishableKey,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'},
      global:{headers:{'x-client-info':'highway-38-business-office-storage-provider'}}
    });
    return dbClient;
  }
  function text(value){return String(value==null?'':value);}
  function clean(value){
    if(Array.isArray(value))return value.map(clean);
    if(!value || typeof value!=='object')return value;
    const output={};
    Object.entries(value).forEach(([key,item])=>{
      if(key==='base64Data' || key==='__localPending' || key==='__h38Record')return;
      output[key]=clean(item);
    });
    return output;
  }
  async function sessionUser(){
    const {data,error}=await client().auth.getSession();
    if(error)throw error;
    if(!data.session || !data.session.user)throw new Error('Supabase Auth session is required.');
    return data.session.user;
  }
  async function setting(businessId,force=false){
    if(!force && settingsCache.has(businessId))return settingsCache.get(businessId);
    const {data,error}=await client().from('business_storage_settings').select('*').eq('business_id',businessId).maybeSingle();
    if(error)throw error;
    const resolved=data || {business_id:businessId,provider:'supabase',connection_status:'connected',config:{bucket:'business-office-files'}};
    settingsCache.set(businessId,resolved);
    return resolved;
  }
  async function saveDocumentRecord(businessId,recordKey,record){
    const actor=await sessionUser();
    const db=client();
    const {data:existing,error:readError}=await db.from('business_records').select('id')
      .eq('business_id',businessId).eq('collection','documents').eq('record_key',recordKey).maybeSingle();
    if(readError)throw readError;
    if(existing){
      const {error}=await db.from('business_records').update({payload:clean(record),record_status:'active',updated_by:actor.id}).eq('id',existing.id);
      if(error)throw error;
    }else{
      const {error}=await db.from('business_records').insert({business_id:businessId,collection:'documents',record_key:recordKey,payload:clean(record),record_status:'active',created_by:actor.id,updated_by:actor.id});
      if(error)throw error;
    }
  }
  async function proof(operation,details){
    try{
      const actor=await sessionUser();
      await client().from('business_proof_log').insert({
        business_id:operation.businessId,actor_user_id:actor.id,action_type:'SAVE_ATTACHMENT',entity_type:'Document',result:'PASS',
        details:Object.assign({operationId:operation.operationId || operation.id || '',externalActionOccurred:false},details || {}),
        external_action_occurred:false
      });
    }catch(error){console.warn('File Proof Log write failed:',error.message || error);}
  }
  async function failure(operation,error){
    try{
      const actor=await sessionUser();
      await client().from('business_error_log').insert({
        business_id:operation.businessId,actor_user_id:actor.id,source:'commercial-app/supabase-storage-provider.js',
        error_code:'FILE_PROVIDER_UPLOAD_FAILED',message:text(error && error.message || error).slice(0,4000),severity:'error',status:'open',
        context:{operationId:operation.operationId || operation.id || '',provider:'google_drive',fileName:operation.payload?.fileName || ''}
      });
    }catch(ignore){}
  }
  async function markLocalAttachment(operation,providerResult){
    try{
      const localId=operation.payload?.id || operation.payload?.attachmentId || operation.recordId;
      const local=await window.H38DB.get('attachments',localId);
      if(local)await window.H38DB.put('attachments',Object.assign({},local,{syncStatus:'SYNCED',storageProvider:'google_drive',providerFileId:providerResult.fileId || '',storagePath:providerResult.storagePath || '',base64Data:''}));
    }catch(ignore){}
  }
  async function uploadToGoogleDrive(operation,storageSetting){
    if(storageSetting.connection_status!=='connected' || !storageSetting.root_folder_id){
      throw new Error('This business Google Drive connection is not complete. The file remains safely queued on this device.');
    }
    const payload=operation.payload || {};
    if(!payload.base64Data)throw new Error('The queued file data is unavailable.');
    const {data,error}=await client().functions.invoke('business-drive-upload',{
      body:{
        businessId:operation.businessId,
        attachmentId:payload.attachmentId || payload.id || operation.recordId,
        fileName:payload.fileName,
        mimeType:payload.mimeType || 'application/octet-stream',
        base64Data:payload.base64Data,
        relatedRecordType:payload.relatedRecordType || 'Business',
        relatedRecordId:payload.relatedRecordId || '',
        visibility:payload.visibility || 'Internal',
        captureTime:payload.captureTime || operation.localTimestamp || new Date().toISOString()
      }
    });
    if(error)throw error;
    if(!data || data.status!=='PASS' || !data.fileId)throw new Error(data?.message || 'Google Drive did not confirm the upload.');

    const recordKey=text(payload.attachmentId || payload.id || operation.recordId);
    const record={
      'Document ID':recordKey,'Business ID':operation.businessId,'File Name':payload.fileName,
      'Mime Type':payload.mimeType,'File Size':payload.fileSize,'Source Type':payload.relatedRecordType,
      'Source ID':payload.relatedRecordId,'Access Classification':payload.visibility || 'Internal',
      'Storage Provider':'google_drive','Provider Account':storageSetting.provider_account_email || '',
      'Provider File ID':data.fileId,'Storage Path':data.storagePath || '',
      'Private View URL':data.webViewLink || '','Status':'Available — Private',
      'Created Time':payload.captureTime || operation.localTimestamp || new Date().toISOString(),
      'Updated Time':new Date().toISOString(),'Record Version':1
    };
    await saveDocumentRecord(operation.businessId,recordKey,record);
    await markLocalAttachment(operation,data);
    await proof(operation,{provider:'google_drive',recordKey,fileId:data.fileId,rootFolderId:storageSetting.root_folder_id});
    return {operationId:operation.operationId || operation.id,status:'SYNCED',recordType:'Document',recordId:recordKey};
  }

  Bridge.prototype.request=async function(action,args,timeout){
    if(action==='fullStartupRefresh' || action==='completionBootstrap'){
      const snapshot=await previousRequest.call(this,action,args,timeout);
      const businessId=text(args && args.businessId || auth.getState().selectedBusinessId);
      if(!businessId)return snapshot;
      try{
        const storage=await setting(businessId,true);
        snapshot.storageSettings={
          provider:storage.provider,
          connectionStatus:storage.connection_status,
          providerAccountEmail:storage.provider_account_email || '',
          rootFolderConfigured:!!storage.root_folder_id,
          config:storage.config || {}
        };
        const providers=Array.isArray(snapshot.providers)?snapshot.providers:[];
        snapshot.providers=providers.filter(row=>String(row['Provider Type'] || '').toLowerCase()!=='storage');
        snapshot.providers.push({
          'Provider ID':'storage','Provider Type':'storage',
          'Provider Name':storage.provider==='google_drive'?'Client Google Drive':'Supabase private storage',
          'Connection Status':storage.connection_status==='connected'?'Connected':'Not Connected'
        });
      }catch(error){
        console.warn('Storage provider setting:',error.message || error);
      }
      return snapshot;
    }

    if(action!=='completionSync')return previousRequest.call(this,action,args,timeout);
    const operations=Array.isArray(args && args.operations)?args.operations:[];
    const attachments=operations.filter(operation=>operation.action==='SAVE_ATTACHMENT');
    if(!attachments.length)return previousRequest.call(this,action,args,timeout);

    const businessId=text(args && args.businessId || attachments[0]?.businessId || auth.getState().selectedBusinessId);
    const storage=await setting(businessId,true);
    if(storage.provider!=='google_drive')return previousRequest.call(this,action,args,timeout);

    const remaining=operations.filter(operation=>operation.action!=='SAVE_ATTACHMENT');
    const results=[];
    for(const operation of attachments){
      try{results.push(await uploadToGoogleDrive(operation,storage));}
      catch(error){await failure(operation,error);results.push({operationId:operation.operationId || operation.id,status:'FAILED',message:text(error && error.message || error)});}
    }
    if(remaining.length){
      const response=await previousRequest.call(this,'completionSync',Object.assign({},args,{operations:remaining}),timeout);
      results.push(...(response.results || []));
    }
    return {status:'PASS',transport:'supabase-operational-app',results,externalActionOccurred:false};
  };

  const baseRenderSettings=renderSettings;
  renderSettings=function(){
    baseRenderSettings();
    const grid=document.querySelector('#mainContent .grid');
    if(!grid || document.getElementById('businessStorageProviderCard'))return;
    const storage=state.snapshot?.storageSettings || {provider:'supabase',connectionStatus:'connected'};
    const drive=storage.provider==='google_drive';
    const card=document.createElement('section');
    card.id='businessStorageProviderCard';card.className='card span6';
    card.innerHTML=`<h2>File storage</h2><div class="row"><div><strong>${drive?'Client Google Drive':'Supabase private storage'}</strong><small>${drive?`Business-owned Drive${storage.providerAccountEmail?' · '+esc(storage.providerAccountEmail):''}`:'Default private storage inside the business Supabase tenant'}</small></div>${pill(storage.connectionStatus==='connected'?'Connected':'Setup required',storage.connectionStatus==='connected'?'good':'pending')}</div><p class="muted">Supabase remains the system of record. File metadata, permissions, assignments, proof and error history stay in Supabase even when the original file is stored in the client’s own Google Drive.</p><div class="notice">Google Drive is connected separately during client onboarding. OAuth credentials never enter browser code, and one business cannot access another business’s folder.</div>`;
    grid.appendChild(card);
  };
  window.renderSettings=renderSettings;

  window.H38_STORAGE_PROVIDER={
    get:businessId=>setting(businessId,true),
    supported:['supabase','google_drive'],
    defaultProvider:'supabase',
    safeguards:{credentialsInBrowser:false,crossTenantAccess:false,automaticCustomerRelease:false}
  };
})();
