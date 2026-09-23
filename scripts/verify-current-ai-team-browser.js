const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');

const ROOT=path.resolve(__dirname,'..');
const teamPath=path.join(ROOT,'commercial-app','ai-team-orchestrator.js');

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
      window.H38_ASSISTANT_COMMAND_BUS={enabled:true,canHandle:()=>false,handle:async()=>'',agentStatus:()=>({agents:[['Command Bus',true]],ready:1,total:1,summary:'✓ Command Bus'}),externalActionsEnabled:false,automaticApproval:false,automaticCustomerSending:false,automaticPurchasing:false,automaticPayment:false,automaticScheduling:false};
    });
    await page.addScriptTag({path:teamPath});
    await page.waitForSelector('[data-h38-ai-team]');
    assert.equal(await page.locator('.h38-ai-agent').count(),8,'all eight current AI Team roles should render');
    const panel=await page.locator('[data-h38-ai-team]').innerText();
    assert.match(panel,/Overdue invoice/);
    assert.match(panel,/Quote still needs pricing/);
    const result=await page.evaluate(()=>window.H38_ASSISTANT_COMMAND_BUS.handle('AI team status'));
    assert.match(result,/AI Team found/);
    assert.match(result,/Overdue invoice/);
    assert.match(result,/Nothing has been changed/);
    const flags=await page.evaluate(()=>({team:window.H38_AI_TEAM,bus:window.H38_ASSISTANT_COMMAND_BUS}));
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
    const before=await page.locator('[data-h38-ai-team]').count();
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('h38:office-page-rendered')));
    await page.waitForTimeout(100);
    const after=await page.locator('[data-h38-ai-team]').count();
    assert.equal(before,1);
    assert.equal(after,1,'AI Team lifecycle refresh must not duplicate its panel');
    console.log('PASS — current Supabase AI Team renders, scans active-tenant data, routes team commands, and preserves no-auto-action boundaries.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});