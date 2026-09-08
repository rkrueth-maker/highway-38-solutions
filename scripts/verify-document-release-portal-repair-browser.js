const path=require('path');
const {chromium}=require('playwright');
const repair=path.resolve(__dirname,'../commercial-app/document-release-portal-repair.js');
function assert(condition,message){if(!condition)throw new Error(message);console.log('PASS:',message);}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
   const page=await browser.newPage({viewport});
   await page.setContent('<!doctype html><html><body><main id="mainContent"><section id="h38CustomerReleaseCard"><button id="releaseBtn" data-release="D-1">Release to customer</button></section></main></body></html>');
   await page.evaluate(()=>{
    const ACCOUNT='11111111-1111-4111-8111-111111111111',PORTAL_JOB='22222222-2222-4222-8222-222222222222',FILE='33333333-3333-4333-8333-333333333333',NEW_ACCOUNT='44444444-4444-4444-8444-444444444444';
    window.__ids={ACCOUNT,PORTAL_JOB,FILE,NEW_ACCOUNT};window.__calls=[];window.__oldCalled=false;window.__toasts=[];window.__mode='existing-email';window.__customerFile=null;
    const records={
      documents:{
        'D-1':{id:'BR-D1',record_key:'D-1',payload:{'Document ID':'D-1','Customer ID':'C-LEGACY-1','Job ID':'J-LEGACY-1','File Name':'heater-photo.jpg','Storage Path':'B-1/Job/J-LEGACY-1/D-1-heater-photo.jpg','Access Classification':'Internal'}},
        'D-2':{id:'BR-D2',record_key:'D-2',payload:{'Document ID':'D-2','Customer ID':'C-LEGACY-2','Job ID':'J-LEGACY-2','File Name':'panel-photo.jpg','Storage Path':'B-1/Job/J-LEGACY-2/D-2-panel-photo.jpg','Access Classification':'Internal'}}
      },
      documentIntakeLinks:{
        'D-1':{id:'BR-L1',record_key:'D-1',payload:{'Document ID':'D-1','Customer ID':'C-LEGACY-1','Job ID':'J-LEGACY-1','Customer Released':false}},
        'D-2':{id:'BR-L2',record_key:'D-2',payload:{'Document ID':'D-2','Customer ID':'C-LEGACY-2','Job ID':'J-LEGACY-2','Customer Released':false}}
      }
    };
    window.__records=records;
    window.state={page:'documents',businessId:'B-1',snapshot:{customers:[
      {'Customer ID':'C-LEGACY-1','Customer Name':'North Shop','Email':'owner@northshop.test'},
      {'Customer ID':'C-LEGACY-2','Customer Name':'South Shop','Email':'office@southshop.test'}
    ],jobs:[
      {'Job ID':'J-LEGACY-1','Customer ID':'C-LEGACY-1','Job Number':'H38-1001','Project Title':'Garage heater repair'},
      {'Job ID':'J-LEGACY-2','Customer ID':'C-LEGACY-2','Job Number':'H38-1002','Project Title':'Electrical panel inspection'}
    ]}};
    window.H38_SUPABASE_AUTH={getState:()=>({selectedBusinessId:'B-1',userId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'})};
    window.toast=(message,bad)=>window.__toasts.push({message:String(message),bad:!!bad});window.renderDocuments=()=>{};
    window.H38_DOCUMENT_SERVICE_RUNTIME={releaseDocument:async()=>{window.__oldCalled=true;throw new Error('legacy release called');}};
    class Query{
      constructor(table){this.table=table;this.action='select';this.payload=null;this.filters={};this.ins=[];this.like={};this.columns='*';}
      select(columns){this.columns=columns||'*';return this;} eq(k,v){this.filters[k]=v;return this;} ilike(k,v){this.like[k]=v;return this;} in(k,v){this.ins.push([k,v]);return this;}
      insert(payload){this.action='insert';this.payload=payload;return this;} update(payload){this.action='update';this.payload=payload;return this;}
      maybeSingle(){return this.run(false);} single(){return this.run(true);} then(resolve,reject){return this.run(false).then(resolve,reject);}
      async run(single){const call={table:this.table,action:this.action,payload:this.payload,filters:{...this.filters},like:{...this.like},single};window.__calls.push(call);
        if(this.table==='business_records'){
          if(this.action==='select'){const group=records[this.filters.collection]||{};const row=group[this.filters.record_key]||Object.values(group).find(r=>r.id===this.filters.id)||null;return{data:row,error:null};}
          if(this.action==='update'){for(const group of Object.values(records)){const row=Object.values(group).find(r=>r.id===this.filters.id);if(row){row.payload=this.payload.payload||row.payload;break;}}return{data:null,error:null};}
          if(this.action==='insert'){const group=records[this.payload.collection]||(records[this.payload.collection]={});group[this.payload.record_key]={id:`NEW-${this.payload.record_key}`,record_key:this.payload.record_key,payload:this.payload.payload};return{data:null,error:null};}
        }
        if(this.table==='customer_accounts'){
          if(this.action==='select'){
            if(window.__mode==='existing-email'&&this.like.email)return{data:{id:ACCOUNT,customer_code:'OLD-CODE',email:'owner@northshop.test',status:'active',portal_enabled:true},error:null};
            return{data:null,error:null};
          }
          if(this.action==='insert'){return{data:{id:NEW_ACCOUNT,customer_code:this.payload.customer_code,email:this.payload.email,status:'invited',portal_enabled:true},error:null};}
        }
        if(this.table==='customer_jobs'){
          if(window.__mode==='existing-email'&&this.action==='select'&&this.filters.job_number==='H38-1001')return{data:{id:PORTAL_JOB,customer_id:ACCOUNT,job_number:'H38-1001'},error:null};
          return{data:null,error:null};
        }
        if(this.table==='customer_files'){
          if(this.action==='select')return{data:window.__customerFile,error:null};
          if(this.action==='insert'){const id=window.__mode==='existing-email'?FILE:'55555555-5555-4555-8555-555555555555';window.__customerFile={id,...this.payload};return{data:window.__customerFile,error:null};}
          if(this.action==='update'){window.__customerFile={...(window.__customerFile||{}),...this.payload};return{data:{id:window.__customerFile.id},error:null};}
        }
        if(this.table==='business_proof_log'&&this.action==='insert')return{data:null,error:null};
        return{data:null,error:null};
      }
    }
    const client={from:table=>new Query(table)};window.H38_SUPABASE_SHARED_CLIENT={ensure:()=>client};
    document.getElementById('releaseBtn').onclick=()=>{window.__oldCalled=true;};
   });
   await page.addScriptTag({path:repair});
   await page.locator('#releaseBtn').click();
   await page.waitForFunction(()=>window.__toasts.some(t=>t.message==='File released to the customer portal.'));
   const first=await page.evaluate(()=>({calls:window.__calls,old:window.__oldCalled,records:window.__records,file:window.__customerFile,ids:window.__ids,runtime:window.H38_DOCUMENT_RELEASE_PORTAL_REPAIR}));
   assert(first.old===false,`capture repair blocks legacy release handler at ${viewport.width}px`);
   assert(first.calls.some(c=>c.table==='customer_accounts'&&c.action==='select'&&c.filters.customer_code==='C-LEGACY-1'),`Business customer code lookup runs at ${viewport.width}px`);
   assert(first.calls.some(c=>c.table==='customer_accounts'&&c.action==='select'&&c.like.email==='owner@northshop.test'),`email fallback resolves existing portal account at ${viewport.width}px`);
   const stage=first.calls.find(c=>c.table==='customer_files'&&c.action==='insert');
   assert(stage&&stage.payload.available_to_customer===false,`new portal file is inserted private first at ${viewport.width}px`);
   assert(stage.payload.customer_id===first.ids.ACCOUNT,`customer_files receives portal account UUID rather than Business Customer ID at ${viewport.width}px`);
   assert(stage.payload.job_id===first.ids.PORTAL_JOB,`customer_files receives portal job UUID rather than Business Job ID at ${viewport.width}px`);
   assert(first.calls.some(c=>c.table==='customer_files'&&c.action==='update'&&c.payload.available_to_customer===true),`explicit second step releases staged file at ${viewport.width}px`);
   assert(first.records.documents['D-1'].payload['Customer ID']==='C-LEGACY-1'&&first.records.documents['D-1'].payload['Portal Customer Account ID']===first.ids.ACCOUNT,`Business document retains internal identity and records portal identity at ${viewport.width}px`);
   assert(first.records.documentIntakeLinks['D-1'].payload['Customer Released']===true,`document intake link records customer release at ${viewport.width}px`);
   const proof=first.calls.find(c=>c.table==='business_proof_log'&&c.action==='insert');
   assert(proof&&proof.payload.entity_id===null&&proof.payload.external_action_occurred===true,`release proof uses nullable UUID entity and records external visibility at ${viewport.width}px`);
   assert(first.runtime.automaticCustomerRelease===false&&first.runtime.automaticCustomerSending===false&&first.runtime.automaticPayment===false,`release repair keeps external actions owner-controlled at ${viewport.width}px`);
   await page.evaluate(async()=>{window.__mode='new-account';window.__calls=[];window.__customerFile=null;await window.H38_DOCUMENT_RELEASE_PORTAL_REPAIR.releaseDocument('D-2');});
   const second=await page.evaluate(()=>({calls:window.__calls,records:window.__records,file:window.__customerFile,ids:window.__ids}));
   const accountInsert=second.calls.find(c=>c.table==='customer_accounts'&&c.action==='insert');
   assert(accountInsert&&accountInsert.payload.customer_code==='C-LEGACY-2'&&accountInsert.payload.email==='office@southshop.test',`missing portal account is staged from explicit Business customer identity at ${viewport.width}px`);
   const stage2=second.calls.find(c=>c.table==='customer_files'&&c.action==='insert');
   assert(stage2&&stage2.payload.customer_id===second.ids.NEW_ACCOUNT&&stage2.payload.job_id===null&&stage2.payload.available_to_customer===false,`unmapped portal job safely releases at customer level without inventing a job at ${viewport.width}px`);
   assert(!second.calls.some(c=>['customer_messages','scheduleEvents','payments','purchaseOrders'].includes(c.table)),`document release creates no message, schedule, purchase, or payment at ${viewport.width}px`);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+2);
   assert(!overflow,`release repair adds no page overflow at ${viewport.width}px`);
   await page.close();
  }
  console.log('Document release portal browser verification PASS');
 }finally{await browser.close();}
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
