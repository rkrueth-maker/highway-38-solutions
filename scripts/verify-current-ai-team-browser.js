const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');

const ROOT=path.resolve(__dirname,'..');
const teamPath=path.join(ROOT,'commercial-app','ai-team-orchestrator.js');
const ownerPath=path.join(ROOT,'commercial-app','ai-owner-command-authority.js');

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1180,height:800}});
    await page.setContent(`<!doctype html><html><head></head><body><main id="mainContent"><header class="page-head"><h1>My H38 Assistant</h1></header><section class="pa-shell"><form id="paCommandForm"><textarea name="command"></textarea><button>Run</button></form><div id="paChat"></div></section></main></body></html>`);
    await page.evaluate(()=>{
      const past=new Date(Date.now()-10*86400000).toISOString().slice(0,10);
      window.state={page:'assistant',businessId:'BUSINESS-TEST',snapshot:{business:{businessId:'BUSINESS-TEST',businessName:'Test Business'},user:{owner:true,roleName:'Owner'},invoices:[{'Invoice ID':'INV-OVERDUE','Status':'Open','Total':500,'Paid':100,'Due Date':past}],quotes:[{'Quote ID':'Q-DRAFT','Status':'Draft','Project Title':'Garage Test','Total':0,lines:[]}],customers:[{'Customer ID':'C1','Customer Name':'Missing Contact'}],jobs:[]}};
      window.toast=()=>{};
      window.openPage=pageKey=>{window.__openedPage=pageKey;window.state.page=pageKey;};
      window.__ownerPending=null;
      window.__ownerExecutions=0;
      window.__baseCommands=[];
      window.H38_ASSISTANT_TENANT_ACTIONS={
        enabled:true,
        pending:()=>window.__ownerPending?JSON.parse(JSON.stringify(window.__ownerPending)):null,
        executePending:async()=>{if(!window.__ownerPending)throw Error('No pending action');window.__ownerExecutions+=1;window.__ownerPending=null;return'✓ Saved and verified mock tenant change.';},
        cancelPending:()=>{window.__ownerPending=null;return'Cancelled. Nothing was written.';}
      };
      window.H38_ASSISTANT_COMMAND_BUS={
        enabled:true,
        canHandle:command=>/raise their plowing rate|pay invoice/i.test(String(command||'')),
        handle:async command=>{
          const q=String(command||'');window.__baseCommands.push(q);
          if(/raise their plowing rate to \$175/i.test(q)){window.__ownerPending={type:'rate-change',canExecute:true,businessId:'BUSINESS-TEST',after:175};return'Proposed mock rate change.';}
          if(/pay invoice/i.test(q))return'Opened Money. Payment not executed.';
          return'';
        },
        agentStatus:()=>({agents:[['Command Bus',true]],ready:1,total:1,summary:'✓ Command Bus'}),
        externalActionsEnabled:false,automaticApproval:false,automaticCustomerSending:false,automaticPurchasing:false,automaticPayment:false,automaticScheduling:false
      };
    });
    await page.addScriptTag({path:teamPath});
    await page.addScriptTag({path:ownerPath});
    await page.waitForSelector('[data-h38-ai-team]');
    await page.waitForFunction(()=>!!window.H38_AI_OWNER_COMMAND_AUTHORITY?.enabled);
    assert.equal(await page.locator('.h38-ai-agent').count(),8,'all eight current AI Team roles should render');
    const panel=await page.locator('[data-h38-ai-team]').innerText();
    assert.match(panel,/Overdue invoice/);
    assert.match(panel,/Quote still needs pricing/);
    const result=await page.evaluate(()=>window.H38_ASSISTANT_COMMAND_BUS.handle('AI team status'));
    assert.match(result,/AI Team found/);
    assert.match(result,/Overdue invoice/);
    assert.match(result,/Nothing has been changed/);

    const ownerResult=await page.evaluate(()=>window.H38_ASSISTANT_COMMAND_BUS.handle('Owner command: raise their plowing rate to $175'));
    assert.match(ownerResult,/Owner command executed/);
    const ownerExecution=await page.evaluate(()=>({count:window.__ownerExecutions,pending:window.__ownerPending,last:window.__baseCommands.at(-1)}));
    assert.equal(ownerExecution.count,1,'explicit owner command should execute the resolved existing tenant action');
    assert.equal(ownerExecution.pending,null);
    assert.equal(ownerExecution.last,'raise their plowing rate to $175','owner prefix must be removed before existing resolver sees the command');

    const ordinary=await page.evaluate(()=>window.H38_ASSISTANT_COMMAND_BUS.handle('Raise their plowing rate to $175'));
    assert.match(ordinary,/Proposed/);
    const ordinaryState=await page.evaluate(()=>({count:window.__ownerExecutions,pending:window.__ownerPending}));
    assert.equal(ordinaryState.count,1,'ordinary wording must not auto-approve');
    assert.equal(ordinaryState.pending?.type,'rate-change','ordinary wording should leave the existing preview pending');
    await page.evaluate(()=>window.H38_ASSISTANT_TENANT_ACTIONS.cancelPending());

    const external=await page.evaluate(()=>window.H38_ASSISTANT_COMMAND_BUS.handle('Owner command: pay invoice INV-OVERDUE'));
    assert.match(external,/external or security-sensitive commitment/i);
    assert.match(external,/Payment not executed/i);
    assert.equal(await page.evaluate(()=>window.__ownerExecutions),1,'payment-style owner command must not use tenant auto-execution');

    const denied=await page.evaluate(async()=>{window.state.snapshot.user={owner:false,roleName:'Employee'};return window.H38_ASSISTANT_COMMAND_BUS.handle('Owner command: raise their plowing rate to $175');});
    assert.match(denied,/limited to the signed-in owner/i);
    assert.equal(await page.evaluate(()=>window.__ownerExecutions),1,'non-owner must not execute owner command authority');
    await page.evaluate(()=>{window.state.snapshot.user={owner:true,roleName:'Owner'};});

    const flags=await page.evaluate(()=>({team:window.H38_AI_TEAM,bus:window.H38_ASSISTANT_COMMAND_BUS,owner:window.H38_AI_OWNER_COMMAND_AUTHORITY}));
    assert.equal(flags.team.activeTenantOnly,true);
    assert.equal(flags.team.usesExistingApprovalProof,true);
    assert.equal(flags.team.engineChangesAllowed,false);
    assert.equal(flags.team.externalActionsEnabled,false);
    assert.equal(flags.team.automaticApproval,false);
    assert.equal(flags.team.automaticCustomerSending,false);
    assert.equal(flags.team.automaticPurchasing,false);
    assert.equal(flags.team.automaticPayment,false);
    assert.equal(flags.team.automaticScheduling,false);
    assert.equal(flags.team.automaticDeployment,false);
    assert.equal(flags.bus.aiTeamOrchestration,true);
    assert.equal(flags.bus.aiOwnerCommandAuthority,true);
    assert.equal(flags.bus.ownerCommandActionsEnabled,true);
    assert.equal(flags.bus.explicitOwnerCommandApproval,true);
    assert.equal(flags.bus.externalActionsEnabled,false);
    assert.equal(flags.owner.ownerAuthorized,true);
    assert.equal(flags.owner.usesExistingTenantActions,true);
    assert.equal(flags.owner.usesExistingPermissionChecks,true);
    assert.equal(flags.owner.usesExistingVerifyProof,true);
    assert.equal(flags.owner.externalCommitmentsAutoExecute,false);
    const before=await page.locator('[data-h38-ai-team]').count();
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('h38:office-page-rendered')));
    await page.waitForTimeout(100);
    const after=await page.locator('[data-h38-ai-team]').count();
    assert.equal(before,1);
    assert.equal(after,1,'AI Team lifecycle refresh must not duplicate its panel');
    console.log('PASS — current Supabase AI Team renders, scans active-tenant data, supports explicit owner-commanded tenant actions through existing controls, and preserves external commitment boundaries.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});