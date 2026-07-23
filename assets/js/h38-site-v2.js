(()=>{
  'use strict';
  if(window.H38_PUBLIC_SITE&&window.H38_PUBLIC_SITE.mounted)return;
  const ROOT_PAGE=!/\/businesses\//.test(location.pathname);
  if(!ROOT_PAGE)return;
  const VERSION='2026-07-23-site-architecture-v1';
  const LOGO='assets/highway38-logo.png?v=20260720-exact-0cbc4514';
  const registry={
    version:VERSION,
    logo:LOGO,
    navigation:[
      {href:'sample-library-now.html',label:'Project Examples'},
      {href:'solutions.html',label:'What We Do'},
      {href:'pricing.html',label:'Pricing'},
      {href:'about.html',label:'About'},
      {href:'portal.html',label:'Owner Access'},
      {href:'start-request.html',label:'Start a Project',cta:true}
    ],
    footer:[
      {heading:'Start',links:[['Project Examples','sample-library-now.html'],['Start a Project','start-request.html'],['Pricing','pricing.html']]},
      {heading:'Learn',links:[['What We Do','solutions.html'],['About','about.html'],['Contact','contact.html']]},
      {heading:'Private',links:[['Owner Access','portal.html']]}
    ],
    redirects:{
      'catalog.html':'pricing.html','products.html':'pricing.html','product.html':'pricing.html','packages.html':'pricing.html',
      'tools.html':'sample-library-now.html','free-tools.html':'sample-library-now.html','tool-center.html':'sample-library-now.html','proof.html':'sample-library-now.html',
      'forgeiq.html':'solutions.html','services.html':'solutions.html','specials.html':'pricing.html'
    },
    imagePolicy:{changeSource:false,insertImages:false,fallbackImages:false,optimizeAttributes:true}
  };
  window.H38_PUBLIC_SITE=registry;
  function currentPage(){return location.pathname.split('/').pop()||'index.html';}
  function ensureStyles(){if(document.querySelector('link[data-h38-site-shell]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='assets/css/h38-site-v2.css?v='+VERSION;link.dataset.h38SiteShell='1';document.head.appendChild(link);}
  function brand(){return `<a class="pi-brand" href="index.html"><img src="${LOGO}" alt="Highway 38 Solutions" width="95" height="78"><span>HIGHWAY 38 SOLUTIONS</span></a>`;}
  function navMarkup(){const page=currentPage();const links=registry.navigation.map(item=>{const active=page===item.href||(page==='index.html'&&item.href==='index.html');return `<a${item.cta?' class="pi-btn primary"':''} href="${item.href}"${active?' aria-current="page"':''}>${item.label}</a>`;}).join('');return `${brand()}<button class="pi-menu" type="button" aria-expanded="false" aria-controls="h38-main-navigation">Menu</button><nav class="pi-links" id="h38-main-navigation" aria-label="Main navigation">${links}</nav>`;}
  function footerMarkup(){return `<div class="pi-footer-grid"><div class="pi-logo-lock"><img src="${LOGO}" alt="Highway 38 Solutions" width="95" height="78"><p>Plans, quotes and guided project delivery.</p></div>${registry.footer.map(group=>`<div><h4>${group.heading}</h4>${group.links.map(link=>`<a href="${link[1]}">${link[0]}</a>`).join('')}</div>`).join('')}</div>`;}
  function mountHeader(){const header=document.querySelector('header.pi-nav,nav.site-nav,header.site-header');if(!header)return;if(header.matches('nav')){const replacement=document.createElement('header');replacement.className='pi-nav';header.replaceWith(replacement);replacement.innerHTML=navMarkup();}else{header.className='pi-nav';header.innerHTML=navMarkup();}}
  function mountFooter(){const footer=document.querySelector('footer.pi-footer,footer.site-footer,footer.footer');if(!footer)return;footer.className='pi-footer';footer.innerHTML=footerMarkup();}
  function wireMenu(){const button=document.querySelector('.pi-menu'),nav=document.querySelector('.pi-links');if(!button||!nav)return;button.addEventListener('click',()=>{const open=nav.classList.toggle('open');button.setAttribute('aria-expanded',String(open));});nav.addEventListener('click',event=>{if(event.target.closest('a')){nav.classList.remove('open');button.setAttribute('aria-expanded','false');}});}
  function routeOwnerLinks(){document.querySelectorAll('a[href*="script.google.com/macros/s/"]').forEach(link=>{if(link.hasAttribute('data-owner-app'))return;if(!/owner\s+(portal|login|access)/i.test((link.textContent||'').replace(/\s+/g,' ').trim()))return;link.href='portal.html';link.removeAttribute('target');link.removeAttribute('rel');});}
  function optimizeImages(){const images=[...document.querySelectorAll('main img,article img,section img,footer img,header img')];let primaryAssigned=false;images.forEach(img=>{const src=img.getAttribute('src')||'';img.decoding='async';if(src.startsWith('assets/highway38-logo.png')){img.loading='eager';img.addEventListener('error',()=>{img.hidden=true;},{once:true});return;}const hero=!!img.closest('.pi-hero-media,.workflow-hero-panel,.hero-media,.hero');if(hero&&!primaryAssigned){img.loading='eager';img.fetchPriority='high';primaryAssigned=true;}else img.loading='lazy';});}
  function ensureSkipLink(){const main=document.querySelector('main');if(!main)return;if(!main.id)main.id='main';if(document.querySelector('.skip-link'))return;const link=document.createElement('a');link.className='skip-link';link.href='#main';link.textContent='Skip to main content';document.body.insertBefore(link,document.body.firstChild);}
  function mount(){if(registry.mounted)return;ensureStyles();ensureSkipLink();mountHeader();mountFooter();wireMenu();routeOwnerLinks();optimizeImages();registry.mounted=true;document.documentElement.dataset.h38SiteVersion=VERSION;}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
