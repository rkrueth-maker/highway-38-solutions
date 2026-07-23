#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'scripts/config/approved-public-image-placements.json'),'utf8'));
const failures=[],passes=[];
function check(name,condition,detail=''){(condition?passes:failures).push({name,detail});console[condition?'log':'error'](`${condition?'PASS':'FAIL'}: ${name}${detail?` — ${detail}`:''}`);}
function read(file){return fs.readFileSync(path.join(root,file),'utf8');}
function count(text,needle){let total=0,index=0;while((index=text.indexOf(needle,index))>=0){total++;index+=needle.length;}return total;}

check('placement manifest schema',manifest.schemaVersion===1,manifest.policyVersion||'');
check('approved logo path matches asset manifest',manifest.logo.path==='assets/highway38-logo.png'&&manifest.logo.cacheKey==='20260720-exact-0cbc4514');

Object.entries(manifest.pages||{}).forEach(([page,placements])=>{
  const file=path.join(root,page);
  check(`${page} exists`,fs.existsSync(file));
  if(!fs.existsSync(file))return;
  const html=fs.readFileSync(file,'utf8');
  const expectedCounts={};
  placements.forEach(item=>{expectedCounts[item.src]=(expectedCounts[item.src]||0)+1;check(`${page} ${item.role} exact source`,html.includes(item.src),item.src);check(`${page} ${item.role} exact alt`,html.includes(`alt="${item.alt}"`)||html.includes(`alt='${item.alt}'`),item.alt);check(`${item.src} exists`,fs.existsSync(path.join(root,item.src)),item.src);});
  Object.entries(expectedCounts).forEach(([src,expected])=>check(`${page} preserves ${src} occurrence count`,count(html,src)===expected,`${count(html,src)}/${expected}`));
  const imageTags=[...html.matchAll(/<img\b[^>]*>/gi)].map(match=>match[0]);
  check(`${page} images have alt text`,imageTags.every(tag=>/\balt=["'][^"']*["']/.test(tag)),`${imageTags.length} images`);
});

Object.entries(manifest.dynamicPages||{}).forEach(([page,config])=>{
  const html=read(page);
  Object.entries(config.sourceConstants||{}).forEach(([key,value])=>check(`${page} ${key} source constant`,html.includes(value),value));
  Object.entries(config.examples||{}).forEach(([key,files])=>files.forEach(file=>{check(`${page} ${key} uses ${file}`,html.includes(file),file);const full=(file.includes('deck-')||file.includes('irrigation-')||file.includes('kitchen-'))?`assets/demo-workthroughs/${file}`:`assets/contractor-demo/${file}`;check(`${full} exists`,fs.existsSync(path.join(root,full)),full);}));
});

const canonical=read('assets/js/h38-site-v2.js');
const legacyProject=read('assets/js/project-intelligence.js');
const legacyBrand=read('brand-global.js');
check('canonical shell declares source lock',/imagePolicy:\{changeSource:false,insertImages:false,fallbackImages:false/.test(canonical));
check('canonical shell does not assign content image sources',!/\.querySelectorAll\([^\n]*img[\s\S]{0,300}\.src\s*=/.test(canonical));
check('canonical shell never inserts representative images',!/representativeFigure|placeApprovedImages|addRepresentativeGroup|IMAGE_BASE/.test(canonical));
check('canonical shell has no fallback content image',!/fallback(?:Image)?|onerror\s*=|img\.src\s*=/.test(canonical));
check('canonical shell optimizes loading without source changes',/img\.loading='lazy'/.test(canonical)&&/img\.decoding='async'/.test(canonical)&&/img\.fetchPriority='high'/.test(canonical));
check('project compatibility loader contains no image logic',!/fallback|contractor-demo|approved-website-images|\.src\s*=\s*['"]assets\//.test(legacyProject));
check('brand compatibility loader contains no image placement',!/representativeFigure|placeApprovedImages|addRepresentativeGroup|IMAGE_BASE|approved-website-images/.test(legacyBrand));

const result={status:failures.length?'HOLD':'PASS',generatedAt:new Date().toISOString(),policyVersion:manifest.policyVersion,approvedLogoLocked:true,contentImageSourcesLocked:true,runtimeImageSourceChangesAllowed:false,passed:passes.length,failed:failures.length,passes,failures};
const outDir=path.join(root,'artifacts','public-image-placements');fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(path.join(outDir,'verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));process.exit(failures.length?1:0);
