#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const cp=require('child_process');
const root=path.resolve(__dirname,'..');
const chunkDir=path.join(root,'scripts/.quote-commercial-package');
const expected='26e675cd56e2c46767c4d894f8da8c7ef6e1ec21333262b4bab074575b211d86';
const names=fs.readdirSync(chunkDir).filter(name=>name.endsWith('.part')).sort();
if(names.length!==10)throw new Error(`Expected 10 package chunks, found ${names.length}.`);
const b64=names.map(name=>fs.readFileSync(path.join(chunkDir,name),'utf8').trim()).join('');
const archive=Buffer.from(b64,'base64');
const hash=crypto.createHash('sha256').update(archive).digest('hex');
if(hash!==expected)throw new Error(`Commercial package checksum mismatch: ${hash}`);
const archivePath=path.join(root,'.quote-commercial-package.tar.gz');
fs.writeFileSync(archivePath,archive);
cp.execFileSync('tar',['-xzf',archivePath,'-C',root],{stdio:'inherit'});
fs.rmSync(archivePath);
function patch(rel,find,replacement){
  const target=path.join(root,rel);
  const text=fs.readFileSync(target,'utf8');
  if(!text.includes(find))throw new Error(`Patch marker missing in ${rel}: ${find}`);
  fs.writeFileSync(target,text.replace(find,replacement));
}
const patches=[
  ['apps-script/business-office/BusinessOffice_QuoteBuilder_Index.html',"<?!= boInclude_('BusinessOffice_QuoteBuilder_Voice_Photo_Quick') ?>","<?!= boInclude_('BusinessOffice_QuoteBuilder_Voice_Photo_Quick') ?>\n<?!= boInclude_('BusinessOffice_QuoteBuilder_Commercial_Client') ?>"],
  ['apps-script/unified-shell/Unified_AppShell.gs',"VERSION:'3.0.0',","VERSION:'3.1.0',"],
  ['apps-script/unified-shell/Unified_AppShell.gs',"  QUOTE_BUILDER:'quote-builder',","  QUOTE_BUILDER:'quote-builder',\n  PROPOSAL:'proposal',"],
  ['apps-script/unified-shell/Unified_AppShell.gs',"routes:{ownerPortal:'',businessOffice:'?app=business-office',quoteBuilder:'?app=business-office&quoteBuilder=1'},","routes:{ownerPortal:'',businessOffice:'?app=business-office',quoteBuilder:'?app=business-office&quoteBuilder=1',customerProposal:'?proposal={token}'} ,".replace('} ,','},')],
  ['apps-script/unified-shell/Unified_AppShell.gs',"function doGet(event){\n  H38_PORTAL_AUTH_BRIDGE.getCurrentUser();","function h38UnifiedShellRenderProposal_(token){\n  if(typeof boRenderPublicProposal_!=='function')throw new Error('Customer proposal renderer is unavailable.');\n  return boRenderPublicProposal_(token);\n}\n\nfunction doGet(event){\n  var proposal=h38UnifiedShellParameter_(event,'proposal');\n  if(proposal)return h38UnifiedShellRenderProposal_(proposal);\n  H38_PORTAL_AUTH_BRIDGE.getCurrentUser();"],
  ['scripts/deploy-unified-owner-portal-web.sh',"  BusinessOffice_QuoteBuilder_Direct.gs\n  BusinessOffice_QuoteBuilder_Index.html","  BusinessOffice_QuoteBuilder_Direct.gs\n  BusinessOffice_QuoteBuilder_Commercial.gs\n  BusinessOffice_QuoteBuilder_Index.html\n  BusinessOffice_QuoteBuilder_Commercial_Client.html\n  BusinessOffice_QuoteBuilder_Proposal_Public.html"],
  ['scripts/deploy-unified-owner-portal-web.sh','REMOTE_QB_DIRECT="$(find_remote_source BusinessOffice_QuoteBuilder_Direct)"','REMOTE_QB_DIRECT="$(find_remote_source BusinessOffice_QuoteBuilder_Direct)"\nREMOTE_QB_COMMERCIAL="$(find_remote_source BusinessOffice_QuoteBuilder_Commercial)"'],
  ['scripts/deploy-unified-owner-portal-web.sh','"$REMOTE_GATE" "$REMOTE_QB_DIRECT" "$REMOTE_UX"','"$REMOTE_GATE" "$REMOTE_QB_DIRECT" "$REMOTE_QB_COMMERCIAL" "$REMOTE_UX"'],
  ['scripts/deploy-unified-owner-portal-web.sh','grep -F "function boRenderQuoteBuilderApp_()" "$REMOTE_QB_DIRECT" >/dev/null','grep -F "function boRenderQuoteBuilderApp_()" "$REMOTE_QB_DIRECT" >/dev/null\ngrep -F "function boRenderPublicProposal_" "$REMOTE_QB_COMMERCIAL" >/dev/null\ngrep -F "function h38PublicProposalApi" "$REMOTE_QB_COMMERCIAL" >/dev/null\ntest -f "$REMOTE_VERIFY/BusinessOffice_QuoteBuilder_Commercial_Client.html"\ntest -f "$REMOTE_VERIFY/BusinessOffice_QuoteBuilder_Proposal_Public.html"']
];
patches.forEach(args=>patch(...args));
const pkgPath=path.join(root,'package.json');
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
const command='node scripts/verify-quote-builder-commercial-complete.js';
for(const key of ['test:commercial','test:business-office']){
  if(!pkg.scripts[key].includes(command))pkg.scripts[key]+=' && '+command;
}
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
const remove=[
  'scripts/apply-quote-commercial-chunked.js',
  'scripts/apply-quote-commercial-one-shot.js',
  'scripts/.quote-commercial-package',
  '.github/workflows/apply-quote-commercial-one-shot.yml',
  '.github/workflows/apply-quote-commercial-pr.yml',
  '.github/workflows/diagnose-quote-commercial-pr.yml',
  '.github/workflows/apply-quote-commercial-chunked-pr.yml',
  '.quote-commercial-one-shot-trigger',
  'docs/handoffs/QUOTE_BUILDER_COMMERCIAL_BUILD_IN_PROGRESS.md',
  'docs/handoffs/QUOTE_BUILDER_COMMERCIAL_BUILD_SCOPE.md',
  'docs/handoffs/QUOTE_BUILDER_COMMERCIAL_ACCEPTANCE.md',
  'docs/handoffs/QUOTE_BUILDER_COMMERCIAL_PRODUCTS.md',
  'docs/handoffs/QUOTE_BUILDER_COMMERCIAL_CONTROLS.md',
  'docs/handoffs/QUOTE_BUILDER_COMMERCIAL_DATA.md',
  'docs/handoffs/QUOTE_BUILDER_COMMERCIAL_UX.md',
  'docs/handoffs/QUOTE_BUILDER_COMMERCIAL_LIFECYCLE.md',
  'docs/handoffs/QUOTE_BUILDER_COMMERCIAL_SIGNOFF.md',
  'docs/handoffs/QUOTE_BUILDER_COMMERCIAL_FINAL_SCOPE.md',
  'docs/handoffs/QUOTE_BUILDER_COMMERCIAL_MERGE_GATE.md'
];
for(const rel of remove){const target=path.join(root,rel);if(fs.existsSync(target))fs.rmSync(target,{recursive:true,force:true});}
console.log('Applied and cleaned complete commercial Quote Builder package.');
