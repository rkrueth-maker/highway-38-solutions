'use strict';
(()=>{
  const DB_NAME='h38-commercial-offline';
  const DB_VERSION=3;
  const STORES=['meta','snapshots','records','quotes','operations','attachments','drafts','voice','logs'];
  let dbPromise;
  function openDb(){if(dbPromise)return dbPromise;dbPromise=new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,DB_VERSION);request.onupgradeneeded=()=>{const db=request.result;STORES.forEach(name=>{if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:'id'});});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return dbPromise;}
  async function transaction(store,mode,handler){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode),objectStore=tx.objectStore(store);let result;try{result=handler(objectStore);}catch(error){reject(error);return;}tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);});}
  async function put(store,value){await transaction(store,'readwrite',os=>os.put(value));return value;}
  async function bulkPut(store,values){await transaction(store,'readwrite',os=>(values||[]).forEach(value=>os.put(value)));return values;}
  async function get(store,id){const db=await openDb();return new Promise((resolve,reject)=>{const request=db.transaction(store,'readonly').objectStore(store).get(id);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);});}
  async function all(store){const db=await openDb();return new Promise((resolve,reject)=>{const request=db.transaction(store,'readonly').objectStore(store).getAll();request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>reject(request.error);});}
  async function remove(store,id){await transaction(store,'readwrite',os=>os.delete(id));}
  async function clearStore(store){await transaction(store,'readwrite',os=>os.clear());}
  async function clearAll(){const db=await openDb();for(const store of STORES){await new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}}
  async function count(store){const db=await openDb();return new Promise((resolve,reject)=>{const request=db.transaction(store,'readonly').objectStore(store).count();request.onsuccess=()=>resolve(request.result||0);request.onerror=()=>reject(request.error);});}
  function newId(prefix='ID'){return `${prefix}-${crypto.randomUUID().toUpperCase()}`;}
  window.H38DB={put,get,all,remove,clearAll,newId};
})();
