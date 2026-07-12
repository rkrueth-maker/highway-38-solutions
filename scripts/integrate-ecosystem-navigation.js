#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const file=path.join(ROOT,'index.html');
if(!fs.existsSync(file))throw new Error('index.html not found');
let html=fs.readFileSync(file,'utf8');
const original=html;

const navLink='<a href="ecosystem-status.html" data-h38-ecosystem-link>Tools &amp; Ecosystem</a>';
if(!html.includes('data-h38-ecosystem-link')){
  const navClose=html.search(/<\/nav\s*>/i);
  if(navClose>=0)html=html.slice(0,navClose)+navLink+html.slice(navClose);
  else {
    const bodyOpen=html.match(/<body[^>]*>/i);
    if(!bodyOpen)throw new Error('index.html has no body element');
    const at=bodyOpen.index+bodyOpen[0].length;
    html=html.slice(0,at)+`<div style="background:#17324d;color:#fff;padding:10px;text-align:center"><a href="ecosystem-status.html" data-h38-ecosystem-link style="color:#fff;font-weight:800">Open Highway 38 tools and ecosystem</a></div>`+html.slice(at);
  }
}

const section=`
<section class="h38-ecosystem-entry" data-h38-ecosystem-entry aria-labelledby="h38-ecosystem-title">
  <div class="h38-ecosystem-entry-inner">
    <p class="h38-ecosystem-kicker">PLANNING TOOLS & CUSTOMER PATH</p>
    <h2 id="h38-ecosystem-title">Start with the problem. Leave with a practical next step.</h2>
    <p>Prepare a project request, test a business concept, run practical planning calculations, or review public-safe examples before choosing a service.</p>
    <div class="h38-ecosystem-actions">
      <a href="customer-portal.html">Prepare a project</a>
      <a href="business-concept-builder.html">Build a business concept</a>
      <a href="tool-center.html">Use planning calculators</a>
      <a href="proof-center.html">Browse public-safe proof</a>
    </div>
  </div>
</section>`;
if(!html.includes('data-h38-ecosystem-entry')){
  const mainClose=html.search(/<\/main\s*>/i);
  const bodyClose=html.search(/<\/body\s*>/i);
  const at=mainClose>=0?mainClose:bodyClose;
  if(at<0)throw new Error('index.html has no main or body closing element');
  html=html.slice(0,at)+section+html.slice(at);
}

const style=`
<style data-h38-ecosystem-style>
.h38-ecosystem-entry{padding:clamp(44px,7vw,82px) 20px;background:linear-gradient(135deg,#eaf4fb,#fff);color:#102133}
.h38-ecosystem-entry-inner{width:min(1120px,100%);margin:auto}
.h38-ecosystem-kicker{font-weight:900;letter-spacing:.11em;color:#27648f;font-size:.78rem}
.h38-ecosystem-entry h2{max-width:850px;font-size:clamp(2rem,4vw,3.2rem);line-height:1.08;margin:.2em 0}
.h38-ecosystem-entry p{max-width:780px;color:#5c7082;font-size:1.05rem}
.h38-ecosystem-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}
.h38-ecosystem-actions a{display:inline-flex;padding:11px 15px;border-radius:10px;background:#17324d;color:#fff;text-decoration:none;font-weight:800}
.h38-ecosystem-actions a:hover,.h38-ecosystem-actions a:focus{background:#27648f}
</style>`;
if(!html.includes('data-h38-ecosystem-style')){
  const headClose=html.search(/<\/head\s*>/i);
  if(headClose<0)throw new Error('index.html has no head closing element');
  html=html.slice(0,headClose)+style+html.slice(headClose);
}

if(html!==original){fs.writeFileSync(file,html,'utf8');console.log('Integrated ecosystem navigation and homepage entry.');}
else console.log('Ecosystem navigation already integrated; no change.');
