(function(){
'use strict';
const BUILD='20260912-invoice-delete-lifecycle-1';
const text=v=>String(v==null?'':v).trim();
function removed(row){const status=text(row?.Status??row?.status).toUpperCase(),flag=row?.Deleted??row?.deleted;return /DELET|VOID/.test(status)||flag===true||text(flag).toLowerCase()==='true';}
function withActiveInvoices(run){const base=window.records;if(typeof base!=='function')return run();window.records=function(name){const list=base.apply(this,arguments);return name==='invoices'&&Array.isArray(list)?list.filter(row=>!removed(row)):list;};try{return run();}finally{window.records=base;}}
function patch(){const api=window.H38_JOB_LIFECYCLE;if(!api||api.__h38InvoiceDeleteLifecycle)return false;if(typeof api.analyzeJob==='function'){const base=api.analyzeJob;api.analyzeJob=job=>withActiveInvoices(()=>base(job));}if(typeof api.all==='function'){const base=api.all;api.all=()=>withActiveInvoices(()=>base());}api.__h38InvoiceDeleteLifecycle=true;window.H38_INVOICE_DELETE_LIFECYCLE=Object.freeze({build:BUILD,deletedInvoicesExcluded:true});return true;}
function start(){if(patch())return;let tries=0;const timer=setInterval(()=>{tries++;if(patch()||tries>=120)clearInterval(timer);},250);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
