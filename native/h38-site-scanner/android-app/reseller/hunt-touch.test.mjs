import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('./src/main/assets/reseller/v212-physical.js',import.meta.url),'utf8');
const handlers={};
const page={dataset:{},addEventListener(type,fn){handlers[type]=fn}};
let renders=0;
const ctx={
  console,
  window:null,
  document:{querySelectorAll:()=>[]},
  state:{hunt:{rows:[],expanded:{}},maintenance:{tests:[]}},
  bridge:()=>null,
  $:id=>id==='huntPage'?page:null,
  txt:v=>String(v??'').trim(),
  num:v=>Number(v||0)||0,
  authorize:async()=>{},
  strictImageRetailer:()=>false,
  itemCode:()=>'',
  cachedImage:()=>'',
  itemKey:()=>'',
  huntImageQueue:[],
  drainHuntImageQueue:async()=>{},
  error:()=>{},
  renderHuntListOnly:()=>{renders++},
  renderHunt:()=>{},
  runMaintenance:async()=>{},
  renderMaintenance:()=>{},
  fn:async()=>({leads:[],source_status:[],canonical_identity_version:'retailer-upc-sku-bridge-v063'}),
  locationPayload:()=>({postal:'55744',radiusMiles:50}),
  setTimeout:fn=>{fn();return 1},
  clearTimeout:()=>{},
  Date,
  Math,
  Number,
  String,
  Array,
  Set
};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(source,ctx,{filename:'v212-physical.js'});
vm.runInContext('h38BindStableHuntTouch()',ctx);

assert.equal(page.dataset.h38HuntTouchBound,'1','stable Hunt-page delegation must bind');
for(const name of ['pointerdown','pointerup','click','keydown'])assert.equal(typeof handlers[name],'function',`${name} handler must exist`);

function target(key){const button={dataset:{huntGroup:key}};return{closest:sel=>sel==='[data-hunt-group]'?button:null}}
function evt(key,id=1,x=100,y=100){return{target:target(key),pointerId:id,clientX:x,clientY:y,preventDefault(){},stopPropagation(){}}}

handlers.pointerdown(evt('dollar general',7,100,100));
handlers.pointerup(evt('dollar general',7,104,103));
assert.equal(ctx.state.hunt.expanded['dollar general'],true,'pointer tap must expand Dollar General');
const afterPointer=renders;
handlers.click(evt('dollar general'));
assert.equal(ctx.state.hunt.expanded['dollar general'],true,'synthetic click after pointerup must not double-toggle closed');
assert.equal(renders,afterPointer,'suppressed synthetic click must not rerender');

vm.runInContext('h38HuntLastToggleAt=0',ctx);
handlers.click(evt('home depot'));
assert.equal(ctx.state.hunt.expanded['home depot'],true,'click fallback must expand Home Depot');
vm.runInContext('h38HuntLastToggleAt=0',ctx);
handlers.click(evt('home depot'));
assert.equal(ctx.state.hunt.expanded['home depot'],false,'second click fallback must collapse Home Depot');

const beforeMove=renders;
handlers.pointerdown(evt('dollar tree',9,10,10));
handlers.pointerup(evt('dollar tree',9,80,80));
assert.equal(ctx.state.hunt.expanded['dollar tree'],undefined,'scroll-like pointer movement must not open a retailer');
assert.equal(renders,beforeMove,'scroll-like pointer movement must not rerender');

console.log('PASS Hunt touch expand/collapse behavioral fixture');
