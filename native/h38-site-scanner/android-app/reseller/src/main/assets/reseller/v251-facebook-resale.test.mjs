import fs from 'node:fs';
const s=fs.readFileSync(new URL('./v200-discover.js',import.meta.url),'utf8');
const need=[
  'rankCapturedFacebookRows',
  "sources:['Facebook Marketplace']",
  'facebookCandidates:rows',
  'window.addEventListener(\'focus\'',
  "document.addEventListener('visibilitychange'",
  "state.facebookPassPending=true",
  "split(',')[0]",
  'resale/profit ranking'
];
for(const x of need)if(!s.includes(x))throw new Error('Missing Facebook resale contract: '+x);
if(s.includes("state.v240.facebookRows=rows"))throw new Error('Device Facebook rows must not be mislabeled as public backend rows.');
console.log('PASS Facebook capture -> resale ranking return contract');
