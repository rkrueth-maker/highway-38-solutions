const fs=require('fs');
const money=fs.readFileSync('commercial-app/app-13.js','utf8');
const failures=[];
const check=(condition,message)=>{if(!condition)failures.push(message);};
check(money.includes('function invoiceRemoved(row)'), 'invoice soft-delete filter is missing');
check(money.includes('async function deleteInvoice(invoiceId)'), 'invoice delete action is missing');
check(money.includes("'Status':'Deleted'"), 'invoice delete must mark the record Deleted');
check(money.includes("'Deleted':true"), 'invoice delete must retain a deleted marker');
check(money.includes("'Deletion Mode':'Soft delete — audit retained'"), 'invoice delete must preserve audit history');
check(money.includes("records('payments').filter"), 'invoice delete must inspect payment history');
check(money.includes('cannot be deleted. Keep the audit record and use an adjustment instead.'), 'paid invoices must be protected');
check(money.includes("allInvoices.filter(row=>!invoiceRemoved(row))"), 'deleted invoices must be excluded from active Money totals');
check(money.includes('data-delete-invoice'), 'invoice rows must expose a Delete control');
check(money.includes("queueOperation('SAVE_ENTITY','Invoice'"), 'invoice delete must use the shared secure save queue');
check(!money.includes("queueOperation('DELETE"), 'invoice delete must not hard-delete the server record');
if(failures.length){console.error(failures.map(x=>'FAIL: '+x).join('\n'));process.exit(1);}
console.log('Invoice delete contract verified.');
