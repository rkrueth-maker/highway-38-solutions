#!/usr/bin/env node
'use strict';

const assert=require('assert/strict');
const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const file=name=>path.join(root,name);

async function verifyOffice(page){
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error.message||error)));
  await page.setContent([
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>',
    '<body class="h38-auth-locked">',
    '<header class="topbar"><div class="brand"><div class="brand-mark">H38</div><div><strong>Highway 38 Solutions</strong><small>Business Office</small></div></div>',
    '<div class="top-actions"><span>Internet</span><button id="globalAiButton">AI</button><button id="voiceButton">Voice</button><button id="syncButton">Sync</button><button id="authSignOutButton" hidden>Sign out</button></div></header>',
    '<section class="business-bar"><span id="businessStatus">Opening securely…</span></section>',
    '<div class="app-shell"><nav id="mainNav" class="main-nav"></nav><main id="mainContent"></main></div>',
    '</body></html>'
  ].join(''));
  await page.addStyleTag({path:file('commercial-app/styles.css')});
  await page.addStyleTag({path:file('commercial-app/auth-autofill.css')});
  await page.evaluate(()=>{
    window.H38_BUSINESS_OFFICE_SUPABASE={
      enabled:true,
      url:'https://office-access-test.supabase.co',
      publishableKey:'sb_publishable_abcdefghijklmnopqrstuvwxyz123456',
      authRedirectUrl:'https://highway38solutions.com/commercial-app/',
      productionPromotionAuthorized:false,
      northernLakesEnabled:false,
      externalActionsEnabled:false
    };
    let currentSession=null;
    window.__officeAuthEvents=[];
    const membership={
      membershipId:'membership-1',
      businessId:'business-1',
      businessKey:'highway38',
      businessName:'Highway 38 Solutions',
      businessStatus:'active',
      timezone:'America/Chicago',
      brandConfig:{},
      businessModuleConfig:{},
      role:'staff',
      membershipStatus:'active',
      acceptedAt:'2026-09-10T00:00:00Z',
      modules:[]
    };
    const client={
      auth:{
        getSession:async()=>({data:{session:currentSession},error:null}),
        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
        signInWithPassword:async payload=>{
          window.__officeSignInPayload=payload;
          currentSession={access_token:'office-test-token',user:{id:'user-1',email:payload.email,user_metadata:{display_name:'Test Employee'}}};
          return {data:{session:currentSession},error:null};
        },
        resetPasswordForEmail:async()=>({error:null}),
        updateUser:async()=>({error:null}),
        signOut:async()=>({error:null})
      },
      rpc:async name=>{
        if(name!=='business_office_auth_state')throw new Error('Unexpected Office RPC: '+name);
        return {data:{status:'PASS',serverTime:'2026-09-10T00:00:00Z',memberships:[membership],safeguards:{}},error:null};
      },
      functions:{
        invoke:async(name,payload)=>{
          window.__activationRequest={name,payload};
          return {data:{status:'PASS',message:'If invited, activation was sent.'},error:null};
        }
      }
    };
    window.supabase={createClient:()=>client};
    window.H38_SUPABASE_SHARED_CLIENT={enabled:true,ensure:()=>client};
    window.H38DB={
      setUserScope:userId=>userId,
      clearUserScope:()=>true,
      getUserScope:()=>currentSession?.user?.id||'',
      put:async()=>true
    };
    window.H38Bridge=function LegacyBridge(){};
  });
  await page.addScriptTag({path:file('commercial-app/supabase-auth.js')});
  await page.addScriptTag({path:file('commercial-app/supabase-invite-activation.js')});
  await page.addScriptTag({path:file('commercial-app/auth-autofill.js')});
  await page.evaluate(()=>{
    window.__officeBridge=new window.H38Bridge(
      null,
      '',
      status=>window.__officeAuthEvents.push(status),
      startup=>{window.__officeBootstrap=startup;},
      ()=>{},
      (stage,message)=>{window.__officeError={stage,message};}
    );
    window.__officeBridge.authorize();
  });
  await page.waitForSelector('#h38ActivateInvitation');

  assert.equal(await page.locator('[data-h38-access-intent]').count(),3,'Office must offer three team guidance choices.');
  assert.equal(await page.locator('.h38-customer-access').getAttribute('href'),'../customer-portal.html','Customer choice must use the isolated portal.');
  assert.equal(await page.locator('.top-actions').isVisible(),false,'Signed-out top actions must be hidden.');
  assert.equal(await page.locator('.business-bar').isVisible(),false,'Signed-out business controls must be hidden.');
  assert.equal(await page.locator('#mainNav').isVisible(),false,'Signed-out Office navigation must be hidden.');
  assert.equal(await page.locator('.h38-access-boundary strong').textContent(),'Your choice does not grant a role.','The guidance/authorization boundary must be visible.');

  await page.locator('[data-h38-access-intent="site-manager"]').click();
  assert.equal(await page.locator('#h38AuthAudience').textContent(),'Site manager / foreman');
  assert.match(await page.locator('#h38AuthTitle').textContent(),/site operations/i);
  assert.equal(await page.locator('[data-h38-access-intent="site-manager"]').getAttribute('aria-pressed'),'true');

  await page.locator('#h38AuthEmail').fill('employee@example.test');
  await page.locator('#h38ActivateInvitation').click();
  await page.waitForFunction(()=>Boolean(window.__activationRequest));
  const activation=await page.evaluate(()=>window.__activationRequest);
  assert.equal(activation.name,'business-office-invite-activation');
  assert.deepEqual(activation.payload,{body:{email:'employee@example.test'}});

  await page.locator('[data-h38-access-intent="employee"]').click();
  await page.locator('#h38AuthPassword').fill('example-password-only');
  await page.locator('#h38AuthForm button[type="submit"]').click();
  await page.waitForFunction(()=>Boolean(window.__officeBootstrap));
  const signInPayload=await page.evaluate(()=>window.__officeSignInPayload);
  assert.deepEqual(Object.keys(signInPayload).sort(),['email','password'],'Guidance choice must not enter the Auth payload.');
  assert.equal(signInPayload.email,'employee@example.test');
  assert.equal((await page.evaluate(()=>window.__officeBootstrap.snapshot.user.roleName)),'staff','Server membership must remain role authority.');
  assert.equal(await page.evaluate(()=>Boolean(window.__officeError)),false,'Office fixture must not raise an authorization error.');

  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true,'Office access must not overflow a phone viewport.');
  assert.equal(errors.length,0,'Office access browser error(s): '+errors.join(' | '));
}

