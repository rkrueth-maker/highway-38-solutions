const fs=require('fs');
const path=require('path');

const out=path.resolve(process.argv[2]||'artifacts/scout-web-static');
fs.mkdirSync(out,{recursive:true});

function read(p){return fs.readFileSync(path.resolve(p),'utf8');}
function extract(ts){
  const m=ts.match(/String\.raw`([\s\S]*?)`;\s*\n/);
  if(!m) throw new Error('HTML template not found');
  return m[1];
}
const rewrites=[
  ['/functions/v1/h38-deals-shell','/'],
  ['/functions/v1/h38-penny-web','/penny.html'],
  ['/functions/v1/h38-resale-web','/resale.html'],
  ['/functions/v1/h38-coupon-web','/coupon.html'],
  ['/functions/v1/h38-deal-engine-web','/best.html'],
  ['/functions/v1/h38-deals-maintenance-web','/maintenance.html']
];
function transform(h){
  for(const [a,b] of rewrites) h=h.split(a).join(b);
  return h;
}
let shell=transform(extract(read('deals-app/h38-deals-shell-v315.ts')));
shell=shell.replace(
  '<div class="foot">Web-backed products update without reinstalling the Android app.</div>',
  '<div class="foot">Web-backed products update without reinstalling the Android app.<br><a href="/maintenance.html">Maintenance & diagnostics</a></div>'
);
const files={
  'index.html':shell,
  'penny.html':transform(extract(read('supabase/functions/h38-penny-web/index.ts'))),
  'resale.html':transform(extract(read('supabase/functions/h38-resale-web/index.ts'))),
  'coupon.html':transform(extract(read('supabase/functions/h38-coupon-web/index.ts'))),
  'best.html':transform(extract(read('supabase/functions/h38-deal-engine-web/index.ts'))),
  'maintenance.html':transform(extract(read('supabase/functions/h38-deals-maintenance-web/index.ts')))
};
for(const [name,data] of Object.entries(files)) fs.writeFileSync(path.join(out,name),data);
console.log('H38_STATIC_WEB_BUILD_PASS',Object.keys(files).join(','));
