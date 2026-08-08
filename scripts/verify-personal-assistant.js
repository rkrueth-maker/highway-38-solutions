#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const failures=[];
const check=(condition,message)=>{if(!condition)failures.push(message);};
const assistant=read('commercial-app/personal-assistant.js');
const css=read('commercial-app/personal-assistant.css');
const loader=read('commercial-app/supabase-no-legacy-office.js');
const sw=read('commercial-app/service-worker.js');
const migration=read('supabase/migrations/20260808034500_personal_assistant_private_records.sql');
try{new vm.Script(assistant,{filename:'personal-assistant.js'});}catch(error){failures.push(`Personal Assistant syntax: ${error.message}`);}
try{new vm.Script(sw,{filename:'service-worker.js'});}catch(error){failures.push(`Service worker syntax: ${error.message}`);}
check(assistant.includes("const BUILD='20260807-2245'"),'Personal Assistant build marker is missing.');
check(assistant.includes("const TABLE='personal_assistant_items'"),'Personal Assistant must use its private table.');
check(assistant.includes('privateUserRecords:true'),'Personal Assistant private-user marker is missing.');
check(assistant.includes("window.H38DB.put('records'")&&assistant.includes("kind:CACHE_KIND"),'Personal Assistant user-scoped offline cache is missing.');
check(assistant.includes("window.H38_SUPABASE_SHARED_CLIENT?.ensure?.()"),'Personal Assistant must reuse the authenticated shared Supabase client.');
check(assistant.includes("item_type==='routine'")&&assistant.includes("frequency==='daily'")&&assistant.includes("frequency==='weekly'")&&assistant.includes("frequency==='monthly'"),'Recurring personal routines are incomplete.');
check(assistant.includes('Quick capture')&&assistant.includes('Ask / command the assistant')&&assistant.includes('Business watch'),'Personal Assistant primary workflow surfaces are incomplete.');
check(assistant.includes('scanDueReminders')&&assistant.includes('showNotification')&&assistant.includes("Notification.requestPermission"),'Device reminder support is incomplete.');
check(assistant.includes('automaticCustomerSending:false')&&assistant.includes('automaticApproval:false')&&assistant.includes('automaticPurchasing:false')&&assistant.includes('automaticPayment:false'),'Personal Assistant external-action gates are incomplete.');
check(!assistant.includes("aiBuildQuoteDraft")&&!assistant.includes("supabase-quote-ai")&&!assistant.includes("quote-working-hammer"),'Personal Assistant must not depend on or modify Quote AI runtime.');
check(!assistant.includes('service_role')&&!assistant.includes('SUPABASE_SERVICE_ROLE_KEY'),'Personal Assistant browser code must not contain privileged Supabase credentials.');
check(loader.includes("personal-assistant.css?build=20260807-2245")&&loader.includes("personal-assistant.js?build=20260807-2245")&&loader.includes('loadPersonalAssistant();'),'Office loader does not load Personal Assistant.');
check(/CACHE_NAME='h38-business-office-\d{8}-\d{4}'/.test(sw)&&sw.includes("'personal-assistant.js'")&&sw.includes("'personal-assistant.css'")&&sw.includes("notificationclick"),'Personal Assistant offline/reminder service-worker integration is incomplete.');
check(css.includes('.pa-grid')&&css.includes('@media(max-width:620px)'),'Personal Assistant mobile layout is incomplete.');
check(migration.includes('create table if not exists public.personal_assistant_items'),'Private Personal Assistant table migration is missing.');
check(migration.includes('alter table public.personal_assistant_items enable row level security'),'Personal Assistant RLS must be enabled.');
check(migration.includes('revoke all on table public.personal_assistant_items from anon'),'Anonymous Personal Assistant table access must be revoked.');
check(migration.includes('grant select, insert, update, delete on table public.personal_assistant_items to authenticated'),'Authenticated Data API grants are missing.');
check((migration.match(/create policy/g)||[]).length===4,'Personal Assistant needs select, insert, update and delete RLS policies.');
check((migration.match(/\(select auth\.uid\(\)\) = user_id/g)||[]).length>=4,'Personal Assistant policies must bind rows to auth.uid().');
check(!migration.includes('business_memberships')&&!migration.includes('business_records'),'Personal Assistant private records must not be stored as shared business records.');
if(failures.length){console.error(JSON.stringify({status:'FAIL',acceptance:'PRIVATE_PERSONAL_ASSISTANT',failures},null,2));process.exit(1);}
console.log(JSON.stringify({status:'PASS',acceptance:'PRIVATE_PERSONAL_ASSISTANT',build:'20260807-2245',privateUserRecords:true,offlineCache:true,deviceReminders:true,businessContextRead:true,quoteAiTouched:false,externalActionsAutomatic:false},null,2));