function strippedCustomerHtml(){
  return fs.readFileSync(file('customer-portal.html'),'utf8')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
    .replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi,'');
}

async function verifyCustomer(page){
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error.message||error)));
  await page.setContent(strippedCustomerHtml());
  await page.addStyleTag({path:file('ux-unified-public.css')});
  await page.evaluate(()=>{
    window.H38_CUSTOMER_PORTAL_SUPABASE={
      enabled:true,
      url:'https://customer-access-test.supabase.co',
      publishableKey:'sb_publishable_abcdefghijklmnopqrstuvwxyz123456',
      redirectUrl:'https://highway38solutions.com/customer-portal.html',
      storageBucket:'customer-portal'
    };
    window.__customerAuthCallback=null;
    const rows={
      customer_jobs:[],
      customer_quotes:[],
      customer_invoices:[],
      customer_files:[]
    };
    function query(table){
      const chain={
        select(){return chain;},
        eq(){return chain;},
        order(){return chain;},
        maybeSingle(){return Promise.resolve({data:{id:'customer-1',customer_code:'H38-100',display_name:'Customer Test',email:'customer@example.test',status:'active'},error:null});},
        then(resolve,reject){return Promise.resolve({data:rows[table]||[],error:null}).then(resolve,reject);}
      };
      return chain;
    }
    const client={
      auth:{
        getSession:async()=>({data:{session:null},error:null}),
        onAuthStateChange:callback=>{window.__customerAuthCallback=callback;return {data:{subscription:{unsubscribe(){}}}};},
        signInWithPassword:async()=>({data:{session:null},error:null}),
        signInWithOtp:async()=>({error:null}),
        signOut:async()=>({error:null})
      },
      from:table=>query(table),
      storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://example.test/file'},error:null})})}
    };
    window.supabase={createClient:()=>client};
  });
  await page.addScriptTag({path:file('customer-portal-supabase.js')});
  await page.waitForFunction(()=>document.body.dataset.portalView==='login');
  await page.waitForFunction(()=>typeof window.__customerAuthCallback==='function');

  assert.equal(await page.locator('#portal-login').isVisible(),true,'Signed-out customer login must be visible.');
  assert.equal(await page.locator('#portalAccountActions').isVisible(),false,'Customer account controls must be hidden before authentication.');
  assert.equal(await page.getByText('First time here?').count(),1,'Customer activation guidance must be visible.');
  assert.equal(await page.getByText(/Open H38 Office/).count(),1,'Office users must have a clear route away from customer login.');

  await page.evaluate(()=>{
    window.__customerAuthCallback('SIGNED_IN',{access_token:'customer-test-token',user:{id:'customer-user-1',email:'customer@example.test'}});
  });
  await page.waitForFunction(()=>document.body.dataset.portalView==='app');
  assert.equal(await page.locator('#portalAccountActions').isVisible(),true,'Authenticated customer controls must become visible.');
  assert.equal(await page.locator('#portal-app').isVisible(),true,'Mapped active customer account must open the portal.');

  await page.evaluate(()=>window.__customerAuthCallback('SIGNED_OUT',null));
  await page.waitForFunction(()=>document.body.dataset.portalView==='login');
  assert.equal(await page.locator('#portalAccountActions').isVisible(),false,'Customer controls must hide immediately after sign-out.');
  assert.equal(errors.length,0,'Customer access browser error(s): '+errors.join(' | '));
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const officeContext=await browser.newContext({viewport:{width:1366,height:900}});
    await verifyOffice(await officeContext.newPage());
    await officeContext.close();
    const customerContext=await browser.newContext({viewport:{width:390,height:844}});
    await verifyCustomer(await customerContext.newPage());
    await customerContext.close();
    console.log(JSON.stringify({
      status:'PASS',
      acceptance:'H38_OFFICE_ACCESS_BROWSER',
      officeDesktop:true,
      officePhone:true,
      roleChoiceDoesNotAuthorize:true,
      invitationBoundActivation:true,
      customerSignedOutControlsHidden:true,
      customerActiveAccountControlsVisible:true
    },null,2));
  }finally{
    await browser.close();
  }
})().catch(error=>{
  console.error(error.stack||error);
  process.exit(1);
});
