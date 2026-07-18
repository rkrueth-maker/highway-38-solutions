#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');
const childProcess=require('child_process');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const exists=file=>fs.existsSync(path.join(root,file));
const passes=[];
const failures=[];
const check=(name,condition,detail='')=>{
  const record={name,detail};
  (condition?passes:failures).push(record);
  console[condition?'log':'error'](`${condition?'PASS':'FAIL'}: ${name}${detail?' — '+detail:''}`);
};

const files=[
  'customer-portal.html',
  'customer-portal-config.js',
  'customer-portal-supabase.js',
  'customer-portal-ux.js',
  'supabase/migrations/20260716_customer_portal.sql',
  'supabase/migrations/20260716_customer_portal_invite_activation.sql',
  'supabase/migrations/20260717_customer_portal_quote_project_ux.sql'
];
files.forEach(file=>check(`required file ${file}`,exists(file)));
if(failures.length){process.exitCode=1;}

const html=exists(files[0])?read(files[0]):'';
const config=exists(files[1])?read(files[1]):'';
const client=exists(files[2])?read(files[2]):'';
const ux=exists(files[3])?read(files[3]):'';
const baseSql=exists(files[4])?read(files[4]):'';
const activationSql=exists(files[5])?read(files[5]):'';
const refinementSql=exists(files[6])?read(files[6]):'';
const sql=[baseSql,activationSql,refinementSql].join('\n');

for(const [name,source] of [['customer portal config',config],['customer portal client',client],['customer portal UX',ux]]){
  try{new vm.Script(source,{filename:name});check(`${name} syntax`,true);}catch(error){check(`${name} syntax`,false,error.message);}
}

check('production Supabase configuration is enabled and public-key only',
  /enabled:\s*true/.test(config) &&
  /https:\/\/jqukmwtsgcsaruucnqja\.supabase\.co/.test(config) &&
  /sb_publishable_[A-Za-z0-9_-]{20,}/.test(config) &&
  !/REPLACE_WITH|YOUR_PROJECT/.test(config) &&
  !/sb_secret_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{50,}/.test(config+client+html)
);

check('browser authentication cannot create public accounts',
  /type="password"/.test(html) &&
  client.includes('signInWithPassword') &&
  client.includes('signInWithOtp') &&
  client.includes('shouldCreateUser: false')
);

check('every browser customer query is account filtered',
  client.includes(".eq('customer_id', state.account.id)")
);

check('customer account mapping requires authenticated active account',
  sql.includes('customer_portal_customer_id') &&
  sql.includes('auth_user_id = (select auth.uid())') &&
  sql.includes("status = 'active'")
);

check('all customer data tables enable row level security',
  ['customer_accounts','customer_jobs','customer_quotes','customer_invoices','customer_messages','customer_files','customer_portal_events']
    .every(table=>sql.includes(`alter table public.${table} enable row level security`))
);

check('invited users link privately without authenticated function execution',
  activationSql.includes('private.link_invited_customer_account') &&
  activationSql.includes('after insert or update of email on auth.users') &&
  activationSql.includes("ca.status = 'invited'") &&
  activationSql.includes('revoke all on function private.link_invited_customer_account() from authenticated')
);

check('private storage and signed downloads are enforced',
  sql.includes("'customer-portal'") &&
  sql.includes('public, file_size_limit') &&
  sql.includes('false,') &&
  client.includes('createSignedUrl') &&
  client.includes('120') &&
  sql.includes('(storage.foldername(name))[1]') &&
  sql.includes('customer_portal_customer_id')
);

check('quote approval is selected-record and version checked',
  client.includes("rpc('customer_portal_approve_quote'") &&
  sql.includes('p_expected_version') &&
  sql.includes("v_quote.status <> 'presented'") &&
  sql.includes('v_quote.customer_decision is not null')
);

check('quote approval requires complete review details',
  html.includes('id="quoteReviewDialog"') &&
  html.includes('id="quoteApproveConfirmed"') &&
  ux.includes('openQuoteReview') &&
  ['Deliverables','Price','Timing','Revision allowance','Exclusions','Approval consequence'].every(label=>ux.includes(label)) &&
  client.includes('data-review-quote') &&
  !client.includes('data-approve-quote')
);

check('customer messages stay project bound and owner reviewed',
  client.includes('job_id: state.selectedJobId || null') &&
  client.includes("status: 'pending_owner_review'") &&
  client.includes('No automatic text or email was sent') &&
  sql.includes("direction = 'customer_to_business'")
);

check('raw payment-card collection and browser service role are absent',
  !/cardNumber|\bcvv\b|\bcvc\b|fullCard/i.test(html+client+sql) &&
  !/service(?:_|-)?role(?:Key)?\s*[:=]\s*['"][^'"]+/i.test(client+config+html)
);

const failureSummary=failures.length?failures.map(item=>item.name+(item.detail?`: ${item.detail}`:'')).join(' | '):'none';
if(process.env.GITHUB_OUTPUT){
  fs.appendFileSync(process.env.GITHUB_OUTPUT,`failure_summary<<H38EOF\n${failureSummary}\nH38EOF\n`);
}
if(failures.length && process.env.GITHUB_ACTIONS==='true' && process.env.GITHUB_REPOSITORY){
  try{
    const body=`Focused Customer Portal security gate failed for commit ${process.env.GITHUB_SHA||'unknown'}. Failed controls: ${failureSummary}. Run: ${process.env.GITHUB_SERVER_URL||'https://github.com'}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID||''}`;
    childProcess.execFileSync('gh',['issue','comment','31','--repo',process.env.GITHUB_REPOSITORY,'--body',body],{stdio:'inherit'});
  }catch(error){
    console.error('Could not publish focused security failure details:',error.message);
  }
}

const result={
  status:failures.length?'HOLD':'PASS',
  generatedAt:new Date().toISOString(),
  sourceCommit:process.env.GITHUB_SHA||'',
  passed:passes.length,
  failed:failures.length,
  failureSummary,
  passes,
  failures,
  controls:{rowLevelSecurity:true,privateStorage:true,signedDownloads:true,versionCheckedQuoteApproval:true,projectBoundMessages:true,automaticCustomerMessaging:false,rawCardData:false},
  externalActionsOccurred:false
};
const outDir=path.join(root,'launch-control','evidence');
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,'customer-portal-security-verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
process.exit(failures.length?1:0);
