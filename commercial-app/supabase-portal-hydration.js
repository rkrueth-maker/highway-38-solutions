(function () {
  'use strict';

  const config=window.H38_BUSINESS_OFFICE_SUPABASE || {};
  const auth=window.H38_SUPABASE_AUTH;
  const Bridge=window.H38Bridge;
  if(!auth || auth.enabled!==true || !Bridge || !Bridge.prototype || !window.supabase)return;

  const previousRequest=Bridge.prototype.request;
  let dbClient=null;

  function client(){
    if(dbClient)return dbClient;
    dbClient=window.supabase.createClient(config.url,config.publishableKey,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'},
      global:{headers:{'x-client-info':'highway-38-business-office-portal-hydration'}}
    });
    return dbClient;
  }
  function text(value){return String(value==null?'':value);}
  function number(value){const parsed=Number(value || 0);return Number.isFinite(parsed)?parsed:0;}
  function merge(existing,incoming,idKey){
    const map=new Map();
    (incoming || []).forEach(row=>map.set(text(row[idKey]),row));
    (existing || []).forEach(row=>map.set(text(row[idKey]),row));
    return Array.from(map.values());
  }
  async function optional(promise){
    try{const response=await promise;if(response.error)throw response.error;return response.data || [];}
    catch(error){console.warn('Supabase portal hydration:',error.message || error);return [];}
  }

  async function hydrate(snapshot,businessId){
    const db=client();
    const [customers,jobs,quotes,quoteItems,invoices,messages,files]=await Promise.all([
      optional(db.from('customer_accounts').select('id,customer_code,display_name,email,status,portal_enabled,created_at,updated_at').eq('business_id',businessId).order('updated_at',{ascending:false}).limit(1000)),
      optional(db.from('customer_jobs').select('id,customer_id,job_number,title,status,next_action,due_date,progress_percent,expected_update_date,created_at,updated_at').eq('business_id',businessId).order('updated_at',{ascending:false}).limit(1000)),
      optional(db.from('customer_quotes').select('id,customer_id,job_id,quote_number,title,amount,status,version,customer_decision,decision_at,deliverables,timing,revision_allowance,exclusions,approval_consequence,created_at,updated_at').eq('business_id',businessId).order('updated_at',{ascending:false}).limit(1000)),
      optional(db.from('quote_items').select('id,quote_id,line_number,work_package,item_type,description,quantity,unit,unit_price,amount,pricing_source,owner_review_required,approved,created_at,updated_at').eq('business_id',businessId).order('quote_id').order('line_number').limit(5000)),
      optional(db.from('customer_invoices').select('id,customer_id,invoice_number,total,balance_due,status,due_date,created_at,updated_at').eq('business_id',businessId).order('updated_at',{ascending:false}).limit(1000)),
      optional(db.from('customer_messages').select('id,customer_id,job_id,body,direction,status,created_by,created_at').eq('business_id',businessId).order('created_at',{ascending:true}).limit(2000)),
      optional(db.from('customer_files').select('id,customer_id,job_id,file_name,storage_path,status,available_to_customer,created_at,updated_at').eq('business_id',businessId).order('updated_at',{ascending:false}).limit(2000))
    ]);

    const customerRows=customers.map(row=>({
      'Customer ID':row.id,'Business ID':businessId,'Customer Code':row.customer_code,
      'Customer Name':row.display_name,'Email':row.email,'Phone':'',
      'Status':row.status==='active'?'Active':row.status,
      'Portal Enabled':row.portal_enabled===true,'Created Time':row.created_at,
      'Updated Time':row.updated_at,'Record Version':1,'Supabase Portal Record':true
    }));
    const jobRows=jobs.map(row=>({
      'Job ID':row.id,'Business ID':businessId,'Customer ID':row.customer_id,
      'Job Number':row.job_number,'Project Title':row.title,'Status':row.status,
      'Next Action':row.next_action || '','Due Date':row.due_date || '',
      'Expected Update Date':row.expected_update_date || '',
      'Progress Percent':number(row.progress_percent),'Created Time':row.created_at,
      'Updated Time':row.updated_at,'Record Version':1,'Supabase Portal Record':true
    }));
    const linesByQuote=new Map();
    quoteItems.forEach(row=>{
      const list=linesByQuote.get(row.quote_id) || [];
      list.push({
        'Quote Line ID':row.id,'Line Number':row.line_number,'Work Package':row.work_package || '',
        'Item Type':row.item_type,'Description':row.description,'Quantity':number(row.quantity),
        'Unit':row.unit,'Unit Price':number(row.unit_price),'Amount':number(row.amount),
        'Pricing Source':row.pricing_source,'Owner Review Required':row.owner_review_required===true,
        'Approved':row.approved===true
      });
      linesByQuote.set(row.quote_id,list);
    });
    const quoteRows=quotes.map(row=>({
      'Quote ID':row.id,'Business ID':businessId,'Customer ID':row.customer_id,
      'Job ID':row.job_id || '','Quote Number':row.quote_number,'Project Title':row.title,
      'Status':row.status,'Revision':number(row.version),'Subtotal':number(row.amount),
      'Tax':0,'Total':number(row.amount),'Customer Decision':row.customer_decision || '',
      'Decision Time':row.decision_at || '','Deliverables':row.deliverables || '',
      'Timing':row.timing || '','Revision Allowance':row.revision_allowance || '',
      'Exclusions':row.exclusions || '','Approval Consequence':row.approval_consequence || '',
      'Created Time':row.created_at,'Updated Time':row.updated_at,'Record Version':1,
      'Supabase Portal Record':true,lines:linesByQuote.get(row.id) || []
    }));
    const invoiceRows=invoices.map(row=>({
      'Invoice ID':row.id,'Business ID':businessId,'Customer ID':row.customer_id,
      'Invoice Number':row.invoice_number,'Status':row.status,'Due Date':row.due_date || '',
      'Subtotal':number(row.total),'Tax':0,'Total':number(row.total),'Balance':number(row.balance_due),
      'Created Time':row.created_at,'Updated Time':row.updated_at,'Record Version':1,
      'Supabase Portal Record':true
    }));

    const threadMap=new Map();
    const portalMessageRows=messages.map(row=>{
      const threadId=`PORTAL-CUSTOMER-${row.customer_id}`;
      if(!threadMap.has(threadId))threadMap.set(threadId,{
        'Portal Thread ID':threadId,'Business ID':businessId,'Customer ID':row.customer_id,
        'Subject':'Customer portal conversation','Status':'Active','Created Time':row.created_at,
        'Updated Time':row.created_at,'Record Version':1,'Supabase Portal Record':true
      });
      return {
        'Portal Message ID':row.id,'Business ID':businessId,'Portal Thread ID':threadId,
        'Customer ID':row.customer_id,'Job ID':row.job_id || '','Body':row.body,
        'Direction':row.direction,'Status':row.status,'Created By':row.created_by,
        'Created Time':row.created_at,'Record Version':1,'Supabase Portal Record':true
      };
    });
    const documentRows=files.map(row=>({
      'Document ID':row.id,'Business ID':businessId,'Customer ID':row.customer_id,
      'Job ID':row.job_id || '','File Name':row.file_name,'Mime Type':'',
      'File Size':0,'Source Type':row.job_id?'Job':'Customer','Source ID':row.job_id || row.customer_id,
      'Access Classification':row.available_to_customer?'Customer Available':'Internal',
      'Storage Provider':'supabase','Storage Path':row.storage_path,'Status':row.status,
      'Created Time':row.created_at,'Updated Time':row.updated_at,'Record Version':1,
      'Supabase Portal Record':true
    }));

    snapshot.customers=merge(snapshot.customers,customerRows,'Customer ID');
    snapshot.jobs=merge(snapshot.jobs,jobRows,'Job ID');
    snapshot.quotes=merge(snapshot.quotes,quoteRows,'Quote ID');
    snapshot.invoices=merge(snapshot.invoices,invoiceRows,'Invoice ID');
    snapshot.portalThreads=merge(snapshot.portalThreads,Array.from(threadMap.values()),'Portal Thread ID');
    snapshot.portalMessages=merge(snapshot.portalMessages,portalMessageRows,'Portal Message ID');
    snapshot.documents=merge(snapshot.documents,documentRows,'Document ID');
    snapshot.portalFoundationConnected=true;
    return snapshot;
  }

  Bridge.prototype.request=async function(action,args,timeout){
    const result=await previousRequest.call(this,action,args,timeout);
    if(action!=='fullStartupRefresh' && action!=='completionBootstrap')return result;
    const businessId=text(args && args.businessId || auth.getState().selectedBusinessId);
    return businessId?hydrate(result,businessId):result;
  };

  window.H38_SUPABASE_PORTAL_HYDRATION={enabled:true,readOnly:true,googleRecordsImported:false};
})();
