(function(){
  'use strict';
  const LOGO='assets/highway38-logo.png?v=20260713-logo2';
  const IMAGE_BASE='assets/approved-website-images/';
  const IMAGE_VERSION='?v=20260715-all-approved-v2';
  const brandText=()=>'<span class="brand-text"><span>Highway 38</span> Solutions</span>';
  const logo=()=>{const img=document.createElement('img');img.className='brand-logo';img.src=LOGO;img.alt='Highway 38 Solutions';return img;};
  function loadPublicVisualCleanup(){
    if(document.querySelector('link[data-h38-visual-cleanup]'))return;
    const link=document.createElement('link');link.rel='stylesheet';link.href='visual-cleanup-secondary.css?v=20260718-one-pass';link.dataset.h38VisualCleanup='true';document.head.appendChild(link);
  }
  function wrapText(el){
    if(el.querySelector('.brand-text'))return;
    const nodes=[...el.childNodes].filter(node=>!(node.nodeType===1&&node.classList.contains('brand-logo')));
    const wrapper=document.createElement('span');wrapper.className='brand-text';
    nodes.forEach(node=>wrapper.appendChild(node));
    if(!wrapper.textContent.trim())wrapper.innerHTML='<span>Highway 38</span> Solutions';
    el.appendChild(wrapper);
  }
  function enhance(el){
    if(!el||el.querySelector('.brand-logo'))return false;
    const text=(el.textContent||'').replace(/\s+/g,' ').trim();
    if(!/highway\s*38/i.test(text)&&!el.matches('.brand,.site-brand,.navbar-brand,.logo'))return false;
    el.classList.add('h38-brand-lockup');
    el.insertBefore(logo(),el.firstChild);
    wrapText(el);
    return true;
  }
  function ensureHeader(){
    const candidates=document.querySelectorAll('a.brand,a.site-brand,a.navbar-brand,a.logo,.brand a,.site-brand a,.eco-brand');
    let found=false;candidates.forEach(el=>{if(enhance(el))found=true;else if(el.querySelector('.brand-logo'))found=true;});
    if(found)return;
    const nav=document.querySelector('nav');
    if(nav){const link=document.createElement('a');link.href='index.html';link.className='h38-global-brandbar__link';link.appendChild(logo());link.insertAdjacentHTML('beforeend',brandText());nav.insertBefore(link,nav.firstChild);return;}
    const header=document.querySelector('header');
    if(header){const bar=document.createElement('div');bar.className='h38-global-brandbar';bar.innerHTML='<a class="h38-global-brandbar__link" href="index.html"><img class="brand-logo" src="'+LOGO+'" alt="Highway 38 Solutions" />'+brandText()+'</a>';header.insertBefore(bar,header.firstChild);return;}
    const bar=document.createElement('div');bar.className='h38-global-brandbar';bar.innerHTML='<a class="h38-global-brandbar__link" href="index.html"><img class="brand-logo" src="'+LOGO+'" alt="Highway 38 Solutions" />'+brandText()+'</a>';document.body.insertBefore(bar,document.body.firstChild);
  }
  function ensureFooter(){
    document.querySelectorAll('footer').forEach(footer=>{
      if(footer.querySelector('.brand-logo'))return;
      const wrap=document.createElement('div');wrap.className='h38-legacy-footer-brand';wrap.innerHTML='<a class="h38-footer-brand" href="index.html"><img class="brand-logo" src="'+LOGO+'" alt="Highway 38 Solutions" />'+brandText()+'</a>';
      footer.insertBefore(wrap,footer.firstChild);
    });
  }
  function routeLegacyOwnerLinks(){
    document.querySelectorAll('a[href*="script.google.com/macros/s/"]').forEach(link=>{
      if(link.hasAttribute('data-owner-app'))return;
      const label=(link.textContent||'').replace(/\s+/g,' ').trim();
      if(!/owner\s+(portal|login)/i.test(label))return;
      link.href='portal.html';
      link.removeAttribute('target');
      link.removeAttribute('rel');
    });
  }
  function representativeFigure(file,alt,caption){
    const figure=document.createElement('figure');figure.className='h38-representative-image';figure.dataset.imageClassification='representative-environment';
    const img=document.createElement('img');img.src=IMAGE_BASE+file+IMAGE_VERSION;img.alt=alt;img.width=1200;img.height=675;img.loading='lazy';img.decoding='async';
    const figcaption=document.createElement('figcaption');figcaption.textContent=caption+' · Representative imagery, not customer proof.';
    figure.append(img,figcaption);return figure;
  }
  function addRepresentativeGroup(target,items,position='afterbegin'){
    if(!target||target.querySelector('.h38-approved-image-group'))return;
    const group=document.createElement('div');group.className='h38-approved-image-group';group.setAttribute('aria-label','Representative Highway 38 imagery');
    items.forEach(item=>group.appendChild(representativeFigure(item.file,item.alt,item.caption)));
    target.insertAdjacentElement(position,group);
  }
  function placeApprovedImages(){
    const page=document.body.dataset.page||'';
    if(page==='products'&&document.querySelector('#space-project')){
      addRepresentativeGroup(document.querySelector('#digital .exp-wrap'),[
        {file:'13-digital-organization-file-system.jpg',alt:'Organized digital file system displayed beside structured physical folders.',caption:'Digital workflow and file organization'}
      ],'beforeend');
      addRepresentativeGroup(document.querySelector('#manufacturing .exp-wrap'),[
        {file:'12-cnc-machining-closeup.jpg',alt:'CNC machining operation cutting a metal workpiece in a secured fixture.',caption:'CNC and manufacturing planning'}
      ],'beforeend');
    }
    if(page==='start'){
      addRepresentativeGroup(document.querySelector('.start-request-section .container'),[
        {file:'08-request-process-checklist.jpg',alt:'Project request checklist with measuring tape, notes, and pen on a work surface.',caption:'Request preparation and review'}
      ]);
    }
    if(page==='about'){
      addRepresentativeGroup(document.querySelector('main .command-center-placement .commercial-wrap'),[
        {file:'09-clean-working-shop-floor.jpg',alt:'Clean working shop floor with workbenches, tool storage, and equipment.',caption:'Practical working environment'},
        {file:'11-exterior-shop-building.jpg',alt:'Practical detached shop building with two overhead doors in a wooded setting.',caption:'Representative business environment'}
      ],'beforeend');
    }
    if(page==='products'&&document.querySelector('#plans .container')){
      addRepresentativeGroup(document.querySelector('#plans .container'),[
        {file:'10-project-planning-documents.jpg',alt:'Project planning documents, measurements, calculator, and notes arranged on a desk.',caption:'Project planning and decision packets'}
      ],'beforeend');
    }
  }
  function run(){loadPublicVisualCleanup();ensureHeader();ensureFooter();routeLegacyOwnerLinks();placeApprovedImages();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();
