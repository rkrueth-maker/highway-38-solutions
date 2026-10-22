(function () {
  'use strict';

  const config=window.H38_BUSINESS_OFFICE_SUPABASE || {};
  const auth=window.H38_SUPABASE_AUTH;
  const Bridge=window.H38Bridge;
  if(!auth || auth.enabled!==true || !Bridge || !Bridge.prototype || !window.supabase)return;

  // This file ships both as an individual script and inlined in the Office
  // bundle, so it can execute twice in one page. The first execution wins for
  // the shared decorations below; the flag lives on the shared objects
  // themselves so the second copy sees it too.
  if(Bridge.prototype.__h38StorageProviderInstalled)return;
  Bridge.prototype.__h38StorageProviderInstalled=true;
  const previousRequest=Bridge.prototype.request;
  // Google Drive storage is STOOD DOWN (Rick, 2026-10-22): Drive is out of
  // the product — not reliable/fast enough for day-to-day files. Live files
  // live on H38's servers, period, and year data dumps are plain downloads.
  // With this flag off, every upload routes to Office (server) storage and
  // the Settings card presents server storage only — no Drive offer, no
  // Connect button, no dead ends. The Drive machinery below (routing,
  // connect flow, resolve/stream) stays in place, dormant and recoverable:
  // flipping this flag back on (with the server-side H38_DRIVE_LIVE_UPLOADS
  // gate) restores the 2026-10-21 own-it build exactly. Do not flip it
  // without Rick reversing the 2026-10-22 decision.
  const clientDriveAvailable=false;
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
    if(!businessId)throw new Error('A business is required for storage settings.');
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
  async function notifyStorageOwners(businessId,kind,title,body){
    // Existing owner-notification path: business_records collection
    // 'notifications' rendered by the Office topbar bell. Deterministic key
    // keeps this to one row per business/kind/day.
    try{
      const actor=await sessionUser();
      const day=new Date().toISOString().slice(0,10);
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${businessId}|${kind}|${day}`));
      const hash=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,24).toUpperCase();
      const recordKey=`OWNERNOTIF-${hash}`;
      const payload={
        'Title':title,'Body':body,'Status':'Unread','Audience':'owners-admins',
        'Category':'Storage','Link Page':'settings','Source ID':recordKey,
        'Event Type':kind,'Business ID':businessId,'Customer ID':'','Customer Name':'',
        'Push Status':'off','Created Time':new Date().toISOString(),'Read By JSON':'[]',
        'Notification ID':recordKey,'Source Collection':'business_storage_settings',
        'Link Record ID':'','Record Version':1
      };
      await client().from('business_records').upsert({
        business_id:businessId,collection:'notifications',record_key:recordKey,
        payload,record_status:'active',created_by:actor.id,updated_by:actor.id
      },{onConflict:'business_id,collection,record_key',ignoreDuplicates:true});
    }catch(ignore){}
  }
  async function markLocalAttachment(operation,providerResult){
    try{
      const localId=operation.payload?.id || operation.payload?.attachmentId || operation.recordId;
      const local=await window.H38DB.get('attachments',localId);
      if(local)await window.H38DB.put('attachments',Object.assign({},local,{syncStatus:'SYNCED',storageProvider:'google_drive',providerFileId:providerResult.fileId || '',storagePath:providerResult.storagePath || '',base64Data:''}));
    }catch(ignore){}
  }
  // Returns {ok:true,data} or {ok:false,status,reason}. Never throws for a
  // business-level Drive problem: the caller falls back to Supabase storage
  // so a field file is never lost because Drive is unhappy.
  async function uploadToGoogleDrive(operation,storageSetting){
    const payload=operation.payload || {};
    if(storageSetting.connection_status!=='connected' || !storageSetting.root_folder_id){
      return {ok:false,status:'NOT_CONNECTED',reason:'This business Google Drive connection is not complete.'};
    }
    if(!payload.base64Data)return {ok:false,status:'FAIL',reason:'The queued file data is unavailable.'};
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
    if(error)return {ok:false,status:'FAIL',reason:text(error.message || error)};
    if(!data || data.status!=='PASS' || !data.fileId){
      return {ok:false,status:text(data?.status || 'FAIL'),reason:text(data?.error || data?.message || 'Google Drive did not confirm the upload.')};
    }
    return {ok:true,data};
  }
  async function saveDriveDocumentRecord(operation,storageSetting,data){
    const payload=operation.payload || {};
    const recordKey=text(payload.attachmentId || payload.id || operation.recordId);
    const record={
      'Document ID':recordKey,'Business ID':operation.businessId,'File Name':payload.fileName,
      'Mime Type':payload.mimeType,'File Size':payload.fileSize,'Source Type':payload.relatedRecordType,
      'Source ID':payload.relatedRecordId,'Access Classification':payload.visibility || 'Internal',
      'Storage Provider':'google_drive','Storage Location':'external',
      'Provider Account':storageSetting.provider_account_email || '',
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
  async function stampFallbackRecord(operation,reason){
    // The file itself is already safe in Supabase storage via the normal
    // path; flag its document record so the fallback is visible, not silent.
    try{
      const payload=operation.payload || {};
      const recordKey=text(payload.attachmentId || payload.id || operation.recordId);
      if(!recordKey)return;
      const db=client();
      const {data:existing}=await db.from('business_records').select('id,payload')
        .eq('business_id',operation.businessId).eq('collection','documents').eq('record_key',recordKey).maybeSingle();
      if(!existing || !existing.payload)return;
      const actor=await sessionUser();
      const merged=Object.assign({},existing.payload,{
        'Storage Provider':'supabase','Storage Fallback':true,
        'Storage Fallback Reason':text(reason).slice(0,300),
        'Updated Time':new Date().toISOString()
      });
      await db.from('business_records').update({payload:clean(merged),updated_by:actor.id}).eq('id',existing.id);
    }catch(ignore){}
  }

  Bridge.prototype.request=async function(action,args,timeout){
    if(action==='fullStartupRefresh' || action==='completionBootstrap'){
      const snapshot=await previousRequest.call(this,action,args,timeout);
      const businessId=text(args && args.businessId || auth.getState().selectedBusinessId);
      if(!businessId)return snapshot;
      try{
        const storage=await setting(businessId,true);
        // Drive stood down (Rick, 2026-10-22): the snapshot presents server
        // storage as the provider whatever the dormant settings row says.
        const effectiveProvider=clientDriveAvailable?storage.provider:'supabase';
        snapshot.storageSettings={
          provider:effectiveProvider,
          connectionStatus:clientDriveAvailable?storage.connection_status:'connected',
          providerAccountEmail:clientDriveAvailable?(storage.provider_account_email || ''):'',
          rootFolderConfigured:clientDriveAvailable?!!storage.root_folder_id:false,
          config:storage.config || {}
        };
        const providers=Array.isArray(snapshot.providers)?snapshot.providers:[];
        snapshot.providers=providers.filter(row=>String(row['Provider Type'] || '').toLowerCase()!=='storage');
        const driveStatus=effectiveProvider==='google_drive'
          ? (storage.connection_status==='connected'?'Connected':storage.connection_status==='error'?'Needs attention':storage.connection_status==='connecting'?'Connecting':'Not Connected')
          : 'Connected';
        snapshot.providers.push({
          'Provider ID':'storage','Provider Type':'storage',
          'Provider Name':effectiveProvider==='google_drive'?'Client Google Drive':'Supabase private storage',
          'Connection Status':driveStatus
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
    if(!clientDriveAvailable || storage.provider!=='google_drive')return previousRequest.call(this,action,args,timeout);

    const remaining=operations.filter(operation=>operation.action!=='SAVE_ATTACHMENT');
    const results=[];
    const fallbackOps=[];
    for(const operation of attachments){
      const attempt=await uploadToGoogleDrive(operation,storage);
      if(attempt.ok){
        try{results.push(await saveDriveDocumentRecord(operation,storage,attempt.data));}
        catch(error){await failure(operation,error);fallbackOps.push({operation,reason:text(error && error.message || error)});}
      }else{
        await failure(operation,new Error(attempt.reason));
        fallbackOps.push({operation,reason:attempt.reason,status:attempt.status});
      }
    }
    const passthrough=remaining.concat(fallbackOps.map(item=>item.operation));
    if(passthrough.length){
      const response=await previousRequest.call(this,'completionSync',Object.assign({},args,{operations:passthrough}),timeout);
      results.push(...(response.results || []));
      for(const item of fallbackOps){
        await stampFallbackRecord(item.operation,item.reason);
        if(item.status==='FAIL'){
          await notifyStorageOwners(businessId,'drive_upload_fallback',
            'A file was saved to Office storage instead of Google Drive',
            'Google Drive did not accept a file, so it was saved safely to Office storage and flagged. Nothing was lost.');
        }
      }
    }
    return {status:'PASS',transport:'supabase-operational-app',results,externalActionOccurred:false};
  };

  // ---------------------------------------------------------------------------
  // Shared-client routing for DIRECT storage calls (walkthrough video, quote
  // photos, document scans and every other module that uploads through the
  // one shared Supabase client). The Bridge queue above covers queued
  // attachments; this covers the direct `storage.from(...).upload` calls at
  // the only layer they all share — the client itself.
  //   upload:         Drive-connected business -> business-drive-upload (raw
  //                   bytes); ANY failure -> original Supabase upload + flag.
  //   createSignedUrl: Drive files ('drive/<id>' paths and registered
  //                   virtual paths) resolve to a short-lived server stream
  //                   URL, so crew view files without the owner's login.
  //   business_records documents writes get their external markers stamped
  //   from the same session's routing results.
  // ---------------------------------------------------------------------------
  const drivePathInfo=new Map();      // virtual path -> {fileId, storagePath, accountEmail}
  const driveFallbackInfo=new Map();  // virtual path -> fallback reason
  const externalPathSets=new Map();   // businessId -> Set of registry paths (storage + virtual)
  const resolveCache=new Map();       // path -> {url, expires}
  const decoratedClients=new WeakSet();

  async function externalPaths(businessId){
    if(externalPathSets.has(businessId))return externalPathSets.get(businessId);
    const set=new Set();
    externalPathSets.set(businessId,set);
    try{
      const {data,error}=await client().from('business_external_files')
        .select('storage_path,virtual_path').eq('business_id',businessId).eq('status','available');
      if(!error && Array.isArray(data)){
        data.forEach(row=>{
          if(row.storage_path)set.add(text(row.storage_path));
          if(row.virtual_path)set.add(text(row.virtual_path));
        });
      }
    }catch(ignore){}
    return set;
  }
  async function resolveDriveUrl(path,businessIdHint){
    const cached=resolveCache.get(path);
    if(cached && cached.expires>Date.now())return {url:cached.url};
    const businessId=businessIdHint || text(auth.getState().selectedBusinessId);
    const body={action:'resolve',businessId,
      storagePath:path.startsWith('drive/')?path:'',
      virtualPath:path.startsWith('drive/')?'':path};
    const {data,error}=await client().functions.invoke('business-drive-connect',{body});
    if(error)throw error;
    if(data && data.url){
      resolveCache.set(path,{url:text(data.url),expires:Date.now()+480000});
      return {url:text(data.url)};
    }
    if(data && data.unavailable)return {unavailable:true,reason:text(data.reason || 'This file is unavailable.')};
    return {found:false};
  }
  async function driveAwareUpload(origUpload,bucket,path,body,options){
    const parts=String(path).split('/');
    const businessId=parts[0] || '';
    try{
      const sizeable=body instanceof Blob || body instanceof ArrayBuffer || ArrayBuffer.isView(body);
      if(!businessId || !sizeable || !navigator.onLine)return origUpload(path,body,options);
      const blob=body instanceof Blob?body:new Blob([body]);
      if(!blob.size || blob.size>100*1024*1024)return origUpload(path,body,options);
      if(!clientDriveAvailable)return origUpload(path,body,options);
      const st=await setting(businessId);
      if(!st || st.provider!=='google_drive' || st.connection_status!=='connected')return origUpload(path,body,options);
      const {data:sessionData}=await client().auth.getSession();
      const session=sessionData && sessionData.session;
      if(!session)return origUpload(path,body,options);
      const res=await fetch(`${config.url}/functions/v1/business-drive-upload`,{
        method:'POST',
        headers:{
          'Authorization':`Bearer ${session.access_token}`,
          'apikey':config.publishableKey,
          'Content-Type':blob.type || 'application/octet-stream',
          'x-h38-business-id':businessId,
          'x-h38-file-name':parts.slice(3).join('/') || 'file',
          'x-h38-mime-type':blob.type || 'application/octet-stream',
          'x-h38-source-type':parts[1] || '',
          'x-h38-source-id':parts[2] || '',
          'x-h38-virtual-path':path
        },
        body:blob
      });
      const data=await res.json().catch(()=>null);
      if(res.ok && data && data.status==='PASS' && data.fileId){
        drivePathInfo.set(path,{fileId:text(data.fileId),storagePath:text(data.storagePath),accountEmail:st.provider_account_email || ''});
        const set=await externalPaths(businessId);
        set.add(path);
        if(data.storagePath)set.add(text(data.storagePath));
        return {data:{path,fullPath:`${bucket}/${path}`,id:text(data.fileId)},error:null};
      }
      const reason=text((data && data.error) || `Drive upload failed (${res.status}).`);
      driveFallbackInfo.set(path,reason);
      if(data && data.status==='FAIL'){
        await notifyStorageOwners(businessId,'drive_upload_fallback',
          'A file was saved to Office storage instead of Google Drive',
          'Google Drive did not accept a file, so it was saved safely to Office storage and flagged. Nothing was lost.');
      }
      return origUpload(path,body,options);
    }catch(error){
      try{driveFallbackInfo.set(path,text(error && error.message || error));}catch(ignore){}
      return origUpload(path,body,options);
    }
  }
  async function driveAwareSignedUrl(origSigned,path,expiresIn,options){
    const p=text(path);
    try{
      if(p.startsWith('drive/')){
        const resolved=await resolveDriveUrl(p,'');
        if(resolved.url)return {data:{signedUrl:resolved.url},error:null};
        if(resolved.unavailable)return {data:null,error:new Error(resolved.reason)};
        return {data:null,error:new Error('This Drive file could not be loaded right now.')};
      }
      const businessId=p.split('/')[0] || '';
      if(businessId){
        const set=await externalPaths(businessId);
        if(set.has(p)){
          const resolved=await resolveDriveUrl(p,businessId);
          if(resolved.url)return {data:{signedUrl:resolved.url},error:null};
          if(resolved.unavailable)return {data:null,error:new Error(resolved.reason)};
        }
      }
    }catch(ignore){}
    return origSigned(path,expiresIn,options);
  }
  function stampDocumentRows(rows){
    const stampOne=row=>{
      if(!row || row.collection!=='documents' || !row.payload || typeof row.payload!=='object')return row;
      const path=text(row.payload['Storage Path']);
      if(!path)return row;
      if(drivePathInfo.has(path)){
        const info=drivePathInfo.get(path);
        return Object.assign({},row,{payload:Object.assign({},row.payload,{
          'Storage Provider':'google_drive','Storage Location':'external',
          'Provider File ID':info.fileId,
          'Provider Account':info.accountEmail || row.payload['Provider Account'] || ''
        })});
      }
      if(driveFallbackInfo.has(path)){
        return Object.assign({},row,{payload:Object.assign({},row.payload,{
          'Storage Fallback':true,'Storage Fallback Reason':driveFallbackInfo.get(path).slice(0,300)
        })});
      }
      return row;
    };
    return Array.isArray(rows)?rows.map(stampOne):stampOne(rows);
  }
  function decorateSharedClient(shared){
    if(!shared || decoratedClients.has(shared) || shared.__h38DriveRoutingV1)return;
    decoratedClients.add(shared);
    shared.__h38DriveRoutingV1=true;
    try{
      const origFrom=shared.from.bind(shared);
      shared.from=function(table){
        const builder=origFrom(table);
        if(table!=='business_records')return builder;
        const proxy=new Proxy(builder,{
          get(target,prop){
            if(prop==='insert' || prop==='upsert'){
              return (...args)=>{
                try{args[0]=stampDocumentRows(args[0]);}catch(ignore){}
                const out=target[prop](...args);
                return out===target?proxy:out;
              };
            }
            const value=Reflect.get(target,prop,target);
            return typeof value==='function'?value.bind(target):value;
          }
        });
        return proxy;
      };
    }catch(error){console.warn('Drive record stamping unavailable:',error.message || error);}
    try{
      const origStorageFrom=shared.storage.from.bind(shared.storage);
      shared.storage.from=function(bucket){
        const api=origStorageFrom(bucket);
        if(bucket!=='business-office-files')return api;
        const origUpload=api.upload.bind(api);
        const origSigned=api.createSignedUrl.bind(api);
        api.upload=(path,body,options)=>driveAwareUpload(origUpload,bucket,path,body,options);
        api.createSignedUrl=(path,expiresIn,options)=>driveAwareSignedUrl(origSigned,path,expiresIn,options);
        return api;
      };
    }catch(error){console.warn('Drive upload routing unavailable:',error.message || error);}
  }
  function installClientRouting(){
    try{
      const shared=window.H38_SUPABASE_SHARED_CLIENT && window.H38_SUPABASE_SHARED_CLIENT.ensure
        ? window.H38_SUPABASE_SHARED_CLIENT.ensure() : null;
      if(shared)decorateSharedClient(shared);
    }catch(ignore){}
  }
  installClientRouting();

  // ---------------------------------------------------------------------------
  // Settings card: File storage (own-it Google Drive).
  // ---------------------------------------------------------------------------
  let cardStatusCache={at:0,businessId:'',status:null};
  function fmtBytes(bytes){
    const n=Number(bytes || 0);
    if(!n)return '0 MB';
    if(n>=1073741824)return `${(n/1073741824).toFixed(2)} GB`;
    if(n>=1048576)return `${(n/1048576).toFixed(1)} MB`;
    return `${Math.max(1,Math.round(n/1024))} KB`;
  }
  function currentBusinessId(){
    return text(window.state?.businessId || auth.getState().selectedBusinessId);
  }
  async function fetchDriveStatus(businessId,force=false){
    if(!force && cardStatusCache.businessId===businessId && Date.now()-cardStatusCache.at<30000)return cardStatusCache.status;
    const {data,error}=await client().functions.invoke('business-drive-connect',{body:{action:'status',businessId}});
    if(error)throw error;
    cardStatusCache={at:Date.now(),businessId,status:data};
    return data;
  }
  function driveQueryNotice(){
    try{
      const params=new URLSearchParams(window.location.search);
      const drive=params.get('drive');
      if(!drive)return '';
      window.history.replaceState({},'',window.location.pathname+window.location.hash);
      if(drive==='connected')return '<div class="notice">Google Drive is connected. New files will be stored in your Drive.</div>';
      const reason=params.get('driveReason') || '';
      const copy={
        cancelled:'The Google sign-in was cancelled, so nothing changed.',
        state:'That connection link expired. Start the connection again.',
        role:'Only an owner or administrator can connect Drive for this business.',
        exchange:'Google did not complete the connection. Start again, or ask Highway 38 for help.'
      }[reason] || 'The connection did not complete. Start again, or ask Highway 38 for help.';
      return `<div class="notice">${copy}</div>`;
    }catch(ignore){return '';}
  }
  function renderStorageSettingsCard(){
    if(window.state?.page!=='settings')return false;
    const grid=document.querySelector('#mainContent .grid');
    if(!grid)return false;
    document.getElementById('businessStorageProviderCard')?.remove();
    const businessId=currentBusinessId();
    const snapshotStorage=window.state?.snapshot?.storageSettings || {provider:'supabase',connectionStatus:'connected'};
    const status=(cardStatusCache.businessId===businessId && cardStatusCache.status) || null;
    const provider=status?status.provider:snapshotStorage.provider;
    const connectionStatus=status?status.connectionStatus:snapshotStorage.connectionStatus;
    const configured=status?status.configured:true; // server re-checks on click; assume until status lands
    const email=status?(status.providerAccountEmail || ''):(snapshotStorage.providerAccountEmail || '');
    const drive=provider==='google_drive';
    const card=document.createElement('section');
    card.id='businessStorageProviderCard';card.className='card span6';
    if(!clientDriveAvailable){
      // Drive stood down (Rick, 2026-10-22): server storage is the one live
      // path and the only thing this card offers — no Drive offer, no
      // Connect button. Year dumps are plain downloads from Data & storage.
      card.innerHTML=`<h2>File storage</h2>
      <div class="row"><div><strong>Supabase private storage</strong><small>Private storage inside this business Office, on Highway 38's servers</small></div>${window.pill('Connected','good')}</div>
      <p class="muted">Your photos, videos and attachments are stored privately on Highway 38's own servers — fast, and under our control — and count toward your included server data (see Data &amp; storage). Records and accounting always stay in the Office.</p>
      <p class="muted">Need a copy of a full year? Export it any time from the Data &amp; storage card — it downloads straight to you.</p>`;
      grid.appendChild(card);
      return true;
    }
    let inner=`<h2>File storage</h2>`;
    inner+=driveQueryNotice();
    if(!drive){
      inner+=`<div class="row"><div><strong>Supabase private storage</strong><small>Default private storage inside this business Office</small></div>${window.pill('Connected','good')}</div>
      <p class="muted">Your photos, videos and attachments are stored privately in Highway 38's storage and count toward your 5 GB of included server data. Records and accounting always stay in the Office either way.</p>`;
      if(configured){
        inner+=`<div class="notice">Own your storage: connect this business's Google Drive and new photos, walkthrough videos and attachments are stored in your Drive instead — they stop counting toward your 5 GB. Highway 38 sets this up with you; the connection itself is approved by the account owner here.</div>
        <div class="row"><button type="button" class="btn" data-drive-action="connect">Connect your Google Drive</button></div>`;
      }else{
        inner+=`<div class="notice">Own-it Drive storage is being finished by Highway 38 for this business. Ask us to complete the setup — your files keep using private Office storage meanwhile.</div>`;
      }
    }else if(connectionStatus==='connected'){
      const count=status?Number(status.externalFileCount || 0):0;
      const bytes=status?Number(status.externalBytes || 0):0;
      inner+=`<div class="row"><div><strong>Your Google Drive</strong><small>${email || 'Connected account'}</small></div>${window.pill('Connected','good')}</div>
      <p class="muted">${count} file${count===1?'':'s'} (${fmtBytes(bytes)}) stored in your Drive. Files in your Drive do not count toward your 5 GB of included server data. Records and accounting stay in the Office.</p>
      <div class="row"><button type="button" class="btn" data-drive-action="connect">Reconnect</button><button type="button" class="btn" data-drive-action="disconnect">Disconnect</button></div>
      <p class="muted">Disconnecting returns new files to Office storage. Files already in your Drive stay there and remain yours.</p>`;
    }else if(connectionStatus==='error'){
      inner+=`<div class="row"><div><strong>Your Google Drive</strong><small>${email || 'Connection needs attention'}</small></div>${window.pill('Needs attention','pending')}</div>
      <div class="notice">Your Drive connection needs attention, so new files are being saved safely to Office storage for now. Nothing is lost. Reconnect to resume Drive storage.</div>
      <div class="row"><button type="button" class="btn" data-drive-action="connect">Reconnect Google Drive</button><button type="button" class="btn" data-drive-action="disconnect">Disconnect</button></div>`;
    }else{
      inner+=`<div class="row"><div><strong>Your Google Drive</strong><small>Connection started but not finished</small></div>${window.pill('Setup required','pending')}</div>
      <div class="notice">Finish connecting the business's Google Drive so new files are stored there. Until then, files keep using private Office storage.</div>
      <div class="row"><button type="button" class="btn" data-drive-action="connect">Connect your Google Drive</button></div>`;
    }
    card.innerHTML=inner;
    grid.appendChild(card);
    card.querySelectorAll('[data-drive-action]').forEach(button=>{
      button.addEventListener('click',()=>driveCardAction(button.getAttribute('data-drive-action'),businessId,button));
    });
    // No status fetch on render: opening Settings must not perform automatic
    // function work. The card renders from the local snapshot; the server
    // status is checked only inside driveCardAction (user action).
    return true;
  }
  async function driveCardAction(action,businessId,button){
    if(!clientDriveAvailable || !businessId)return; // Drive stood down (Rick, 2026-10-22)
    const original=button.textContent;
    button.disabled=true;button.textContent='Working…';
    try{
      // User-triggered status refresh (never automatic on Settings open).
      try{await fetchDriveStatus(businessId,true);}catch(ignore){}
      if(action==='connect'){
        const {data,error}=await client().functions.invoke('business-drive-connect',{body:{action:'authorize-url',businessId}});
        if(error)throw error;
        if(data && data.configured===false){
          cardStatusCache={at:Date.now(),businessId,status:Object.assign({},cardStatusCache.status || {},{configured:false})};
          renderStorageSettingsCard();
          return;
        }
        if(data && data.url){window.location.href=data.url;return;}
        throw new Error('Google did not return a sign-in link.');
      }
      if(action==='disconnect'){
        if(!window.confirm('Disconnect Google Drive? New files will be stored in Office storage again. Files already in your Drive stay there.'))return;
        const {data,error}=await client().functions.invoke('business-drive-connect',{body:{action:'disconnect',businessId}});
        if(error)throw error;
        if(!data || data.status!=='PASS')throw new Error('Disconnect did not complete.');
        settingsCache.delete(businessId);
        externalPathSets.delete(businessId);
        cardStatusCache={at:0,businessId:'',status:null};
        try{await setting(businessId,true);}catch(ignore){}
        if(window.toast)window.toast('Google Drive disconnected. New files will use Office storage.');
        renderStorageSettingsCard();
      }
    }catch(error){
      if(window.toast)window.toast(text(error && error.message || error),true);
    }finally{
      button.disabled=false;button.textContent=original;
    }
  }
  function scheduleStorageSettingsCard(){queueMicrotask(()=>{try{renderStorageSettingsCard();}catch(error){console.warn('Storage Settings card:',error.message||error);}});}
  window.addEventListener('h38:office-page-rendered',event=>{if(event?.detail?.page==='settings')scheduleStorageSettingsCard();});
  window.addEventListener('h38:business-snapshot-updated',()=>{installClientRouting();if(window.state?.page==='settings')scheduleStorageSettingsCard();});

  window.H38_STORAGE_PROVIDER={
    get:businessId=>setting(businessId,true),
    supported:clientDriveAvailable?['supabase','google_drive']:['supabase'],
    defaultProvider:'supabase',
    clientDriveAvailable,
    renderSettingsCard:renderStorageSettingsCard,
    settingsRendererOwnership:false,
    safeguards:{credentialsInBrowser:false,crossTenantAccess:false,automaticCustomerRelease:false}
  };
})();
