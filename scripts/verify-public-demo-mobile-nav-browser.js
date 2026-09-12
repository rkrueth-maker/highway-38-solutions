'use strict';
const fs=require('fs');
const path=require('path');
const assert=require('assert');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const baseCss=fs.readFileSync(path.join(root,'commercial-app/styles.css'),'utf8');
const demoCss=fs.readFileSync(path.join(root,'business-office-review-demo.css'),'utf8');
const labels=['Today','Customers','Work','Quotes','Schedule','Messages','Site Visit','Money','Accounting','Payroll','Tax','Reports','People','Settings'];
async function checkViewport(page,width){
  await page.setViewportSize({width,height:844});
  await page.setContent(`<!doctype html><html><head><style>${baseCss}\n${demoCss}</style></head><body><nav id="mainNav" class="main-nav">${labels.map((label,i)=>`<button${i===0?' class="active"':''}><span class="nav-icon">●</span><span>${label}</span></button>`).join('')}</nav><main>Demo</main></body></html>`);
  const metrics=await page.evaluate(()=>{
    const nav=document.getElementById('mainNav');
    const buttons=[...nav.querySelectorAll('button')];
    return{
      overflowX:getComputedStyle(nav).overflowX,
      clientWidth:nav.clientWidth,
      scrollWidth:nav.scrollWidth,
      rects:buttons.map(button=>{const r=button.getBoundingClientRect();return{left:r.left,right:r.right,width:r.width};})
    };
  });
  assert.ok(['auto','scroll'].includes(metrics.overflowX),`mobile nav must intentionally scroll horizontally at ${width}px`);
  assert.ok(metrics.scrollWidth>metrics.clientWidth,`mobile nav must expose all destinations by horizontal scroll at ${width}px`);
  const minWidth=width<=360?63:67;
  metrics.rects.forEach((rect,index)=>assert.ok(rect.width>=minWidth,`${labels[index]} touch target is too narrow at ${width}px: ${rect.width}`));
  for(let i=1;i<metrics.rects.length;i++)assert.ok(metrics.rects[i].left>=metrics.rects[i-1].right-0.5,`${labels[i-1]} and ${labels[i]} overlap at ${width}px`);
  await page.evaluate(()=>{const nav=document.getElementById('mainNav');nav.scrollLeft=nav.scrollWidth;});
  await page.waitForTimeout(50);
  const lastVisible=await page.evaluate(()=>{const nav=document.getElementById('mainNav'),last=nav.lastElementChild,n=nav.getBoundingClientRect(),b=last.getBoundingClientRect();return b.right<=n.right+1&&b.left<n.right;});
  assert.equal(lastVisible,true,`last mobile nav destination must be reachable at ${width}px`);
}
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await checkViewport(page,390);
    await checkViewport(page,320);
    assert.deepEqual(errors,[],'public demo mobile nav verification should have no browser errors');
    console.log(JSON.stringify({status:'PASS',checks:['390px nav labels do not overlap','320px nav labels do not overlap','touch targets stay usable','all nav destinations remain reachable']},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
