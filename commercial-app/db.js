'use strict';
(()=>{
  const DB_NAME='h38-commercial-offline';
  const DB_VERSION=4;
  const STORES=['meta','snapshots','records','quotes','operations','attachments','drafts','voice','logs'];
  const GLOBAL_META_IDS=new Set(['settings']);
  let dbPromise;
  let activeScope='';

  // Connection lifecycle (fixed 2026-10-26): this module used to cache one
  // connection forever with no versionchange/close handling. When the
  // browser closed that connection — a newer build's upgrade arriving from
  // another tab, a storage purge, a discarded tab — every later call threw
  // "Failed to execute 'transaction' on 'IDBDatabase': The database
  // connection is closing", nothing ever recovered it, and the failure
  // surfaced as business switches dumping the user to sign-in. The mirror
  // image hurt too: an open that needed an upgrade was BLOCKED by this
  // tab's unclosed old connection, hanging sign-in for 30–90 seconds.
  // Now: yield immediately on versionchange, forget a closed connection,
  // never cache a failed open, and retry a closing-connection failure once
  // on a fresh connection.
  function isClosingError(error){
    if(!error)return false;
    const name=String(error.name||''),message=String(error.message||error||'');
    return name==='InvalidStateError'||/database connection is closing|connection is closing/i.test(message);
  }
  function openDb(){
    if(dbPromise)return dbPromise;
    const promise=new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB_NAME,DB_VERSION);
      request.onupgradeneeded=()=>{
        const db=request.result;
        STORES.forEach(name=>{if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:'id'});});
      };
      request.onsuccess=()=>{
        const db=request.result;
        db.onversionchange=()=>{try{db.close();}catch(_){}if(dbPromise===promise)dbPromise=null;};
        db.onclose=()=>{if(dbPromise===promise)dbPromise=null;};
        resolve(db);
      };
      request.onblocked=()=>{try{console.warn('H38DB: offline database open is waiting on another connection to close.');}catch(_){}}
      request.onerror=()=>reject(request.error);
    });
    dbPromise=promise;
    promise.catch(()=>{if(dbPromise===promise)dbPromise=null;});
    return promise;
  }
  async function withDb(handler){
    for(let attempt=0;attempt<2;attempt++){
      const db=await openDb();
      try{return await handler(db);}
      catch(error){
        if(attempt===0&&isClosingError(error)){dbPromise=null;continue;}
        throw error;
      }
    }
  }

  function normalizedUserId(userId){
    const value=String(userId||'').trim().toLowerCase();
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value))throw new Error('A valid authenticated user is required for offline storage.');
    return value;
  }
  function setUserScope(userId){
    const nextScope=`user:${normalizedUserId(userId)}`;
    if(activeScope&&activeScope!==nextScope)window.dispatchEvent(new CustomEvent('h38:auth-cleared'));
    activeScope=nextScope;
    return activeScope;
  }
  function clearUserScope(){activeScope='';}
  function getUserScope(){return activeScope.replace(/^user:/,'');}
  function isGlobal(store,id){return store==='meta'&&GLOBAL_META_IDS.has(String(id));}
  function physicalId(store,id,scope=activeScope){
    const value=String(id||'');
    if(isGlobal(store,value))return value;
    if(!scope)return'';
    return`${scope}:${value}`;
  }
  function encode(store,value){
    if(!value||value.id===undefined||value.id===null)throw new Error(`Offline ${store} record requires an id.`);
    const originalId=String(value.__h38OriginalId||value.id);
    if(isGlobal(store,originalId))return{...value,id:originalId,__h38OriginalId:originalId,__h38Scope:'global'};
    if(!activeScope)throw new Error('Sign in is required before saving.');
    return{...value,id:physicalId(store,originalId),__h38OriginalId:originalId,__h38Scope:activeScope};
  }
  function decode(store,value){
    if(!value)return null;
    const expected=isGlobal(store,value.__h38OriginalId||value.id)?'global':activeScope;
    if(!expected||value.__h38Scope!==expected)return null;
    const output={...value,id:String(value.__h38OriginalId||value.id)};
    delete output.__h38OriginalId;
    delete output.__h38Scope;
    return output;
  }
  async function transaction(store,mode,handler){
    return withDb(db=>new Promise((resolve,reject)=>{
      const tx=db.transaction(store,mode),objectStore=tx.objectStore(store);let result;
      try{result=handler(objectStore);}catch(error){reject(error);return;}
      tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Offline transaction was aborted.'));
    }));
  }
  async function put(store,value){const stored=encode(store,value);await transaction(store,'readwrite',os=>os.put(stored));return value;}
  async function bulkPut(store,values){const stored=(values||[]).map(value=>encode(store,value));await transaction(store,'readwrite',os=>stored.forEach(value=>os.put(value)));return values;}
  async function get(store,id){
    const key=physicalId(store,id);if(!key)return null;
    return withDb(db=>new Promise((resolve,reject)=>{const request=db.transaction(store,'readonly').objectStore(store).get(key);request.onsuccess=()=>resolve(decode(store,request.result));request.onerror=()=>reject(request.error);}));
  }
  async function rawAll(store){
    return withDb(db=>new Promise((resolve,reject)=>{const request=db.transaction(store,'readonly').objectStore(store).getAll();request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>reject(request.error);}));
  }
  async function all(store){return(await rawAll(store)).map(value=>decode(store,value)).filter(Boolean);}
  async function remove(store,id){const key=physicalId(store,id);if(!key)return;await transaction(store,'readwrite',os=>os.delete(key));}
  async function clearStoreForScope(store,scope){
    const rows=await rawAll(store);
    const keys=rows.filter(row=>row&&row.__h38Scope===scope).map(row=>row.id);
    if(!keys.length)return;
    await transaction(store,'readwrite',os=>keys.forEach(key=>os.delete(key)));
  }
  async function clearCurrentScope(){if(!activeScope)return;for(const store of STORES)await clearStoreForScope(store,activeScope);}
  async function clearUserData(userId){const scope=`user:${normalizedUserId(userId)}`;for(const store of STORES)await clearStoreForScope(store,scope);}
  async function clearAll(){await clearCurrentScope();}
  async function count(store){return(await all(store)).length;}
  async function legacyDataPresent(){
    for(const store of STORES.filter(name=>name!=='meta')){
      const rows=await rawAll(store);if(rows.some(row=>row&&!row.__h38Scope))return true;
    }
    const meta=await rawAll('meta');return meta.some(row=>row&&!row.__h38Scope&&!GLOBAL_META_IDS.has(String(row.id||'')));
  }
  function newId(prefix='ID'){return`${prefix}-${crypto.randomUUID().toUpperCase()}`;}

  window.H38DB={put,bulkPut,get,all,remove,clearAll,clearCurrentScope,clearUserData,setUserScope,clearUserScope,getUserScope,legacyDataPresent,count,newId};
})();
