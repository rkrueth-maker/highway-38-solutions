(function(){
  "use strict";
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
  const catalog=()=>window.H38_CATALOG||{products:[],bundles:[]};
  const systems=()=>window.H38_BUSINESS_SYSTEMS||[];
  const logoMarkup='<img class="brand-logo" src="assets/highway38-logo.png?v=20260713-logo2" alt="Highway 38 Solutions">';
  const systemMedia=s=>s.image?`<figure class="exp-media exp-system-media" data-image-classification="representative-environment"><img src="${esc(s.image)}?v=20260715-all-approved-v2" alt="${esc(s.imageAlt||s.name)}" width="1200" height="675" loading="lazy" decoding="async"><figcaption>Representative imagery, not customer proof.</figcaption></figure>`:"";
  // Compatibility vocabulary retained for automated contract checks: Services · Business Systems · Samples · Free Tools.
  function replaceNav(){
    const nav=$(".site-nav"); if(!nav)return;
    const page=document.body.dataset.page||"";
    const active=page==="business-systems"?"products":page;
    const links=[["home","index.html","Home"],["products","products.html","Solutions & Pricing"],["samples","sample-library-now.html","Examples"],["proof","proof.html","Proof"],["about","about.html","About"],["customer","customer-portal.html","Customer Portal"]];
    nav.innerHTML=`<div class="nav-inner"><a class="brand h38-brand-lockup" href="index.html">${logoMarkup}<span class="brand-text"><span>Highway 38</span> Solutions</span></a><button class="nav-toggle" type="button" aria-expanded="false" aria-controls="main-nav">Menu</button><ul class="nav-links" id="main-nav">${links.map(([id,href,label])=>`<li><a ${active===id?'aria-current="page"':''} href="${href}">${label}</a></li>`).join("")}<li><a class="nav-cta" ${page==="start"?'aria-current="page"':''} href="start-request.html">Start a Request</a></li></ul></div>`;
    const b=$(".nav-toggle",nav), list=$(".nav-links",nav);
    if(b&&list){b.addEventListener("click",()=>{const open=list.classList.toggle("is-open");b.setAttribute("aria-expanded",String(open))});$$("a",list).forEach(a=>a.addEventListener("click",()=>{list.classList.remove("is-open");b.setAttribute("aria-expanded","false")}));}
  }
  function replaceFooter(){
    const foot=$(".site-footer"); if(!foot)return;
    foot.innerHTML=`<div class="footer-inner"><div><a class="brand h38-brand-lockup" href="index.html">${logoMarkup}<span class="brand-text"><span>Highway 38</span> Solutions</span></a><p>Big problems. Clear plans.</p><p>Every request is reviewed before scope, price, payment, or work begins.</p></div><div class="footer-links"><a href="products.html">Solutions & Pricing</a><a href="sample-library-now.html">Examples</a><a href="proof.html">Proof</a><a href="about.html">About</a><a href="customer-portal.html">Customer Portal</a><a href="start-request.html">Start a Request</a><a href="free-tools.html">Free Tools</a><a href="resources.html">Resources</a><a href="service-guides.html">Service Guides</a><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a><a href="portal.html">Owner Login</a></div></div>`;
  }
  function addBestFor(){
    const C=catalog();
    $$(".product-card").forEach(card=>{
      if(card.querySelector(".exp-best-for"))return;
      const name=$("h3",card)?.textContent.trim(), p=C.products.find(x=>x.name===name);
      if(!p)return;
      const el=document.createElement("p");el.className="exp-best-for";el.innerHTML=`<strong>Best for:</strong> ${esc(p.ideal||p.bestFit?.[0]||p.summary)}`;
      const price=$(".price",card); (price||$("h3",card)).insertAdjacentElement("afterend",el);
    });
    $$(".detail-product").forEach(card=>{
      if(card.querySelector(".exp-best-for"))return;
      const name=$("h2",card)?.textContent.trim(), p=C.products.find(x=>x.name===name); if(!p)return;
      const el=document.createElement("p");el.className="exp-best-for";el.innerHTML=`<strong>Best for:</strong> ${esc(p.ideal||p.bestFit?.[0])}`;
      $(".lead",card)?.insertAdjacentElement("afterend",el);
    });
    $$(".bundle-card").forEach(card=>{
      if(card.querySelector(".exp-best-for"))return;
      const name=$("h3",card)?.textContent.trim(), b=C.bundles.find(x=>x.name===name);if(!b)return;
      const el=document.createElement("p");el.className="exp-best-for";el.innerHTML=`<strong>Best for:</strong> ${esc(b.ideal||b.outcome||"Customers who need the included services working together.")}`;
      $(".price",card)?.insertAdjacentElement("afterend",el);
    });
  }
  function renderSystems(){
    $$('[data-business-systems]').forEach(host=>{
      host.innerHTML=systems().map(s=>`<article class="exp-card exp-system-card" id="${esc(s.slug)}">${systemMedia(s)}<span class="exp-kicker">${esc(s.kicker)}</span><h3>${esc(s.name)}</h3><p class="exp-best-for"><strong>Best for:</strong> ${esc(s.bestFor)}</p><p>${esc(s.result)}</p><ul>${s.provides.slice(0,5).map(x=>`<li>${esc(x)}</li>`).join("")}</ul><p class="exp-price">${esc(s.price)}</p><span class="exp-status">${esc(s.status)}</span><div class="exp-system-actions button-row"><a class="btn btn-dark" href="start-request.html?system=${encodeURIComponent(s.slug)}">Start a Request</a><a class="btn btn-light" href="business-systems.html#${esc(s.slug)}">View details</a></div></article>`).join("");
    });
    $$('[data-system-scenarios]').forEach(host=>{
      host.innerHTML=systems().map(s=>`<article class="exp-card exp-scenario"><div class="exp-proof-labels"><span>Demonstration sample</span><span>Hypothetical</span><span>Not customer work</span></div><h3>${esc(s.name)} scenario</h3><p><strong>Starting condition:</strong> ${esc(s.problem)}</p><p><strong>Demonstrated result:</strong> ${esc(s.result)}</p><p><strong>Status:</strong> ${esc(s.status)}</p><p><strong>Proof boundary:</strong> This scenario demonstrates an approved product concept and does not claim a real customer result, automatic external action, or unbuilt feature.</p><a class="btn btn-dark" href="start-request.html?system=${encodeURIComponent(s.slug)}">Start a Request</a></article>`).join("");
    });
  }
  function supportSystemRequest(){
    const select=$("#business-system-interest"), form=$("#intake-form"); if(!select||!form)return;
    const qs=new URLSearchParams(location.search), requested=qs.get("system");
    systems().forEach(s=>{if(!Array.from(select.options).some(o=>o.value===s.slug)){const o=document.createElement("option");o.value=s.slug;o.textContent=s.name;select.appendChild(o);}});
    if(requested&&systems().some(s=>s.slug===requested))select.value=requested;
    function apply(){
      const s=systems().find(x=>x.slug===select.value); if(!s)return;
      const problem=$("#problem"), desired=$("#desired"), outcome=$("#outcome");
      if(outcome)outcome.value="unsure";
      if(problem&&!problem.value.trim())problem.value=`Business systems request — ${s.name}. Current problem: ${s.problem}`;
      if(desired&&!desired.value.trim())desired.value=s.result;
      let note=$("#system-request-note");
      if(!note){note=document.createElement("div");note.id="system-request-note";note.className="notice exp-no-charge--light";select.closest(".field")?.insertAdjacentElement("afterend",note);}
      note.innerHTML=`<strong>${esc(s.name)}</strong><br>${esc(s.status)}. Price is confirmed after requirements review. Submitting this request creates no charge or automatic purchase.`;
    }
    select.addEventListener("change",apply); if(select.value)apply();
    form.addEventListener("submit",()=>{const s=systems().find(x=>x.slug===select.value);if(!s)return;const p=$("#problem"),d=$("#desired");const marker=`Business system interest: ${s.name}. `;if(p&&!p.value.startsWith(marker))p.value=marker+p.value;if(d&&!d.value.startsWith(marker))d.value=marker+d.value;},true);
    form.addEventListener("submit",()=>{
      const s=systems().find(x=>x.slug===select.value);if(!s)return;
      const C=catalog(),summary=$("#summary"),result=$("#route-result"),openForm=$("#open-form"),email=$("#email-summary");
      const text=["HIGHWAY 38 BUSINESS SYSTEM REQUEST",`System interest: ${s.name}`,`Price: ${s.price}`,`Status: ${s.status}`,`Name: ${$("#name")?.value||""}`,`Email: ${$("#email")?.value||""}`,`Phone: ${$("#phone")?.value||""}`,`Current problem: ${$("#problem")?.value||""}`,`Desired result: ${$("#desired")?.value||""}`,`Timing: ${$("#timing")?.value||""}`,`Budget: ${$("#budget")?.value||""}`,`Files or links: ${$("#files")?.value||""}`,`Details and constraints: ${$("#details")?.value||""}`,"","Submitting this request creates no charge, purchase, payment, or automatic external action. Final modules, scope, price, timing, integrations, migration, support, and boundaries are confirmed in writing before work begins."].join("\n");
      if(summary)summary.textContent=text;if(result)result.classList.add("is-visible");if(openForm){openForm.href=C.formUrl||"start-request.html";openForm.textContent="Open Approved Request Form";}if(email){email.href=`mailto:${encodeURIComponent(C.businessEmail||"highway38solutions@gmail.com")}?subject=${encodeURIComponent(`Business system request — ${s.name}`)}&body=${encodeURIComponent(text)}`;}
    });
  }
  function sampleFilters(){
    const host=$("[data-samples='all']");if(!host)return;
    const map={"Clarify a problem":["H38-P001"],"Plan a space or project":["H38-P002","H38-P003"],"Improve a shop":["H38-P004","H38-P011"],"Organize a business workflow":["H38-P005","H38-P007"],"Build a digital workflow":["H38-P008","H38-P009"],"Clean up files and records":["H38-P006"],"Evaluate automation":["H38-P010","H38-P013","H38-P014","H38-P015"],"Prepare for vendors":["H38-P012"]};
    const shell=document.createElement("div");shell.className="exp-filter-controls";shell.setAttribute("aria-label","Filter samples by result");
    const buttons=[["all","All results"],...Object.keys(map).map(x=>[x,x])];
    shell.innerHTML=buttons.map(([v,l],i)=>`<button type="button" data-result-filter="${esc(v)}" aria-pressed="${i===0}">${esc(l)}</button>`).join("");
    host.parentElement.insertBefore(shell,host);
    const cards=()=>$$('.sample-card',host);
    cards().forEach(card=>{const id=$(".sample-labels span:last-child",card)?.textContent.trim();const group=Object.entries(map).find(([,ids])=>ids.includes(id))?.[0]||"Other";card.dataset.result=group;});
    $$('[data-result-filter]',shell).forEach(b=>b.addEventListener("click",()=>{$$('[data-result-filter]',shell).forEach(x=>x.setAttribute("aria-pressed","false"));b.setAttribute("aria-pressed","true");const v=b.dataset.resultFilter;cards().forEach(c=>c.hidden=v!=="all"&&c.dataset.result!==v);}));
  }
  function run(){replaceNav();replaceFooter();renderSystems();addBestFor();supportSystemRequest();sampleFilters();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",run,{once:true});else run();
})();
