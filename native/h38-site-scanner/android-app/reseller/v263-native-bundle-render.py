from pathlib import Path
import shutil,sys

src=Path(sys.argv[1]) if len(sys.argv)>1 else Path('reseller/src/main/assets/reseller')
out=Path(sys.argv[2]) if len(sys.argv)>2 else Path('/tmp/h38-v263-native-render')
if out.exists(): shutil.rmtree(out)
out.mkdir(parents=True)

# Reproduce MainActivity.bundledPage(): index + inline CSS + the exact native module
# list + v240 inserted immediately before v200-app. Deliberately DO NOT copy v261 or
# v262 beside index; this catches the physical-phone failure where relative scripts
# resolved against highway38solutions.com instead of APK assets.
html=(src/'index.html').read_text()
html=html.replace('<link rel="stylesheet" href="v200-ui.css">','<style>'+(src/'v200-ui.css').read_text()+'</style>')
modules=['v200-core.js','v200-hunt.js','v200-auctions.js','v200-discover.js','v200-scan.js','v200-more.js','v210-polish.js','v211-wide.js','v212-physical.js','v220-profit.js','v220-track.js','v220-product.js','v200-app.js']
for name in modules:
    html=html.replace(f'<script src="{name}"></script>',f'<script data-h38-bundled-module="{name}">'+(src/name).read_text()+'</script>')
app_marker='<script data-h38-bundled-module="v200-app.js">'
provider='<script data-h38-bundled-module="v240-data.js">'+(src/'v240-data.js').read_text()+'</script>'
assert app_marker in html
html=html.replace(app_marker,provider+app_marker,1)

cdn='<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>'
assert cdn in html
stub=r'''<script>
window.__H38_V263_NATIVE_BUNDLE_FIXTURE=true;
const __chain={select(){return __chain},order(){return __chain},limit(){return Promise.resolve({data:[],error:null})},insert(){return Promise.resolve({data:[],error:null})}};
window.supabase={createClient(){return{auth:{getSession:async()=>({data:{session:{access_token:'TEST_TOKEN',user:{id:'ccf25333-47cd-42ca-a20b-cdbc63a8a695',email:'owner-test@h38.local'}}}}),signInWithPassword:async()=>({data:{session:null},error:null}),signOut:async()=>({})},from(){return __chain}}}};
window.fetch=async function(url,opts){
  const u=String(url);let body={};
  if(u.includes('reseller-location-geocode'))body={location:{lat:47.2372,lon:-93.5302,city:'Grand Rapids',state:'MN'}};
  else if(u.includes('reseller-nearby-stores-v262'))body={status:'PASS',provider:'central-nearby-bootstrap-v262',stores:[
    {store_key:'fixture-hd',store_name:'Home Depot',retailer:'Home Depot',store_address:'Fixture Home Depot Grand Rapids MN 55744',lat:47.245,lon:-93.53,distance_miles:0.8},
    {store_key:'fixture-dg',store_name:'Dollar General',retailer:'Dollar General',store_address:'Fixture Dollar General Grand Rapids MN 55744',lat:47.23,lon:-93.52,distance_miles:1.1}
  ]};
  else if(u.includes('reseller-facebook-public-v240'))body={status:'PASS',engine:'H38_FACEBOOK_PUBLIC_V263',provider_status:'LIVE',provider:'fixture public sources',authentication:'NO_FACEBOOK_LOGIN',device_fallback_required:false,results:[{id:'fixture-fb-1',source:'Facebook Marketplace',title:'Fixture Milwaukee Drill',price:40,buy_price:40,url:'https://www.facebook.com/marketplace/item/123456789012345/',image_url:'',location_label:'Grand Rapids, MN',distance_miles:2.4,location_verified:true,location_evidence:'distance',public_listing:true}],count:1};
  else if(u.includes('reseller-opportunity-scan-v060'))body={opportunities:[],candidates:[],source_status:[],warnings:[]};
  else if(u.includes('reseller-nearby-stores'))body={stores:[],sources:[]};
  else if(u.includes('reseller-home-depot-local-v240'))body={status:'PARTIAL',provider_status:'CONFIG_REQUIRED',readings:[],verified_count:0};
  else if(u.includes('reseller-dg-remodel-radar-v240'))body={status:'PARTIAL',provider_status:'CONFIG_REQUIRED',stores:[],community_candidates:[],indicator_count:0,indicators:[]};
  else if(u.includes('reseller-auto-leads-v063'))body={status:'PASS',leads:[],raw_count:0,warnings:[],source_status:[]};
  else if(u.includes('reseller-auction-search-v230'))body={status:'PASS',results:[],source_health:{},source_routes:[]};
  else if(u.includes('reseller-image-cache-v230'))body={images:[]};
  else if(u.includes('reseller-facebook-ledger-v230'))body={status:'PASS'};
  return {ok:true,status:200,json:async()=>body,text:async()=>JSON.stringify(body)};
};
let __clicked=false;
const __timer=setInterval(()=>{
  try{
    const b=document.getElementById('facebookScan'),app=document.getElementById('appView');
    if(!__clicked&&window.H38_SCOUT_V263_PHYSICAL_BUNDLE_AUTHORITY===true&&app&&!app.classList.contains('hidden')&&b&&/Search public Facebook/.test(b.textContent||'')){
      __clicked=true;b.click();clearInterval(__timer);
    }
  }catch{}
},100);
</script>'''
html=html.replace(cdn,stub,1)
(out/'index.html').write_text(html)
print(out)
