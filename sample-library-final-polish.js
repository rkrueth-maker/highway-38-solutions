(function(){
  'use strict';
  function syncBundleDetails(){
    document.querySelectorAll('[data-bundles] .bundle-details').forEach(function(details){
      const summary=details.querySelector('summary');
      if(!summary)return;
      summary.setAttribute('aria-expanded',String(details.open));
      details.addEventListener('toggle',function(){
        summary.setAttribute('aria-expanded',String(details.open));
        if(details.open){
          const card=details.closest('.bundle-card');
          window.setTimeout(function(){card&&card.scrollIntoView({block:'nearest',behavior:'smooth'});},80);
        }
      });
    });
  }
  function improveToc(){
    document.querySelectorAll('.toc a').forEach(function(link){
      link.addEventListener('click',function(){link.blur();});
    });
  }
  function announceBundleCount(){
    const host=document.querySelector('[data-bundles]');
    const heading=host&&host.closest('.section')&&host.closest('.section').querySelector('.section-head');
    if(!host||!heading||heading.querySelector('.bundle-count-note'))return;
    const note=document.createElement('p');
    note.className='bundle-count-note';
    note.textContent=host.querySelectorAll('.bundle-card').length+' approved bundles. Open one card at a time for complete scope, payment, and upgrade details.';
    heading.appendChild(note);
  }
  function run(){
    let attempts=0;
    const timer=setInterval(function(){
      attempts+=1;
      if(document.querySelector('[data-bundles] .bundle-details')||attempts>80){
        clearInterval(timer);syncBundleDetails();improveToc();announceBundleCount();
      }
    },50);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();
