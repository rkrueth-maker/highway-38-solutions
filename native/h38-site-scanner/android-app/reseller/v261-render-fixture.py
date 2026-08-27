from pathlib import Path
import shutil,sys

root=Path('reseller')
src=Path(sys.argv[1]) if len(sys.argv)>1 else root/'src/main/assets/reseller'
out=Path(sys.argv[2]) if len(sys.argv)>2 else Path('/tmp/h38-v261-render')
if out.exists(): shutil.rmtree(out)
shutil.copytree(src,out)
index=out/'index.html'
s=index.read_text()
needle='<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>'
assert needle in s
stub=r'''<script>
window.__H38_V261_RENDER_FIXTURE=true;
const __chain={select(){return __chain},order(){return __chain},limit(){return Promise.resolve({data:[],error:null})},insert(){return Promise.resolve({data:[],error:null})}};
window.supabase={createClient(){return{auth:{getSession:async()=>({data:{session:{access_token:'TEST_TOKEN',user:{id:'ccf25333-47cd-42ca-a20b-cdbc63a8a695',email:'owner-test@h38.local'}}}}),signInWithPassword:async()=>({data:{session:null},error:null}),signOut:async()=>({})},from(){return __chain}}}};
window.fetch=async function(url,opts){
  const u=String(url);let body={};
  if(u.includes('reseller-location-geocode'))body={location:{lat:47.2372,lon:-93.5302,city:'Grand Rapids',state:'MN'}};
  else if(u.includes('reseller-facebook-public-v240'))body={status:'PASS',engine:'H38_FACEBOOK_PUBLIC_V261',provider_status:'LIVE',provider:'fixture public sources',authentication:'NO_FACEBOOK_LOGIN',device_fallback_required:false,results:[{id:'fixture-fb-1',source:'Facebook Marketplace',title:'Fixture Milwaukee Drill',price:40,buy_price:40,url:'https://www.facebook.com/marketplace/item/123456789012345/',image_url:'',location_label:'Grand Rapids, MN',distance_miles:2.4,location_verified:true,location_evidence:'distance',public_listing:true}],count:1};
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
const __clickTimer=setInterval(()=>{
  try{
    const b=document.getElementById('facebookScan');
    if(!__clicked&&window.H38_SCOUT_V261_FACEBOOK_PUBLIC_INSTALLED===true&&window.state?.user&&b&&/Search public Facebook/.test(b.textContent||'')){
      __clicked=true;b.click();clearInterval(__clickTimer);
    }
  }catch{}
},100);
</script>'''
s=s.replace(needle,stub,1)
index.write_text(s)
print(out)
