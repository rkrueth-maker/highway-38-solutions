'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const migration=fs.readFileSync(path.join(root,'supabase','migrations','20260927013000_quote_owner_task_lifecycle.sql'),'utf8');
const failures=[];
const pass=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'}: ${name}`);if(!ok)failures.push(name);};
const has=(text)=>migration.includes(text);

pass('shared migration creates owner-task upsert',has('private.business_office_quote_owner_task_upsert'));
pass('shared migration watches business quote records',has('business_records_quote_owner_tasks'));
pass('shared migration watches customer quote decisions',has('customer_quotes_owner_tasks'));
for(const event of ['quote.created','quote.review_required','quote.ready_to_send','quote.sent','quote.revision_requested','quote.approved','quote.declined','quote.expired']){
  pass(`supports ${event}`,has(`'${event}'`));
}
pass('owner tasks are assigned to Owner role',has("'Assigned Role', 'Owner'"));
pass('owner user assignment is retained when available',has("'Assigned User ID', coalesce(v_owner_user_id::text, '')"));
pass('tasks link back to Quote ID',has("'Quote ID', p_quote_record_key"));
pass('sent quote follow-up uses three-day due offset',/when 'quote\.sent'[\s\S]*?v_due_days := 3;/.test(migration));
pass('revision requests become urgent owner work',/when 'quote\.revision_requested'[\s\S]*?v_priority := 'Urgent';/.test(migration));
pass('accepted quote creates work handoff task',has('Turn accepted quote into work: '));
pass('superseded lifecycle tasks are completed',has("'Completion Reason', 'Superseded by quote lifecycle stage ' || p_event"));
pass('auto tasks are duplicate-safe per quote revision',has("p_quote_record_key || '|' || p_event || '|' || v_revision"));
pass('no automatic external action is recorded',has("'External Action Occurred', false"));
pass('no external-action function invocation exists',!/(?:sendEmail|fetch|charge|purchase|checkout)\s*\(|payment_intent/i.test(migration));
pass('security definer functions pin empty search path',(migration.match(/security definer\nset search_path = ''/g)||[]).length>=3);
pass('private functions revoke public execution',(migration.match(/revoke all on function private\./g)||[]).length>=9);

if(failures.length){console.error(`\n${failures.length} quote owner-task lifecycle check(s) failed.`);process.exit(1);} 
console.log('\nPASS: shared quote lifecycle feeds owner tasks without external actions.');
