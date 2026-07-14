(function(){
  'use strict';
  const C=window.H38_CATALOG;
  if(!C)return;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);

  function enhanceProducts(){
    const cards=[...document.querySelectorAll('.product-card')];
    cards.forEach((card,i)=>{
      const p=C.products[i]; if(!p||card.querySelector('.issue83-best-for'))return;
      const best=document.createElement('p');
      best.className='issue83-best-for';
      best.innerHTML='<strong>Best for:</strong> '+esc(p.ideal||p.bestFit?.[0]||p.summary);
      const price=card.querySelector('.price');
      (price||card.querySelector('h3')).insertAdjacentElement('afterend',best);
      const sample=document.createElement('a');
      sample.className='issue83-sample-link';
      sample.href='sample-library-now.html#sample-'+encodeURIComponent(p.slug);
      sample.textContent='View sample';
      card.querySelector('.button-row')?.prepend(sample);
    });

    const host=document.querySelector('[data-pricing-table]');
    if(host){
      host.innerHTML='<div class="table-wrap"><table class="catalog-table"><thead><tr><th>Product</th><th>Best for</th><th>Price</th><th>Turnaround</th><th>Main deliverable</th><th>Next step</th></tr></thead><tbody>'+C.products.map(p=>'<tr><td><a href="products.html#'+esc(p.slug)+'"><strong>'+esc(p.name)+'</strong></a><br><small>'+esc(p.id)+'</small></td><td>'+esc(p.ideal||p.bestFit?.[0]||p.summary)+'</td><td>'+money(p.price)+'</td><td>'+esc(p.turnaround)+'</td><td>'+esc(p.deliverables?.[0]||p.outcome)+'</td><td><a href="sample-library-now.html#sample-'+esc(p.slug)+'">View sample</a><br><a href="start-request.html?product='+encodeURIComponent(p.id)+'">Start request</a></td></tr>').join('')+'</tbody></table></div>';
    }

    [...document.querySelectorAll('.bundle-card')].forEach((card,i)=>{
      const b=C.bundles[i]; if(!b||card.querySelector('.issue83-bundle-fit'))return;
      const included=(b.products||[]).map(id=>C.products.find(p=>p.id===id)).filter(Boolean);
      const componentTotal=included.reduce((sum,p)=>sum+Number(p.price||0),0);
      const savings=componentTotal>Number(b.price||0)?componentTotal-Number(b.price||0):0;
      const fit=document.createElement('div');
      fit.className='issue83-bundle-fit';
      fit.innerHTML='<p><strong>Ideal for:</strong> '+esc(b.ideal||b.outcome)+'</p><p><strong>Recommended entry point:</strong> '+esc(included[0]?.name||'Owner review')+'</p>'+(savings?'<p><strong>Verified catalog savings:</strong> '+money(savings)+'</p>':'')+'<p><strong>Upgrade path:</strong> '+esc(b.upgrade||included.at(-1)?.upgrade||'Confirmed during owner review')+'</p>';
      card.querySelector('.button-row')?.before(fit);
    });
  }

  function enhanceSamples(){
    const host=document.querySelector('[data-samples="all"]');
    if(!host)return;
    const groups=[
      ['Understand a Problem',p=>p.id==='H38-P001'],
      ['Plan a Space or Project',p=>p.family==='plans'&&p.id!=='H38-P001'],
      ['Improve a Shop or Business',p=>/shop|business|cleanup|workflow/i.test(p.name+' '+p.summary)],
      ['Build a Digital Workflow',p=>p.family==='implementation'],
      ['Evaluate Manufacturing or Automation',p=>p.family==='manufacturing']
    ];
    const cards=[...host.querySelectorAll('.sample-card')];
    groups.forEach(([title,test])=>{
      const matching=C.products.map((p,i)=>test(p)?cards[i]:null).filter(Boolean);
      if(!matching.length)return;
      const section=document.createElement('section');
      section.className='issue83-sample-group';
      section.innerHTML='<div class="section-head"><span class="badge">Find by outcome</span><h2>'+esc(title)+'</h2></div>';
      matching.forEach(card=>{
        const p=C.products[cards.indexOf(card)];
        if(p&&!card.querySelector('.issue83-sample-summary')){
          const box=document.createElement('div');
          box.className='issue83-sample-summary';
          box.innerHTML='<p><strong>Customer sends:</strong> '+esc(p.sample?.input||p.inputs?.[0]||'Photos, notes, measurements, or process details')+'</p><p><strong>Customer receives:</strong> '+esc(p.sample?.finished||p.deliverables?.[0]||p.outcome)+'</p><p><strong>Use this to:</strong> '+esc(p.outcome)+'</p><p><strong>Related next step:</strong> <a href="start-request.html?product='+encodeURIComponent(p.id)+'">Request '+esc(p.name)+'</a></p>';
          card.querySelector('.sample-visual')?.insertAdjacentElement('afterend',box);
        }
        section.appendChild(card);
      });
      host.appendChild(section);
    });
  }

  window.addEventListener('DOMContentLoaded',()=>{setTimeout(()=>{enhanceProducts();enhanceSamples();},0)});
})();