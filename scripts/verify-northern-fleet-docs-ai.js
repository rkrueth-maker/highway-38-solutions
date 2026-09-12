const fs=require('fs'),path=require('path'),cp=require('child_process');
const root=path.resolve(__dirname,'..');
let checks=0;
function text(p){return fs.readFileSync(path.join(root,p),'utf8');}
function must(ok,msg){checks++;if(!ok)throw new Error(`FAIL: ${msg}`);}
function has(src,...tokens){for(const t of tokens)must(src.includes(t),`missing ${t}`);}
for(const file of ['commercial-app/northern-document-polish.js','commercial-app/ai-document-factory.js','commercial-app/northern-bouncie-fleet.js','commercial-app/live-customer-navigation-guard-20260910.js']){
  cp.execFileSync(process.execPath,['--check',path.join(root,file)],{stdio:'pipe'});
  checks++;
}
const loader=text('commercial-app/live-customer-navigation-guard-20260910.js');
has(loader,'northern-document-polish.js','ai-document-factory.js','northern-bouncie-fleet.js','northern-bouncie-fleet-2');
const docs=text('commercial-app/northern-document-polish.js');
has(docs,'Northern Lakes Property Maintenance LLC','northernlakesproperty@gmail.com','218-326-2506','3131 Horseshoe Lake Rd','Business systems powered by Highway 38 Solutions','approvedLogoOnly:true','automaticSending:false','drive.google.com/file/d/10saUTGrAj8wu6NFazQPhM2aR1eoerqN6');
must(!docs.includes('assets/highway38-logo'),'Northern document polish must not add H38 logo');
const factory=text('commercial-app/ai-document-factory.js');
has(factory,"['owner','administrator']",'SAVE_ATTACHMENT','SAVE_EMAIL_DRAFT',"formats:Object.freeze(['pdf','docx','xlsx','csv','txt','eml'])",'automaticSending:false','automaticPayment:false','automaticPublishing:false','window.addEventListener(\'submit\'');
const edge=text('supabase/functions/h38-document-factory/index.ts');
has(edge,'Only an Owner or Administrator','Never invent customers','pdf-lib@1.17.1','jszip@3.10.1','Business systems powered by Highway 38 Solutions','externalActionOccurred:false','automaticSending:false');
must(!edge.includes('tools:'),'Document factory must not enable model tools');
const migration=text('supabase/migrations/20260912090000_fleet_provider_foundation.sql');
has(migration,'fleet_provider_connections','fleet_provider_secrets','fleet_vehicles','fleet_vehicle_assignments','fleet_trips','fleet_events','fleet_job_zones','fleet_webhook_receipts','enable row level security','private.business_access',"array['owner','administrator']",'auth.uid()','fleet secrets deny authenticated','fleet receipts deny authenticated');
const fleet=text('commercial-app/northern-bouncie-fleet.js');
has(fleet,"key()==='northern-lakes'",'Northern Lakes Fleet Tracking','leaflet@1.9.4','employeeScopedRls:true','oauth-start','Sync now','automaticCustomerSending:false');
const fleetEdge=text('supabase/functions/nl-bouncie-fleet/index.ts');
has(fleetEdge,'https://auth.bouncie.com/dialog/authorize','https://auth.bouncie.com/oauth/token','https://api.bouncie.dev/v1','X-Bouncie-Authorization'.toLowerCase().replace('x-','x-'),'BOUNCIE_TOKEN_ENCRYPTION_KEY','BOUNCIE_STATE_SECRET','BOUNCIE_WEBHOOK_KEY','fleet_webhook_receipts','365*86400000','starts_after','startsAfter','externalActionOccurred:false');
must(fleetEdge.includes('Authorization:access'),'Bouncie REST token must be sent raw without Bearer prefix');
must(!fleetEdge.includes('Authorization:`Bearer ${access}'),'Bouncie REST calls must not add Bearer prefix');
const config=text('supabase/config.toml');
has(config,'[functions.h38-document-factory]','verify_jwt = true','[functions.nl-bouncie-fleet]');
console.log(`Northern Fleet + Documents + AI verifier PASS (${checks} checks)`);
