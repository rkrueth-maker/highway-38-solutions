const DB_NAME='h38-commercial-offline';
const DB_VERSION=1;
const STORES=['meta','snapshots','quotes','operations'];
let dbPromise;
function openDb(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{const db=request.result;STORES.forEach(name=>{if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:'id'});});};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  return dbPromise;
}
async function tx(store,mode,work){const db=await openDb();return new Promise((resolve,reject)=>{const transaction=db.transaction(store,mode),objectStore=transaction.objectStore(store);let value;try{value=work(objectStore);}catch(error){reject(error);return;}transaction.oncomplete=()=>resolve(value);transaction.onerror=()=>reject(transaction.error);});}
export async function put(store,value){await tx(store,'readwrite',objectStore=>objectStore.put(value));return value;}
export async function get(store,id){const db=await openDb();return new Promise((resolve,reject)=>{const request=db.transaction(store,'readonly').objectStore(store).get(id);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);});}
export async function all(store){const db=await openDb();return new Promise((resolve,reject)=>{const request=db.transaction(store,'readonly').objectStore(store).getAll();request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>reject(request.error);});}
export async function remove(store,id){await tx(store,'readwrite',objectStore=>objectStore.delete(id));}
export async function clearAll(){const db=await openDb();await Promise.all(STORES.map(store=>new Promise((resolve,reject)=>{const transaction=db.transaction(store,'readwrite');transaction.objectStore(store).clear();transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);})));}
export function newId(prefix='ID'){return `${prefix}-${crypto.randomUUID().toUpperCase()}`;}
