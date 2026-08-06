#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..');
const client=fs.readFileSync(path.join(root,'commercial-app/supabase-quote-delivery.js'),'utf8');
const edge=fs.readFileSync(path.join(root,'supabase/functions/h38-quote-delivery/index.ts'),'utf8');
const index=fs.readFileSync(path.join(root,'commercial-app/index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'commercial-app/service-worker.js'),'utf8');
const portal=fs.readFileSync(path.join(root,'customer-portal-quote-delivery.js'),'utf8');
const portalHtml=fs.readFileSync(path.join(root,'customer-portal.html'),'utf8');
const portalConfig=fs.readFileSync(path.join(root,'customer-portal-config.js'),'utf8');
const sendCall=edge.lastIndexOf('await sendPortalEmail');
const pendingFile=edge.indexOf('pending_delivery');
const availableFile=edge.indexOf('available_to_customer: true',sendCall);
const checks=[
 ['Approve & Send button is explicit',client.includes("textContent='✉️ Approve & Send Quote'")],
 ['owner checkbox gates confirmation',client.includes('confirmOwnerReview:true')&&client.includes('h38QuoteDeliveryConfirm')],
 ['generic customer is blocked',client.includes('GENERIC-QUOTE-CUSTOMER')&&edge.includes('GENERIC-QUOTE-CUSTOMER')],
 ['real customer email is required',client.includes('Add a valid email address')&&edge.includes('Add a valid email address')],
 ['exact revision and total are checked',edge.includes('expectedRevision')&&edge.includes('expectedTotal')&&edge.includes('The quote total changed')],
 ['owner or administrator role is required',edge.includes('Owner or Administrator permission is required')],
 ['private PDF is generated',edge.includes('PDFDocument.create')&&edge.includes('STORAGE_BUCKET = "customer-portal"')],
 ['PDF becomes customer available only after email',pendingFile>=0&&sendCall>pendingFile&&availableFile>sendCall],
 ['Supabase secure invitation and magic link are supported',edge.includes('inviteUserByEmail')&&edge.includes('signInWithOtp')],
 ['business quote is locked as Presented',edge.includes('Status: "Presented"')&&edge.includes('"Locked Revision"')],
 ['Proof Log records external action',edge.includes('APPROVE_AND_SEND_QUOTE')&&edge.includes('external_action_occurred: true')],
 ['no payment or work starts automatically',edge.includes('No payment is charged and work does not begin automatically')&&client.includes('No payment is charged and work does not start automatically')],
 ['customer portal exposes private PDF download',portal.includes('createSignedUrl')&&portal.includes('Download quote PDF')],
 ['customer portal loads delivery enhancement',portalHtml.includes('customer-portal-quote-delivery.js?v=20260805-2050')],
 ['customer portal redirects on custom domain',portalConfig.includes("redirectUrl: 'https://highway38solutions.com/customer-portal.html'")],
 ['Business Office loads delivery script last',index.indexOf('quote-photo-restore.js')<index.indexOf('supabase-quote-delivery.js')&&index.indexOf('supabase-quote-delivery.js')<index.indexOf('supabase-no-legacy-office.js')],
 ['mobile cache is rotated and network-first',sw.includes("h38-business-office-20260805-2200")&&sw.includes("'supabase-quote-delivery.js'")],
 ['retired Apps Script is not restored',!client.includes('google.script.run')&&!edge.includes('script.google.com')]
];
let failed=0;for(const[name,pass]of checks){console.log(`${pass?'PASS':'FAIL'} ${name}`);if(!pass)failed++;}
if(failed){console.error(`${failed} secure quote delivery checks failed.`);process.exit(1);}console.log('Secure quote delivery checks passed.');