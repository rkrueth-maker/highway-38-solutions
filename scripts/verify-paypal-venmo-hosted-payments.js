#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const json=p=>JSON.parse(read(p));
const {validateConfig,validateHostedPayment}=require('../core-engine/customer-portal/lib/customer-portal-core');

const passes=[];
const failures=[];
function check(name,condition,detail=''){(condition?passes:failures).push({name,detail});}
function expectThrow(name,fn,contains){try{fn();failures.push({name,detail:'Expected an error but none was thrown.'});}catch(error){check(name,!contains||String(error.message).includes(contains),String(error.message));}}

const portal=json('core-engine/customer-portal/config/customer-portal.default.json');
const activation=json('core-engine/revenue-operations/config/provider-activation.json');
const northernDeployment=json('businesses/northern-lakes/app-deployment.json');
const northernPack=json('business-packs/northern-lakes/supabase-business-pack.json');
const h38Public=read('customer-portal-config.js');
const northernPublic=read('businesses/northern-lakes/customer-portal-config.js');
const adapters=read('apps-script/core-engine/owner-portal-next/Portal_Adapters.js');
const moduleContract=read('apps-script/business-office/BusinessOffice_ModuleContract.gs');

check('shared customer portal config remains valid',validateConfig(portal).length===0,validateConfig(portal).join(' '));
check('shared portal remains fail closed',portal.payments.approvedProviders.length===0&&portal.externalActions.paymentProcessing===false&&portal.externalActions.paymentRequest===false);
check('PayPal Commerce is supported provider',portal.payments.supportedProviders.includes('paypal-commerce'));
check('Venmo is a supported hosted method',portal.payments.supportedPaymentMethods.includes('Venmo')&&portal.payments.venmo.viaProvider==='paypal-commerce'&&portal.payments.venmo.providerHostedOnly===true);
check('Venmo stays US/USD scoped',portal.payments.venmo.merchantRegion==='US'&&portal.payments.venmo.customerRegion==='US'&&portal.payments.venmo.currency==='USD');
check('wallet and card credentials remain forbidden',portal.payments.rawCardDataAllowed===false&&portal.payments.rawWalletCredentialsAllowed===false);

const paymentProvider=activation.providers.find(row=>row.slot==='payments');
check('shared payment provider is PayPal Commerce',paymentProvider?.provider==='paypal-commerce');
check('payment provider cannot execute before connection',paymentProvider?.liveExecution===false&&paymentProvider?.credentialState==='MISSING'&&paymentProvider?.accountApprovalState==='BUSINESS_ACCOUNT_CONNECTION_REQUIRED');
check('provider declares Venmo',paymentProvider?.supportedPaymentMethods?.includes('Venmo')&&paymentProvider?.venmo?.enabledWhenProviderLive===true);
check('provider keeps hosted-only wallet security',activation.paymentSecurity.providerHostedWalletEntryRequired===true&&activation.paymentSecurity.rawVenmoCredentialsAllowed===false);

const runtime=JSON.parse(JSON.stringify(portal));
runtime.payments.approvedProviders=['paypal-commerce'];
const claims={tenantKey:'tenant-one',customerId:'CUST-001',permissions:['payments.own.hosted']};
const invoice={id:'INV-001',tenantKey:'tenant-one',customerId:'CUST-001',balanceDue:250};
const metadata=validateHostedPayment({claims,invoice,config:runtime,hostedUrl:'https://www.paypal.com/ncp/payment/TESTONLY',provider:'paypal-commerce'});
check('PayPal hosted link validates after explicit provider approval',metadata.provider==='paypal-commerce'&&metadata.rawCardDataStored===false&&metadata.externalActionOccurred===false);
expectThrow('provider remains blocked before approval',()=>validateHostedPayment({claims,invoice,config:portal,hostedUrl:'https://www.paypal.com/ncp/payment/TESTONLY',provider:'paypal-commerce'}),'not approved');
expectThrow('non-HTTPS hosted link blocked',()=>validateHostedPayment({claims,invoice,config:runtime,hostedUrl:'http://www.paypal.com/ncp/payment/TESTONLY',provider:'paypal-commerce'}),'scheme');
expectThrow('cross-customer invoice blocked',()=>validateHostedPayment({claims,invoice:{...invoice,customerId:'CUST-002'},config:runtime,hostedUrl:'https://www.paypal.com/ncp/payment/TESTONLY',provider:'paypal-commerce'}),'Cross-customer');

check('H38 public config is Venmo ready but live-off',/provider:\s*'paypal-commerce'/.test(h38Public)&&/venmoViaPayPalHostedCheckout:\s*true/.test(h38Public)&&/liveChargingEnabled:\s*false/.test(h38Public));
check('Northern public config is Venmo ready but live-off',/provider:\s*'paypal-commerce'/.test(northernPublic)&&/venmoViaPayPalHostedCheckout:\s*true/.test(northernPublic)&&/liveChargingEnabled:\s*false/.test(northernPublic));
check('Northern deployment agrees on provider state',northernDeployment.paymentProvider==='paypal-commerce'&&northernDeployment.liveChargingEnabled===false&&northernDeployment.paymentMethodsPrepared.includes('Venmo'));
check('Northern business pack agrees on provider state',northernPack.customerPortal.paymentProvider==='paypal-commerce'&&northernPack.customerPortal.liveChargingEnabled===false&&northernPack.customerPortal.paymentMethodsPrepared.includes('Venmo'));
check('owner integration registry exposes PayPal and Venmo',/id:'paypal'/.test(adapters)&&/id:'venmo'/.test(adapters)&&/Venmo \(via PayPal\)/.test(adapters));
check('manual payment records retain settled payment method',/boUnifiedModule_\('payments'/.test(moduleContract)&&/Payment Method/.test(moduleContract));

const evidence={
  status:failures.length?'HOLD':'PASS',
  generatedAt:new Date().toISOString(),
  provider:'paypal-commerce',
  methodsPrepared:['PayPal','Venmo','Credit Card','Debit Card'],
  liveChargingEnabled:false,
  ownerApprovalRequired:true,
  rawCardDataStored:false,
  rawWalletCredentialsStored:false,
  externalActionsOccurred:false,
  passed:passes.length,
  failed:failures.length,
  passes,
  failures
};
const out=path.join(ROOT,'artifacts','payment-acceptance');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'paypal-venmo-hosted-payment-acceptance.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
process.exit(failures.length?1:0);
