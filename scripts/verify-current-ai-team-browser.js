const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');

const ROOT=path.resolve(__dirname,'..');
const teamPath=path.join(ROOT,'commercial-app','ai-team-orchestrator.js');
const ownerPath=path.join(ROOT,'commercial-app','ai-owner-command-authority.js');
const platformPath=path.join(ROOT,'commercial-app','platform-next.js');
const polishPath=path.join(ROOT,'commercial-app','ai-team-owner-polish.js');

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1180,height:800}});
    await page.setContent(`<!doctype html><html><head></head><body><main id="mainContent"><header class="page-head"><h1>My H38 Assistant</h1></header><section class="pa-shell"><form id="paCommandForm"><textarea name="command"></textarea><button>Run</button></form><div id="paChat"></div></section></main></body></html>`);
    await page.evaluate(()=>{
      const now=new Date();
      const past=new Date(now.getTime()-10*86400000).toISOString().slice(0,10);
      const old=new Date(now.getTime()-9*86400000).toISOString();
      const due=new Date(now.getTime()-86400000).toISOString();
      const serviceDue=new Date(now.getTime()+86400000).toISOString();
      const startA=new Date(now);startA.setHours(9,0,0,0);
      const endA=new Date(startA.getTime()+2*3600000);
      const startB=new Date(startA.getTime()+3600000);
      const endB=new Date(startB.getTime()+2*3600000);
      window.state={page:'assistant',businessId:'BUSINESS-TEST',snapshot:{
        business:{businessId:'BUSINESS-TEST',businessName:'Test Business'},
        user:{owner:true,roleName:'Owner'},
        invoices:[{'Invoice ID':'INV-OVERDUE','Status':'Open','Total':500,'Paid':100,'Due Date':past}],
        payments:[{'Payment ID':'PAY-1','Amount':100}],
        expenses:[{'Expense ID':'EXP-1','Amount':100}],
        quotes:[{'Quote ID':'Q-DRAFT','Status':'Draft','Project Title':'Garage Test','Total':0,lines:[]}],
        customers:[{'Customer ID':'C1','Customer Name':'Missing Contact'}],
        jobs:[{'Job ID':'J1','Status':'Active','Project Title':'Garage Workflow','Updated Time':old,'Blockers':'Waiting on material'}],
        users:[{'User ID':'U1','Display Name':'Josh','Role ID':'field'},{'User ID':'U2','Display Name':'Rick','Role ID':'owner'}],
        assets:[{'Asset ID':'A1','Asset Name':'Skid Steer','Availability':'Available','Capabilities':'Snow, loading'}],
        resourceProfiles:[],
        scheduleEvents:[
          {'Schedule Event ID':'S1','Title':'Plow Route A','Assigned User ID':'U1','Assigned Asset IDs':['A1'],'Start Time':startA.toISOString(),'End Time':endA.toISOString(),'Status':'Scheduled'},
          {'Schedule Event ID':'S2','Title':'Plow Route B','Assigned User ID':'U1','Assigned Asset IDs':['A1'],'Start Time':startB.toISOString(),'End Time':endB.toISOString(),'Status':'Scheduled'}
        ],
        recurringPlans:[{'Recurring Plan ID':'R1','Status':'Active','Next Service Date':serviceDue}],
        tasks:[{'Task ID':'T1','Status':'Open','Due Time':due}]
      }};
      window.toast=()=>{};
      window.can=()=>true;
      window.__idCounter=0;
      window.newId=prefix=>`${prefix}-TEST-${++window.__idCounter}`;
      window.openPage=pageKey=>{window.__openedPage=pageKey;window.state.page=pageKey;};
      window.__ownerPending=null;
      window.__ownerExecutions=0;
      window.__baseCommands=[];
      window.__queuedOperations=[];
      window.__offlineOperations=[{operationId:'OP-1',status:'PENDING'}];
      window.H38DB={all:async store=>store==='operations'?window.__offlineOperations:[]};
      window.queueOperation=async(...args)=>{window.__queuedOperations.push(args);return{operationId:`TEST-${window.__queuedOperations.length}`,status:'PENDING'};};
      window.sync=async()=>({synced:true});
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
    await page.addScriptTag({path:platformPath});
    await page.addScriptTag({path:polishPath});
    await page.waitForSelector('[data-h38-ai-team]');
    await page.waitForFunction(()=>!!window.H38_AI_OWNER_COMMAND_AUTHORITY?.enabled&&!!window.H38_PLATFORM_NEXT?.build);
    await page.waitForSelector('[data-h38-ai-owner-authority-note]');
    assert.equal(await page.locator('.h38-ai-agent').count(),8,'all eight current AI Team roles should render');
    const panel=await page.locator('[data-h38-ai-team]').innerText();
    assert.match(panel,/Overdue invoice/);
    assert.match(panel,/Quote still needs pricing/);
    assert.match(panel,/Standard requests preview first/);
    assert.match(panel,/Owner command executes supported Office changes/);
    assert.doesNotMatch(panel,/advisory until an existing Office action is approved/i);
    assert.match(await page.locator('[data-h38-ai-owner-authority-note]').innerText(),/Owner commands can act/i);
    assert.match(await page.locator('[data-h38-ai-owner-authority-note]').innerText(),/Payments, sends, purchases, deletions, access\/security, publishing, deployment, and engine changes keep their dedicated controls/i);
    assert.equal((await page.locator('[data-ai-team-scan]').innerText()).trim(),'Scan now');
    assert.equal((await page.locator('[data-ai-team-deep]').innerText()).trim(),'Owner brief');
    assert.equal((await page.locator('[data-ai-team-page]').first().innerText()).trim(),'Open');
    assert.equal(await page.locator('[data-h38-ai-owner-mode]').count(),1,'owner action mode badge should render only for owner');
    const result=await page.evaluate(()=>window.H38_ASSISTANT_COMMAND_BUS.handle('AI team status'));
    assert.match(result,/AI Team found/);
    assert.match(result,/Overdue invoice/);
    assert.match(result,/Nothing has been changed/);

    const platformBrief=await page.evaluate(()=>window.H38_ASSISTANT_COMMAND_BUS.handle('owner dashboard'));
    assert.match(platformBrief,/Owner intelligence/);
    assert.match(platformBrief,/Cash due:/);
    assert.match(platformBrief,/Active jobs: 1; slipping: 1/);
    assert.match(platformBrief,/dispatch conflicts: 2/);
    assert.match(platformBrief,/QuickBooks bridge: not connected/);
    assert.match(platformBrief,/Nothing has been sent, purchased, paid, deployed, or changed by this brief/);

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
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('h38:office-page-rendered')));
    await page.waitForTimeout(80);
    assert.equal(await page.locator('[data-h38-ai-owner-mode]').count(),0,'non-owner should not see owner action mode badge');
    assert.match(await page.locator('[data-h38-ai-owner-authority-note]').innerText(),/owner-command execution is limited to the signed-in owner/i);
    await page.evaluate(()=>{window.state.snapshot.user={owner:true,roleName:'Owner'};window.dispatchEvent(new CustomEvent('h38:office-page-rendered'));});
    await page.waitForTimeout(80);
    assert.equal(await page.locator('[data-h38-ai-owner-mode]').count(),1,'owner action mode badge should restore for owner');

    await page.evaluate(()=>{window.state.page='today';document.querySelector('#mainContent').innerHTML='<div class="grid"></div>';window.dispatchEvent(new CustomEvent('h38:office-page-rendered'));});
    await page.waitForSelector('#h38OwnerCommandCenter');
    await page.waitForSelector('#h38OfflineFieldStatus');
    const ownerCenter=await page.locator('#h38OwnerCommandCenter').innerText();
    assert.match(ownerCenter,/What needs attention now/);
    assert.match(ownerCenter,/Cash due/);
    assert.match(ownerCenter,/Crew utilization today/);
    assert.match(ownerCenter,/Resolve 2 dispatch conflicts/);
    assert.match(await page.locator('#h38OfflineFieldStatus').innerText(),/Queued changes\s+1/i);

    await page.evaluate(()=>{window.state.page='schedule';document.querySelector('#mainContent').innerHTML='<div class="grid"></div>';window.dispatchEvent(new CustomEvent('h38:office-page-rendered'));});
    await page.waitForSelector('#h38SeriousDispatch');
    const dispatch=await page.locator('#h38SeriousDispatch').innerText();
    assert.match(dispatch,/Dispatch & resource board/);
    assert.match(dispatch,/Josh/);
    assert.match(dispatch,/Skid Steer/);
    assert.match(dispatch,/2 conflicts/);
    await page.locator('#h38ResourceForm select[name="resource"]').selectOption('person:U1');
    await page.locator('#h38ResourceForm input[name="skills"]').fill('Snow, skid steer');
    await page.locator('#h38ResourceForm input[name="location"]').fill('Grand Rapids base');
    await page.locator('#h38ResourceForm button').click();
    await page.waitForFunction(()=>window.__queuedOperations.some(op=>op[1]==='Resource Profile'));

    await page.evaluate(()=>{window.state.page='accounting';document.querySelector('#mainContent').innerHTML='<div class="grid"></div>';window.dispatchEvent(new CustomEvent('h38:office-page-rendered'));});
    await page.waitForSelector('#h38QuickBooksBridge');
    const accounting=await page.locator('#h38QuickBooksBridge').innerText();
    assert.match(accounting,/QuickBooks Online/);
    assert.match(accounting,/OAuth credentials\/tokens are server-side only/);
    assert.match(accounting,/External QuickBooks writes are OFF/);
    await page.locator('[data-qbo-preview]').click();
    await page.waitForFunction(()=>window.__queuedOperations.some(op=>op[1]==='Accounting Sync Preview'));

    const flags=await page.evaluate(()=>({
      team:window.H38_AI_TEAM,
      bus:window.H38_ASSISTANT_COMMAND_BUS,
      polish:window.H38_AI_TEAM_OWNER_POLISH,
      platform:window.H38_PLATFORM_NEXT,
      owner:{
        authorized:window.H38_AI_OWNER_COMMAND_AUTHORITY.ownerAuthorized(),
        usesExistingTenantActions:window.H38_AI_OWNER_COMMAND_AUTHORITY.usesExistingTenantActions,
        usesExistingPermissionChecks:window.H38_AI_OWNER_COMMAND_AUTHORITY.usesExistingPermissionChecks,
        usesExistingVerifyProof:window.H38_AI_OWNER_COMMAND_AUTHORITY.usesExistingVerifyProof,
        externalCommitmentsAutoExecute:window.H38_AI_OWNER_COMMAND_AUTHORITY.externalCommitmentsAutoExecute
      }
    }));
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
    assert.equal(flags.polish.ownerCommandPresentationOnly,true);
    assert.equal(flags.polish.noWritePath,true);
    assert.equal(flags.polish.noPermissionChanges,true);
    assert.equal(flags.polish.noEngineChanges,true);
    assert.equal(flags.platform.safeguards.taskManagerAuthority,true);
    assert.equal(flags.platform.safeguards.userScopedOfflineQueue,true);
    assert.equal(flags.platform.safeguards.tenantIsolation,true);
    assert.equal(flags.platform.safeguards.quickBooksSecretsInBrowser,false);
    assert.equal(flags.platform.safeguards.quickBooksExternalWrites,false);
    assert.equal(flags.platform.safeguards.aiSecondWritePath,false);
    assert.equal(flags.platform.safeguards.automaticApproval,false);
    assert.equal(flags.platform.safeguards.automaticPayment,false);
    assert.equal(flags.platform.safeguards.automaticScheduling,false);
    assert.equal(flags.owner.authorized,true);
    assert.equal(flags.owner.usesExistingTenantActions,true);
    assert.equal(flags.owner.usesExistingPermissionChecks,true);
    assert.equal(flags.owner.usesExistingVerifyProof,true);
    assert.equal(flags.owner.externalCommitmentsAutoExecute,false);

    await page.evaluate(()=>{window.state.page='assistant';document.querySelector('#mainContent').innerHTML='<header class="page-head"><h1>My H38 Assistant</h1></header><section class="pa-shell"><form id="paCommandForm"><textarea name="command"></textarea><button>Run</button></form><div id="paChat"></div></section>';window.dispatchEvent(new CustomEvent('h38:office-page-rendered'));});
    await page.waitForSelector('[data-h38-ai-team]');
    const before=await page.locator('[data-h38-ai-team]').count();
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('h38:office-page-rendered')));
    await page.waitForTimeout(100);
    const after=await page.locator('[data-h38-ai-team]').count();
    assert.equal(before,1);
    assert.equal(after,1,'AI Team lifecycle refresh must not duplicate its panel');
    console.log('PASS — current Supabase AI Team plus unified owner intelligence, dispatch/resource, offline field and QuickBooks-preview platform runtime operate in-browser while preserving owner-command and external commitment boundaries.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
