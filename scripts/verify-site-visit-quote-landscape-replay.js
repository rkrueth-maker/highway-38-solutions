'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const ROOT=path.resolve(__dirname,'..');
const dynamicJs=[
  'commercial-app/site-visit-quote-e2e-core.js',
  'commercial-app/site-visit-quote-final-bootstrap.js',
  'commercial-app/quote-image-orientation-final.js',
  'commercial-app/quote-working-hammer.js',
  'commercial-app/android-walkthrough-photo-recovery.js',
  'commercial-app/quote-runtime-authority.js',
  'commercial-app/site-visit-work-dedupe-final.js',
  'commercial-app/site-visit-identity-write-fence-final.js'
];
for(const relative of dynamicJs){const source=fs.readFileSync(path.join(ROOT,relative),'utf8');try{new vm.Script(source,{filename:relative});}catch(error){throw new Error(`Dynamic production JavaScript failed to parse: ${relative}: ${error.message}`);}}
const core=require(path.join(ROOT,'commercial-app','site-visit-quote-e2e-core.js'));
const fixture=JSON.parse(fs.readFileSync(path.join(ROOT,'tests','fixtures','site_visit_quote_landscape_replay.json'),'utf8'));

assert.strictEqual(core.resolveActionPictureId({quoteId:fixture.quoteId,args:{},quote:fixture.quote,documents:fixture.documents,map:{},visit:null}),fixture.actionPictureId,'closed Site Visit must resolve the saved quote Action Picture');
assert.strictEqual(core.actionPictureRotation({quoteId:fixture.quoteId,sourceId:fixture.actionPictureId,quote:fixture.quote,documents:fixture.documents}),270,'saved Action Picture rotation must survive quote handoff');
assert.match(core.rotationInstruction(270),/counterclockwise/i,'270 degree correction must explicitly mean 90 degrees counterclockwise');
assert.strictEqual(core.scopeRequiresTarget(fixture.project,'insulation'),false,'system policy text must never invent insulation scope');
assert.strictEqual(core.scopeRequiresTarget(fixture.project,'drywall'),false,'system policy text must never invent drywall scope');
assert.deepStrictEqual(core.blockingProblems(fixture.draftLines,fixture.project),[],'manual_required owner-review rates must keep the draft editable');
const verified=fixture.measurements.filter(row=>row.verificationStatus==='FIELD_MEASURED').map(row=>row.value);
const spoken=fixture.measurements.filter(row=>row.verificationStatus==='UNVERIFIED_SPOKEN').map(row=>row.value);
assert.deepStrictEqual(verified,[21,71]);
assert.deepStrictEqual(spoken,[58]);

const runtimeSource=fs.readFileSync(path.join(ROOT,'commercial-app','quote-runtime-authority.js'),'utf8');
function H38Bridge(){}
H38Bridge.prototype.request=async()=>({status:'PASS',legacyFallback:true});
const context={console,H38Bridge,H38_BUSINESS_OFFICE_SUPABASE:{enabled:true},H38_SUPABASE_SHARED_CLIENT:{},supabase:{},state:{businessId:'BUSINESS-REPLAY',quote:{quoteId:fixture.quoteId},snapshot:{quotes:[fixture.quote],documents:fixture.documents,siteMeasurements:[]}},crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000001'},CustomEvent:function(type,options){this.type=type;this.detail=options?.detail;},dispatchEvent:()=>true,setTimeout,clearTimeout,AbortController,fetch:async()=>{throw new Error('network must not be used in replay');}};
context.window=context;
vm.createContext(context);
vm.runInContext(runtimeSource,context,{filename:'quote-runtime-authority.js'});
assert.strictEqual(context.H38_QUOTE_RUNTIME_AUTHORITY.actionPictureId(fixture.quoteId,{}),fixture.actionPictureId,'actual final quote runtime must resolve saved Action Picture after Site Visit closes');
assert.strictEqual(context.H38Bridge.prototype.request.__h38QuoteRuntimeAuthority,true,'final quote runtime must own Bridge quote requests');
assert.match(runtimeSource,/delete prepared\.notes/,'final runtime must strip legacy notes/policy contamination before Quote AI');
assert.match(runtimeSource,/manualRequiredLinesAllowed:true/,'final runtime must allow editable manual-required rates');

const bootstrap=fs.readFileSync(path.join(ROOT,'commercial-app','site-visit-quote-final-bootstrap.js'),'utf8');
const expectedOrder=['site-visit-quote-e2e-core.js','quote-runtime-authority.js','site-visit-work-dedupe-final.js','site-visit-identity-write-fence-final.js','quote-image-orientation-final.js'];
let previous=-1;
for(const file of expectedOrder){const index=bootstrap.indexOf(file);assert(index>previous,`${file} must load in final authority order`);previous=index;}
assert.match(bootstrap,/window\.addEventListener\('load',startup/,'final authorities must reassert after legacy direct scripts finish loading');
assert.match(bootstrap,/__h38QuoteImageOrientationFinal/,'bootstrap health check must verify final render wrapper is outermost');

const hammer=fs.readFileSync(path.join(ROOT,'commercial-app','quote-working-hammer.js'),'utf8');
assert.match(hammer,/site-visit-quote-final-bootstrap\.js/,'production bootstrap must be reachable from a live-first startup asset');
const nativeStore=fs.readFileSync(path.join(ROOT,'native','h38-site-scanner','android-app','app','src','main','java','com','highway38','sitescanner','WalkthroughPhotoStore.java'),'utf8');
assert.match(nativeStore,/rotationCorrectionDegrees/);
assert.match(nativeStore,/row\.put\("rotationDegrees"/);
const photoRecovery=fs.readFileSync(path.join(ROOT,'commercial-app','android-walkthrough-photo-recovery.js'),'utf8');
assert.match(photoRecovery,/async function rotatePhoto/);
assert.match(photoRecovery,/return rotatePhoto\(file,meta\?\.rotationDegrees\)/);

console.log('PASS site-visit-quote-landscape-replay');
