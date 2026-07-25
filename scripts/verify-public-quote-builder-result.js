#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const need=(text,marker,label)=>{if(!text.includes(marker))throw new Error('Missing '+label+': '+marker);};
const absent=(text,marker,label)=>{if(text.includes(marker))throw new Error('Unexpected '+label+': '+marker);};
const universal=read('universal-quote-builder.html');
const library=read('sample-library-now.html');
const product=read('quote-builder.html');
const sample=read('quote-builder-sample-proposal.html');
const routes=JSON.parse(read('scripts/config/public-website-routes.json'));

need(universal,'id="result"','completed result section');
need(universal,'This is what Quote Builder produced—not just what it can store.','result-first headline');
['Master customer proposal','Trade sub-quotes','Drawing records','Bid packages','Cross-industry scenarios','Automatic external actions'].forEach(label=>need(universal,label,'result metric '+label));
need(universal,'quote-builder-sample-proposal.html','printable sample link');
need(library,'quote-builder-sample-proposal.html','Project Examples printable sample link');
need(product,'quote-builder-sample-proposal.html','product-page printable sample link');

need(sample,'Print / Save as PDF','print action');
need(sample,'window.print()','browser print implementation');
need(sample,'@media print','print stylesheet');
need(sample,'DEMONSTRATION<br>NOT A CONTRACT','visible demonstration watermark');
need(sample,'Safe public sample:','public data-boundary notice');
need(sample,'14 trade sub-quotes','completed trade output');
need(sample,'10-sheet drawing register','completed drawing output');
need(sample,'6 bid packages','completed bid output');
need(sample,'Internal cost, margin, vendor pricing, approval history, user data, and live Business Office records are intentionally excluded.','protected-field exclusion');
need(sample,'Customer copy and acceptance controls','print guidance');
need(sample,'Customer signature — disabled for this public demonstration','disabled public signature');

['Rick Krueth','rkrueth@gmail.com','USER-OWNER','RUN-20260725','UQBP-','UQBS-','google.script.run','script.google.com/macros'].forEach(marker=>absent(sample,marker,'private or authenticated marker'));
const route=routes.demonstrations.find(item=>item.path==='quote-builder-sample-proposal.html');
if(!route)throw new Error('Printable sample route is not registered.');
if(route.visibility!=='public'||route.shell!=='document')throw new Error('Printable sample route must be a public document route.');

const internalNumbers=['$9,750','$11,076','$22,308','$30,030','$19,305','$20,982','$17,004','$14,352','$13,065','$14,976','$21,372','$18,408','$6,708','$4,641'];
internalNumbers.forEach(value=>absent(sample,value,'internal cost value'));
console.log('PASS — Public website shows the completed Quote Builder outputs and provides a sanitized, watermarked, print-ready customer sample without private records or internal cost data.');
