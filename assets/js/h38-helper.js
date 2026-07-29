(()=>{
  'use strict';
  if(window.H38_PUBLIC_HELPER&&window.H38_PUBLIC_HELPER.mounted)return;

  const VERSION='2026-07-29-public-helper-v1';
  const PAGE=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  const qs=(selector,root=document)=>root.querySelector(selector);
  const qsa=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const normalize=value=>(value||'').toLowerCase().replace(/[^a-z0-9$\s-]/g,' ').replace(/\s+/g,' ').trim();

  const links={
    software:['Compare business software','software.html'],
    projects:['Explore project services','project-services.html'],
    pricing:['See pricing','pricing.html'],
    demo:['Try the quote demo','quote-builder-demo.html'],
    examples:['View complete examples','quote-builder.html#examples'],
    implementation:['See implementation','implementation.html'],
    security:['Review security and controls','security-reliability.html'],
    request:['Start a request','start-request.html'],
    contact:['Contact Highway 38','contact.html']
  };

  const answers={
    welcome:{
      text:'I can help you choose a Highway 38 product, understand pricing and implementation, find a project example, or prepare the right request.',
      actions:[links.software,links.projects,links.pricing,links.request]
    },
    product:{
      text:'Choose Quote Builder when professional quoting is the main need. Choose Business Office when customers, jobs, documents, money, users, approvals, and daily work need to stay connected. Choose a Custom Business System for specialized workflows, integrations, departments, or advanced field tools.',
      actions:[links.software,links.pricing,links.demo,links.request]
    },
    quoteBuilder:{
      text:'Quote Builder is $59 per month. Self-setup is included, and assisted setup is $499 one time. It is designed for professional quotes, customer records, attachments, price-book controls, approvals, and customer-ready PDFs. H38 AI is included.',
      actions:[links.demo,links.examples,links.pricing,links.request]
    },
    office:{
      text:'Highway 38 Business Office is $249 per month with a $2,500 implementation. It connects Today, Customers, Work, Money, Documents, Growth, and Office with users, approvals, proof, error records, and backups.',
      actions:[['Explore Business Office','business-systems.html'],links.implementation,links.pricing,links.request]
    },
    custom:{
      text:'A Custom Business System starts at $499 per month with implementation starting at $7,500. It is for advanced workflows, migrations, integrations, specialized forms, dashboards, permissions, field tools, or custom AI requirements.',
      actions:[links.software,links.implementation,links.request]
    },
    snapshot:{
      text:'Business Snapshot is a separate $299 one-time review for clarifying workflow problems, priorities, risks, and the best next system. It is not a software subscription. The full fee may be credited toward an eligible implementation purchased within 30 days.',
      actions:[links.pricing,links.request]
    },
    website:{
      text:'The Smart Contact Website is a separate service priced at $1,995 setup plus $99 per month. It provides a professional contact website, approved-information helper, and organized lead capture without becoming a fourth software product.',
      actions:[links.pricing,links.request]
    },
    ai:{
      text:'H38 AI is built into the product structure rather than sold as a separate premium. It can organize information, draft scopes and wording, identify gaps, compare options, and recommend next steps. People remain responsible for final approval and controlled external actions.',
      actions:[links.software,links.security,links.request]
    },
    project:{
      text:'Highway 38 project services can organize photos, measurements, notes, goals, and constraints for construction, property, manufacturing, CNC, automation, layouts, quoting, workflow, materials, drawings, sequencing, and implementation planning.',
      actions:[links.projects,links.examples,links.request]
    },
    construction:{
      text:'For construction and property work, Highway 38 can help structure the existing conditions, measurements, scope, options, assumptions, quantities, drawings, quote basis, ordered work, checkpoints, and closeout requirements.',
      actions:[links.projects,links.examples,links.request]
    },
    manufacturing:{
      text:'For manufacturing and CNC work, Highway 38 can help with process planning, fixtures, workholding, machine and tooling requirements, setup, operations, inspections, labor, materials, quoting, and implementation sequencing.',
      actions:[['See manufacturing and CNC','manufacturing-cnc.html'],links.projects,links.request]
    },
    automation:{
      text:'For automation and robotics, Highway 38 can help organize the process, equipment, sensors, safety, controls, handling, interfaces, risks, expected output, implementation phases, and quote basis.',
      actions:[['See automation and robotics','robotics-automation.html'],links.projects,links.request]
    },
    pricing:{
      text:'Current software pricing is Quote Builder at $59 per month, Business Office at $249 per month, and Custom Business System starting at $499 per month. Business Snapshot is $299 one time. H38 AI is included in the product structure.',
      actions:[links.pricing,links.implementation,links.request]
    },
    implementation:{
      text:'Implementation includes discovery and preservation, configuration and approved migration, verification and training, then controlled launch and handoff. Setup fees pay for a working configuration—not just account activation.',
      actions:[links.implementation,links.security,links.request]
    },
    security:{
      text:'Highway 38 documents identity and role access, business and customer isolation, owner-controlled external actions, proof and error records, backups, rollback evidence, and live verification. This helper cannot access private Business Office data or perform actions.',
      actions:[links.security,links.implementation]
    },
    examples:{
      text:'The public examples include complete project walkthroughs, detailed quotes, coordinated drawings, printable packages, and a browser-only quote demo. They are representative demonstrations, not customer authorizations or construction documents.',
      actions:[links.examples,links.demo]
    },
    request:{
      text:'Start with the real problem. Share only non-sensitive project or business details through the request page. Nothing is activated or charged from the request form; Highway 38 confirms scope, pricing, access, implementation, and approval boundaries first.',
      actions:[links.request,links.contact]
    },
    customerPortal:{
      text:'Customer portal needs should be confirmed during scoping because access, approvals, documents, payments, messaging, and project visibility depend on the selected product and approved integrations. The public helper does not open or read customer records.',
      actions:[links.software,links.request]
    },
    payments:{
      text:'Payments, accounting connections, SMS, scheduling, and other external integrations are confirmed during implementation. The helper does not promise an integration, move money, send messages, or create commitments.',
      actions:[links.implementation,links.request]
    },
    fallback:{
      text:'I can answer questions about Highway 38 products, pricing, project services, examples, implementation, security, and starting a request. For a business-specific or project-specific answer, use the request page so Highway 38 can review the actual details.',
      actions:[links.software,links.projects,links.request]
    }
  };

  const intents=[
    ['website',/(website|web site|contact site|smart contact)/],
    ['snapshot',/(business snapshot|snapshot|review my business|diagnostic)/],
    ['customerPortal',/(customer portal|client portal|homeowner portal)/],
    ['payments',/(payment|quickbooks|accounting|stripe|square|sms|text message|calendar|schedule integration|integration)/],
    ['quoteBuilder',/(quote builder|estimate|estimating|proposal|professional quote|quoting app)/],
    ['office',/(business office|run my business|customers and jobs|daily operations|operations software|field service)/],
    ['custom',/(custom business|custom system|custom workflow|integration|multi department|specialized system)/],
    ['construction',/(construction|remodel|garage|house|yard|landscape|property|deck|kitchen|concrete)/],
    ['manufacturing',/(manufacturing|cnc|machining|fixture|workholding|tooling|machine shop)/],
    ['automation',/(automation|robot|robotics|conveyor|vision system|sensor|controls)/],
    ['implementation',/(implementation|onboarding|setup fee|assisted setup|migration|training|launch)/],
    ['security',/(security|privacy|backup|rollback|permission|role|access|safe|control)/],
    ['examples',/(example|demo|sample|drawing|cad|proof|walkthrough)/],
    ['pricing',/(price|pricing|cost|monthly|subscription|how much|\$59|\$249|\$499)/],
    ['ai',/(h38 ai|ai helper|artificial intelligence|ai included|ai cost)/],
    ['project',/(project service|help with a project|plan my project|project planning)/],
    ['request',/(start|contact|request|talk to|how do i begin|ready)/],
    ['product',/(which product|what product|which software|what should i choose|best fit|recommend)/]
  ];

  const pagePrompt={
    'software.html':'Ask which software level fits your business.',
    'project-services.html':'Ask what Highway 38 can produce for your project.',
    'pricing.html':'Ask about pricing, setup, or implementation.',
    'quote-builder.html':'Ask about Quote Builder or the public examples.',
    'quote-builder-demo.html':'Ask what the demo does—and what it does not do.',
    'implementation.html':'Ask what setup and implementation include.',
    'security-reliability.html':'Ask about controls, access, backups, or rollback.',
    'start-request.html':'Ask what information to include in your request.'
  };

  const quickStarts=[
    ['Which product fits my business?','product'],
    ['What does implementation include?','implementation'],
    ['Can Highway 38 help with my project?','project'],
    ['Show me the closest example.','examples']
  ];

  function resolveIntent(message){
    const value=normalize(message);
    if(!value)return 'fallback';
    for(const [name,pattern] of intents){if(pattern.test(value))return name;}
    return 'fallback';
  }

  function create(tag,className,text){
    const element=document.createElement(tag);
    if(className)element.className=className;
    if(text!==undefined)element.textContent=text;
    return element;
  }

  function addActions(container,actions){
    if(!actions||!actions.length)return;
    const row=create('div','h38-helper-actions');
    actions.forEach(([label,href])=>{
      const link=create('a','h38-helper-action',label);
      link.href=href;
      row.appendChild(link);
    });
    container.appendChild(row);
  }

  function addMessage(log,role,text,actions){
    const item=create('div',`h38-helper-message ${role}`);
    const label=create('span','h38-helper-message-label',role==='user'?'You':'Highway 38 Helper');
    const body=create('p','',text);
    item.append(label,body);
    addActions(item,actions);
    log.appendChild(item);
    log.scrollTop=log.scrollHeight;
  }

  function mount(){
    if(qs('[data-h38-helper-root]'))return;

    const root=create('div','h38-helper-root');
    root.dataset.h38HelperRoot='1';
    root.dataset.version=VERSION;

    const launcher=create('button','h38-helper-launcher','Ask the H38 Helper');
    launcher.type='button';
    launcher.setAttribute('aria-expanded','false');
    launcher.setAttribute('aria-controls','h38-helper-panel');

    const panel=create('section','h38-helper-panel');
    panel.id='h38-helper-panel';
    panel.hidden=true;
    panel.setAttribute('aria-label','Highway 38 website helper');

    const head=create('div','h38-helper-head');
    const titleWrap=create('div','');
    const eyebrow=create('span','h38-helper-eyebrow','Guided site assistant');
    const title=create('h2','','Highway 38 Helper');
    title.id='h38-helper-title';
    const close=create('button','h38-helper-close','Close');
    close.type='button';
    close.setAttribute('aria-label','Close Highway 38 Helper');
    titleWrap.append(eyebrow,title);
    head.append(titleWrap,close);

    const boundary=create('p','h38-helper-boundary','Answers use approved Highway 38 website information. Nothing entered here is sent or saved. Do not enter private customer information.');
    const pageNote=create('p','h38-helper-page-note',pagePrompt[PAGE]||'Ask about products, projects, pricing, examples, implementation, or controls.');
    const log=create('div','h38-helper-log');
    log.setAttribute('role','log');
    log.setAttribute('aria-live','polite');

    const quick=create('div','h38-helper-quick');
    quickStarts.forEach(([label,intent])=>{
      const button=create('button','h38-helper-chip',label);
      button.type='button';
      button.dataset.intent=intent;
      quick.appendChild(button);
    });

    const form=create('form','h38-helper-form');
    const label=create('label','h38-helper-input-label','Ask a question');
    label.htmlFor='h38-helper-input';
    const input=create('input','h38-helper-input');
    input.id='h38-helper-input';
    input.name='question';
    input.type='text';
    input.autocomplete='off';
    input.maxLength=240;
    input.placeholder='Example: Which product fits my business?';
    const submit=create('button','h38-helper-send','Ask');
    submit.type='submit';
    form.append(label,input,submit);

    panel.append(head,boundary,pageNote,log,quick,form);
    root.append(launcher,panel);
    document.body.appendChild(root);

    const open=()=>{
      panel.hidden=false;
      launcher.setAttribute('aria-expanded','true');
      root.classList.add('open');
      if(!log.children.length)addMessage(log,'assistant',answers.welcome.text,answers.welcome.actions);
      setTimeout(()=>input.focus(),0);
    };
    const shut=()=>{
      panel.hidden=true;
      launcher.setAttribute('aria-expanded','false');
      root.classList.remove('open');
      launcher.focus();
    };
    const respond=(intent,userText)=>{
      const answer=answers[intent]||answers.fallback;
      if(userText)addMessage(log,'user',userText);
      addMessage(log,'assistant',answer.text,answer.actions);
    };

    launcher.addEventListener('click',()=>panel.hidden?open():shut());
    close.addEventListener('click',shut);
    quick.addEventListener('click',event=>{
      const button=event.target.closest('button[data-intent]');
      if(!button)return;
      respond(button.dataset.intent,button.textContent.trim());
    });
    form.addEventListener('submit',event=>{
      event.preventDefault();
      const value=input.value.trim();
      if(!value)return;
      input.value='';
      respond(resolveIntent(value),value);
    });
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden)shut();});
    qsa('[data-h38-helper-open]').forEach(button=>button.addEventListener('click',event=>{event.preventDefault();open();}));

    window.H38_PUBLIC_HELPER={mounted:true,version:VERSION,open,close:shut,resolveIntent};
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
