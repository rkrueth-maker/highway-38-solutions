(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.BusinessConceptCore=Object.freeze(api);
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION='2.0.0';
  const SCHEMA='BUSINESS-CONCEPT-PACKAGE-2.0';
  const OWNER_REVIEW='OWNER_REVIEW_REQUIRED';
  const EXTERNAL_FLAGS=['customerPortal','customerUploads','hostedPayments','outboundEmail','socialPublishing','advertisingLaunch','websiteDeployment','accountingApiSync','calendarSync'];
  const REQUIRED_INPUT_FIELDS=['businessName','idea','ownerSkills','customers','serviceArea','assetsEquipment','timeAvailable','launchBudget','contactPreference','revenueGoals','businessModels','restrictions','risks','currentSystems','expansionIdeas','primaryProblem','primaryOutcome'];
  const SECRET_PATTERNS=[
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi,
    /\bsk_(?:live|test)_[A-Za-z0-9_-]{8,}\b/g,
    /\bAIza[0-9A-Za-z_-]{20,}\b/g,
    /\bBearer\s+[A-Za-z0-9._-]{12,}\b/gi,
    /\b(?:\d[ -]*?){13,19}\b/g,
    /\b(?:password|passphrase|secret|token|api[_ -]?key)\s*[:=]\s*[^\s,;]+/gi
  ];

  const clone=value=>JSON.parse(JSON.stringify(value));
  const asString=value=>value==null?'':String(value);
  const cleanText=(value,max=8000)=>asString(value).replace(/\u0000/g,'').replace(/\r\n/g,'\n').trim().slice(0,max);
  const splitList=value=>{
    const source=Array.isArray(value)?value:asString(value).split(/\n|,/);
    return Array.from(new Set(source.map(item=>cleanText(item,500)).filter(Boolean)));
  };
  const slugify=value=>cleanText(value,120).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48)||'business';
  const idPrefix=value=>slugify(value).replace(/-/g,'').toUpperCase().slice(0,8)||'BUSINESS';
  const round25=value=>Math.max(0,Math.round(Number(value||0)/25)*25);
  const stableStringify=value=>{
    if(Array.isArray(value))return '['+value.map(stableStringify).join(',')+']';
    if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stableStringify(value[key])).join(',')+'}';
    return JSON.stringify(value);
  };
  function digest(value){
    const text=stableStringify(value);
    let h1=0x811c9dc5,h2=0x9e3779b9;
    for(let i=0;i<text.length;i++){
      const code=text.charCodeAt(i);
      h1^=code;h1=Math.imul(h1,0x01000193)>>>0;
      h2^=code+((h2<<6)>>>0)+(h2>>>2);h2>>>=0;
    }
    return h1.toString(16).padStart(8,'0')+h2.toString(16).padStart(8,'0');
  }
  function parseAmount(value){
    if(typeof value==='number'&&Number.isFinite(value))return Math.max(0,value);
    const matches=asString(value).replace(/,/g,'').match(/-?\d+(?:\.\d+)?/g);
    if(!matches||!matches.length)return 0;
    const numbers=matches.map(Number).filter(Number.isFinite).map(number=>Math.max(0,number));
    return numbers.length?numbers.reduce((sum,number)=>sum+number,0)/numbers.length:0;
  }
  function redactText(value){
    let text=cleanText(value);
    let redactions=0;
    for(const pattern of SECRET_PATTERNS){
      text=text.replace(pattern,match=>{redactions+=1;return `[REDACTED-SENSITIVE-${digest(match).slice(0,8)}]`;});
    }
    return {text,redactions};
  }
  function normalizeModels(value){
    const raw=splitList(value).map(item=>item.toLowerCase());
    const recognized=[];
    for(const model of ['physical','digital','local','online'])if(raw.some(item=>item.includes(model)))recognized.push(model);
    return recognized.length?recognized:['local'];
  }
  function field(input,names){
    for(const name of names)if(Object.prototype.hasOwnProperty.call(input,name)&&input[name]!=null)return input[name];
    return '';
  }
  function normalizeInput(rawInput){
    const input=rawInput&&typeof rawInput==='object'&&!Array.isArray(rawInput)?rawInput:{};
    const textFields={
      businessName:field(input,['businessName','name']),
      idea:field(input,['idea','businessIdea']),
      serviceArea:field(input,['serviceArea','location']),
      timeAvailable:field(input,['timeAvailable','time','hoursPerWeek']),
      launchBudget:field(input,['launchBudget','budget']),
      contactPreference:field(input,['contactPreference','contact']),
      revenueGoals:field(input,['revenueGoals','revenueGoal']),
      primaryProblem:field(input,['primaryProblem','problem']),
      primaryOutcome:field(input,['primaryOutcome','outcome']),
      restrictions:field(input,['restrictions']),
      risks:field(input,['risks']),
      currentSystems:field(input,['currentSystems','existing','filesAccountsWebsites']),
      expansionIdeas:field(input,['expansionIdeas','expansion'])
    };
    const normalized={};
    let redactions=0;
    for(const [key,value] of Object.entries(textFields)){
      const result=redactText(value);normalized[key]=result.text;redactions+=result.redactions;
    }
    const listFields={
      ownerSkills:field(input,['ownerSkills','skills']),
      customers:field(input,['customers','customerGroups']),
      assetsEquipment:field(input,['assetsEquipment','assets']),
      restrictionsList:field(input,['restrictions']),
      riskList:field(input,['risks']),
      currentSystemList:field(input,['currentSystems','existing','filesAccountsWebsites']),
      expansionList:field(input,['expansionIdeas','expansion'])
    };
    for(const [key,value] of Object.entries(listFields)){
      normalized[key]=splitList(value).map(item=>{const result=redactText(item);redactions+=result.redactions;return result.text;}).filter(Boolean);
    }
    normalized.businessModels=normalizeModels(field(input,['businessModels','model']));
    normalized.hoursPerWeek=parseAmount(field(input,['hoursPerWeek','timeAvailable','time']))||10;
    normalized.launchBudgetAmount=parseAmount(field(input,['launchBudget','budget']));
    normalized.monthlyRevenueGoal=parseAmount(field(input,['monthlyRevenueGoal','revenueGoals','revenueGoal']));
    normalized.confirmedFacts=splitList(field(input,['confirmedFacts','confirmed']));
    normalized.redactionsApplied=redactions;
    normalized.missingInputFields=REQUIRED_INPUT_FIELDS.filter(name=>{
      if(name==='ownerSkills')return !normalized.ownerSkills.length;
      if(name==='customers')return !normalized.customers.length;
      if(name==='assetsEquipment')return !normalized.assetsEquipment.length;
      if(name==='businessModels')return !normalized.businessModels.length;
      return !cleanText(normalized[name]);
    });
    return normalized;
  }
  function validateInput(input){
    const errors=[];
    if(!input.businessName||input.businessName.length<2)errors.push('Working business name must contain at least two characters.');
    if(!input.idea||input.idea.length<12)errors.push('Business idea must contain at least twelve characters.');
    if(!input.ownerSkills.length)errors.push('At least one owner skill is required.');
    if(!input.customers.length)errors.push('At least one customer group is required.');
    if(!input.primaryProblem)errors.push('Primary customer problem is required.');
    if(!input.primaryOutcome)errors.push('Primary finished outcome is required.');
    if(input.hoursPerWeek<=0||input.hoursPerWeek>168)errors.push('Time available must be greater than zero and no more than 168 hours per week.');
    if(input.businessModels.some(model=>!['physical','digital','local','online'].includes(model)))errors.push('Business model contains an unsupported value.');
    return errors;
  }
  function pricingModel(input){
    const usableMonthlyHours=Math.max(1,input.hoursPerWeek*4.33*.65);
    const targetPerHour=input.monthlyRevenueGoal>0?input.monthlyRevenueGoal/usableMonthlyHours:100;
    const planningRate=Math.max(50,Math.min(500,round25(targetPerHour)));
    const starter=[round25(planningRate*1.5),round25(planningRate*3)];
    const core=[round25(planningRate*6),round25(planningRate*12)];
    const premium=[round25(planningRate*15),round25(planningRate*30)];
    const recurring=[round25(planningRate*2),round25(planningRate*5)];
    return {
      status:OWNER_REVIEW,
      method:'Capacity, revenue-goal, value, and bounded-scope planning model',
      assumptions:{hoursPerWeek:input.hoursPerWeek,usableMonthlyHours:Math.round(usableMonthlyHours*10)/10,monthlyRevenueGoal:input.monthlyRevenueGoal||null,planningRevenuePerAvailableHour:planningRate},
      ranges:{starter,core,premium,recurringMonthly:recurring},
      rules:[
        'Price one defined finished outcome, not unlimited time.',
        'State required inputs, deliverables, exclusions, turnaround, revision allowance, payment timing, and professional boundaries.',
        'Confirm capacity before offering rush work.',
        'Do not publish a price, request payment, or charge without owner approval.',
        'Treat these ranges as planning drafts, not market validation or price approval.'
      ]
    };
  }
  function buildSegments(input){
    return input.customers.map((name,index)=>({
      id:`SEG-${String(index+1).padStart(2,'0')}`,
      name,
      primaryProblem:input.primaryProblem,
      desiredOutcome:input.primaryOutcome,
      qualificationQuestions:['Is the problem active now?','Who approves the work?','What budget and timing range exists?','What inputs and proof are available?','What restrictions or regulated work apply?'],
      evidenceNeeded:['Five real conversations or equivalent documented demand evidence','One public-safe proof item or transparent demonstration','Common objection and buying-risk notes'],
      status:OWNER_REVIEW
    }));
  }
  function buildOffers(input,pricing){
    const name=input.businessName;
    const problem=input.primaryProblem;
    const outcome=input.primaryOutcome;
    return [
      {id:'OFFER-FREE',level:'Free',name:`${problem} readiness checklist`,purpose:'Help a prospect identify missing information and choose a useful next step.',priceRange:[0,0],payment:'No payment.',turnaround:'Immediate browser or downloadable result.',revision:'Not applicable.',boundary:'Planning aid only; no regulated advice, commitment, or customer-specific execution.',status:OWNER_REVIEW},
      {id:'OFFER-STARTER',level:'Starter',name:`${problem} snapshot`,purpose:'Turn one bounded problem into facts, gaps, risks, and prioritized next actions.',priceRange:pricing.ranges.starter,payment:'Owner-approved payment terms before work begins.',turnaround:'Draft target: 3–5 business days after complete inputs.',revision:'One factual correction or clarification pass.',boundary:'No implementation, unlimited consultation, licensed work, or unreviewed external action.',status:OWNER_REVIEW},
      {id:'OFFER-CORE',level:'Core',name:outcome,purpose:'Deliver the primary finished outcome using fixed inputs, scope, and acceptance criteria.',priceRange:pricing.ranges.core,payment:'Owner-approved deposit or full payment rule before work begins.',turnaround:'Draft target: 5–10 business days after complete inputs.',revision:'One bounded revision within the approved goal and inputs.',boundary:'Scope expansion, field verification, licensed work, and third-party fees require separate approval.',status:OWNER_REVIEW},
      {id:'OFFER-PREMIUM',level:'Premium',name:`${outcome} implementation package`,purpose:'Combine the core result with bounded implementation support, handoff, testing, or vendor-ready documentation.',priceRange:pricing.ranges.premium,payment:'Owner-approved milestone or deposit terms.',turnaround:'Draft target: 10–20 business days after complete inputs and access approval.',revision:'One bounded revision plus one implementation check-in.',boundary:'No open-ended project management, safety certification, engineering signoff, legal advice, or automatic provider action.',status:OWNER_REVIEW},
      {id:'OFFER-CARE',level:'Recurring',name:`${name} Care`,purpose:'Provide bounded updates, reviews, maintenance, or support after the initial outcome.',priceRange:pricing.ranges.recurringMonthly,payment:'Recurring billing remains disabled until provider, contract, cancellation, and owner-approval controls pass.',turnaround:'Acknowledgment target: 1–2 business days.',revision:'Defined by included monthly request limits.',boundary:'No rollover unless stated, no unlimited support, and no new projects inside maintenance.',status:OWNER_REVIEW}
    ];
  }
  function buildProducts(input,offers){
    const prefix=idPrefix(input.businessName);
    return offers.map((offer,index)=>({
      id:`${prefix}-P${String(index+1).padStart(3,'0')}`,
      sourceOfferId:offer.id,
      name:offer.name,
      level:offer.level,
      summary:offer.purpose,
      priceRange:offer.priceRange,
      currency:'USD',
      paymentRule:offer.payment,
      turnaround:offer.turnaround,
      revisionRule:offer.revision,
      inputs:['Approved goal and scope','Required files, measurements, examples, or access','Known constraints and must-keep items','Owner-approved communication and delivery path'],
      deliverables:index===0?['Public-safe checklist or scorecard','Clear next-step path']:['Defined finished output','Assumptions and missing-information list','Quality review checklist','Owner-review handoff'],
      exclusions:[offer.boundary,'Unapproved customer-facing communication','Unapproved payment request or processing','Automatic legal, safety, engineering, tax, or compliance claims'],
      status:'DRAFT',
      ownerApprovalRequired:true,
      externalActionsEnabled:false
    }));
  }
  function buildAddOns(input,pricing){
    const base=Math.max(25,round25(pricing.assumptions.planningRevenuePerAvailableHour));
    return [
      {id:'ADD-001',name:'Additional area, workflow, customer segment, or output',priceRange:[base,base*2],rule:'Must remain bounded and use the same approved goal.'},
      {id:'ADD-002',name:'Additional option or comparison',priceRange:[base,base*3],rule:'Uses verified inputs and does not create an unapproved merged third option.'},
      {id:'ADD-003',name:'Editable source or additional format',priceRange:[round25(base*.5),base],rule:'Only when licensing and privacy permit.'},
      {id:'ADD-004',name:'Additional revision',priceRange:[base,base*2],rule:'Must remain within original scope and inputs.'},
      {id:'ADD-005',name:'Implementation check-in',priceRange:[base,base*2],rule:'One scheduled bounded review with action notes.'},
      {id:'ADD-006',name:'Rush priority',priceRule:'25–40% of approved base price',rule:'Only after capacity, complete inputs, and owner approval are confirmed.'}
    ].map(item=>({...item,status:OWNER_REVIEW,externalActionsEnabled:false}));
  }
  function buildContracts(input,pricing){
    return [
      {id:'CONTRACT-001',name:`${input.businessName} Care`,cadence:'monthly',priceRange:pricing.ranges.recurringMonthly,included:'Two bounded update, review, or support requests per month.',response:'Acknowledgment target within two business days.',rollover:'No rollover unless approved in writing.',exclusions:'New projects, unlimited communication, third-party fees, regulated advice, and unreviewed external actions.',cancellation:'Cancel before the next approved billing date; no automatic charge is enabled.',status:OWNER_REVIEW},
      {id:'CONTRACT-002',name:`${input.businessName} Priority Care`,cadence:'monthly',priceRange:[round25(pricing.ranges.recurringMonthly[0]*1.8),round25(pricing.ranges.recurringMonthly[1]*2)],included:'Four bounded requests plus one monthly planning review.',response:'Acknowledgment target within one business day.',rollover:'One unused request may roll one month only if approved.',exclusions:'New implementation projects, emergency service guarantees, and unlimited availability.',cancellation:'Written cancellation terms require owner approval before provider activation.',status:OWNER_REVIEW}
    ];
  }
  function buildSitemap(input){
    const pages=['Home','Services','Pricing','Free Tool','Proof','About','Resources','Start Request','Customer Portal'];
    if(input.businessModels.includes('local'))pages.splice(5,0,'Service Area');
    if(input.businessModels.includes('online'))pages.splice(5,0,'Online Delivery');
    if(input.businessModels.includes('digital'))pages.splice(5,0,'Downloads and Tools');
    if(input.businessModels.includes('physical'))pages.splice(5,0,'Products or Equipment');
    return Array.from(new Set(pages));
  }
  function buildPageOutlines(input,sitemap){
    const outlines={
      Home:['Result-focused hero','Customer/problem path selector','How the process works','Proof with classification','Free lead magnet','Offer ladder','Boundaries and trust','Start-request action'],
      Services:['Service families','Starter/core/premium comparison','Inputs and deliverables','Price logic and payment rules','Add-ons','Care plans','Professional boundaries','Help-me-choose path'],
      Pricing:['Planning price ranges','What changes price','Payment timing','Revision allowances','Exclusions','No automatic checkout notice'],
      'Free Tool':['Plain-language problem','Inputs and assumptions','Formula or checklist','Download','Disclaimer','Related paid path'],
      Proof:['Classification labels','Evidence status','Privacy status','Public-safe summary','Boundary','Related offer'],
      About:['Owner skills relevant to the offer','Operating principles','Communication preference','Professional boundaries'],
      Resources:['Guides','Checklists','Downloads','Future products clearly marked','No fake checkout'],
      'Start Request':['Desired finished outcome','Current problem','Customer or affected group','Inputs available','Constraints','Timing','Budget','Privacy acknowledgement','Owner-review notice'],
      'Customer Portal':['Authentication required','Customer-own records only','Approved files and status','No other-customer visibility']
    };
    if(sitemap.includes('Service Area'))outlines['Service Area']=['Approved geographic scope','Travel or remote-delivery rules','Response expectations','Local proof without private addresses'];
    if(sitemap.includes('Online Delivery'))outlines['Online Delivery']=['Digital process','Accepted inputs','File-transfer boundaries','Time-zone and communication expectations'];
    if(sitemap.includes('Downloads and Tools'))outlines['Downloads and Tools']=['Free tools','Version and assumptions','Download instructions','Future paid items without checkout'];
    if(sitemap.includes('Products or Equipment'))outlines['Products or Equipment']=['Physical offer categories','Availability and lead-time rules','Shipping or pickup boundaries','Safety and fit disclaimers','No unverified inventory claim'];
    return outlines;
  }
  function buildIntake(input){
    const questions=[
      'What finished result do you want?',
      'What is happening now, and what is the cost or consequence?',
      'Who will use, approve, or be affected by the result?',
      'Which customer segment or location is involved?',
      'What files, photos, measurements, examples, accounts, or websites already exist?',
      'What assets, equipment, software, or access are available?',
      'What must not change?',
      'What time, budget, contact, privacy, travel, or health limits apply?',
      'What date matters, and what happens if it is missed?',
      'What proof, acceptance criteria, or decision must the final result support?',
      'What licensed, insured, legal, tax, safety, engineering, or permit work may be required?',
      'Who may receive customer-facing communication, payment requests, files, or final delivery?'
    ];
    if(input.businessModels.includes('physical'))questions.push('What quantity, dimensions, materials, shipping, pickup, storage, fit, and safety information is required?');
    if(input.businessModels.includes('digital')||input.businessModels.includes('online'))questions.push('What file formats, software versions, account access, privacy, licensing, and delivery restrictions apply?');
    if(input.businessModels.includes('local'))questions.push('What service-area, travel, site-access, weather, or scheduling constraints apply?');
    return questions;
  }
  function buildSops(input){
    const names=['Lead intake and privacy','Fit and restriction review','Missing-information request','Scope and quote preparation','Owner quote approval','Payment and start authorization','Production setup','Quality assurance','Owner final approval','Customer delivery','Revision control','Follow-up and testimonial permission','Expense recording','Profitability review','Proof classification and privacy','Provider credential and activation control','Backup and recovery','Incident, error, and uncertain-result handling','Contract renewal and cancellation','Website and social change control'];
    return names.map((name,index)=>({id:`SOP-${String(index+1).padStart(3,'0')}`,name,status:'DRAFT_OWNER_REVIEW',selectedRecordOnly:true,externalActionsEnabled:false}));
  }
  function buildSocial(input,segments){
    const primary=segments[0]?.name||'the first customer segment';
    const themes=[
      ['Problem clarity',`Three signs ${primary} may be solving the wrong part of ${input.primaryProblem}.`],
      ['Process transparency',`What happens between a rough request and an approved ${input.primaryOutcome}.`],
      ['Tool demonstration',`A simple checklist for deciding whether ${input.primaryProblem} is ready for action.`],
      ['Proof and boundaries',`What this business can document—and what remains outside scope.`],
      ['Offer explanation',`Starter snapshot versus complete ${input.primaryOutcome}: how to choose the smallest useful result.`],
      ['Owner-controlled workflow',`Why quotes, payment requests, publishing, and final delivery require owner review.`]
    ];
    return themes.map((item,index)=>({
      id:`SOCIAL-${String(index+1).padStart(3,'0')}`,
      theme:item[0],
      draft:`${item[1]} Draft content should explain one useful idea, state the boundary, and direct the reader to the approved free tool or request guide.`,
      channel:'channel-neutral',
      callToAction:index===2?'Use the free readiness checklist.':'Review the approved service path.',
      status:'DRAFT_OWNER_REVIEW',
      publishAt:null,
      externalActionsEnabled:false
    }));
  }
  function buildExpenses(input){
    const categories=['Software','Website and hosting','Insurance','Legal and licensing','Accounting and tax support','Payment fees','Advertising','Materials','Supplies','Equipment','Contractors','Phone and internet','Training','Travel and mileage','Shipping and packaging','Contingency'];
    const budget=input.launchBudgetAmount;
    const weights={Software:.1,'Website and hosting':.08,Insurance:.08,'Legal and licensing':.08,'Accounting and tax support':.06,'Payment fees':.03,Advertising:.12,Materials:.08,Supplies:.04,Equipment:.12,Contractors:.05,'Phone and internet':.03,Training:.04,'Travel and mileage':.03,'Shipping and packaging':.03,Contingency:.05};
    return categories.map((name,index)=>({id:`EXP-${String(index+1).padStart(3,'0')}`,name,planningAllocation:budget?round25(budget*(weights[name]||0)):null,status:'PLANNING_ONLY_OWNER_REVIEW'}));
  }
  function buildRisks(input){
    const risks=[
      ['RISK-001','Business name or public claims are not legally cleared','HIGH','Confirm name use, entity, insurance, licenses, tax, and local requirements with qualified sources before launch.'],
      ['RISK-002','Customer demand and willingness to pay are not validated','HIGH','Document real conversations, objections, alternatives, urgency, and buying authority.'],
      ['RISK-003','Scope, price, revision, payment, and acceptance rules may be incomplete','HIGH','Approve one bounded starter and core offer before customer-facing use.'],
      ['RISK-004','Owner time or health limits may reduce capacity','HIGH','Set weekly capacity, response targets, waitlist rules, and a pause process.'],
      ['RISK-005','Private or proprietary information could enter public proof or tools','HIGH','Use explicit privacy classification, customer-own separation, redaction, and owner approval.'],
      ['RISK-006','Provider credentials or uncertain results could cause duplicate external actions','HIGH','Keep providers locked; require selected-record execution, duplicate locks, proof/error logs, and no automatic retry.'],
      ['RISK-007','Revenue goals may not match available hours or offer economics','MEDIUM','Review capacity, gross margin, acquisition cost, delivery time, and recurring support load monthly.']
    ];
    if(input.businessModels.includes('physical'))risks.push(['RISK-008','Physical products or equipment create inventory, shipping, fit, warranty, and safety exposure','HIGH','Do not claim availability, fit, compliance, or safety without verified product and fulfillment controls.']);
    if(input.businessModels.includes('digital')||input.businessModels.includes('online'))risks.push(['RISK-009','Digital delivery creates access, privacy, licensing, refund, and support exposure','HIGH','Define file formats, access periods, privacy, licensing, support, and controlled delivery before charging.']);
    if(input.businessModels.includes('local'))risks.push(['RISK-010','Local service creates travel, site access, weather, scheduling, and field-verification exposure','MEDIUM','Set approved service area, travel charges, access requirements, cancellation rules, and field-verification boundaries.']);
    input.riskList.forEach((risk,index)=>risks.push([`RISK-USER-${String(index+1).padStart(2,'0')}`,risk,'OWNER_ASSESSMENT','Define likelihood, impact, prevention, detection, response, and owner decision.']));
    return risks.map(([id,title,severity,mitigation])=>({id,title,severity,mitigation,status:OWNER_REVIEW}));
  }
  function buildMissingInformation(input){
    const missing=input.missingInputFields.map(fieldName=>`Required concept input is missing: ${fieldName}.`);
    const common=[
      'Approved public business name and legal-use wording.',
      'Validated first customer segment and documented demand evidence.',
      'Approved starter and core offer scope, price, payment, turnaround, revision, and exclusions.',
      'Confirmed tax, insurance, licensing, permit, professional, privacy, and local requirements as applicable.',
      'Approved public-safe proof and permission record.',
      'Selected email, payment, analytics, customer-auth, storage, accounting, social, website, and calendar providers.',
      'Verified provider credentials, regression tests, duplicate protection, Proof Log, Error Log, and rollback.',
      'Approved launch capacity, response target, waitlist, pause, cancellation, and refund rules.'
    ];
    return Array.from(new Set([...missing,...common]));
  }
  function buildDecisions(input){
    const items=[
      'Approve or reject the working business name and public wording.',
      'Choose the first customer segment and approved service area.',
      'Approve the free, starter, core, premium, and recurring ladder.',
      'Approve price ranges, payment timing, revision allowance, exclusions, and acceptance criteria.',
      'Approve the lead magnet and the customer path it supports.',
      'Approve enabled Business OS modules and role permissions.',
      'Choose provider accounts while keeping execution locked until tests pass.',
      'Approve public-safe proof and photo use after privacy review.',
      'Approve the 30-day launch capacity and rollback plan.',
      'Approve each customer-facing send, payment request, publication, and final delivery until policy changes explicitly.'
    ];
    return items.map((title,index)=>({id:`DECISION-${String(index+1).padStart(3,'0')}`,title,status:'OPEN_OWNER_DECISION',decision:null,decidedAt:null}));
  }
  function buildTasks(input,productRecords){
    const definitions=[
      ['Confirm business name, legal-use wording, entity, insurance, licensing, tax, and public boundaries','governance',1,[]],
      ['Validate the first customer segment with five documented real conversations or equivalent evidence','research',5,['TASK-001']],
      ['Approve the first customer/problem segment and service area','owner-review',6,['TASK-002']],
      ['Approve the free, starter, core, premium, and recurring product ladder','catalog',7,['TASK-003']],
      ['Approve price ranges, payment timing, turnaround, revisions, exclusions, and acceptance criteria','catalog',8,['TASK-004']],
      ['Create and QA the free lead magnet','marketing',10,['TASK-004']],
      ['Create one public-safe proof item with classification and privacy review','proof',10,['TASK-003']],
      ['Approve sitemap and page outlines','website',11,['TASK-004']],
      ['Build homepage, service, pricing, proof, and request-page content drafts','website',15,['TASK-006','TASK-007','TASK-008']],
      ['Build intake questions, privacy notice, and missing-information workflow','operations',14,['TASK-004']],
      ['Load draft product records into the selected tenant only','catalog',16,['TASK-005']],
      ['Approve SOP list and assign owners','operations',17,['TASK-010']],
      ['Configure Business OS modules, roles, theme, tenant, and feature flags','business-os',18,['TASK-011','TASK-012']],
      ['Choose provider slots and record exact credential blockers','providers',19,['TASK-013']],
      ['Build quote, invoice, payment-request, delivery, and follow-up templates','operations',20,['TASK-005','TASK-010']],
      ['Build recurring contract, cancellation, and overage drafts','contracts',20,['TASK-005']],
      ['Create six owner-review social drafts and channel requirements','social',21,['TASK-006','TASK-009']],
      ['Approve expense categories and launch-budget controls','accounting',18,['TASK-001']],
      ['Configure analytics events and privacy requirements without activating a provider','analytics',22,['TASK-009']],
      ['Run catalog, privacy, selected-record, duplicate-lock, proof-log, and error-log tests','qa',24,['TASK-011','TASK-013','TASK-014','TASK-015','TASK-016','TASK-017','TASK-018','TASK-019']],
      ['Create backup, verify integrity, restore to test, and record rollback evidence','recovery',25,['TASK-013']],
      ['Run mobile, accessibility, links, downloads, formulas, intake, and browser-storage checks','qa',26,['TASK-009','TASK-010']],
      ['Prepare controlled launch packet with exact blockers and no silent waivers','launch-control',27,['TASK-020','TASK-021','TASK-022']],
      ['Owner approves or holds the controlled launch','owner-review',28,['TASK-023']],
      ['Review day-30 metrics, customer feedback, errors, profitability, and next expansion decision','reports',30,['TASK-024']]
    ];
    return definitions.map((item,index)=>({
      id:`TASK-${String(index+1).padStart(3,'0')}`,
      title:item[0],
      module:item[1],
      dueDay:item[2],
      dependencies:item[3],
      status:'NEEDS_OWNER_REVIEW',
      selectedRecordOnly:true,
      bulkExecution:false,
      externalActionsEnabled:false,
      relatedProductIds:index===10?productRecords.map(product=>product.id):[]
    }));
  }
  function buildLaunchPlan(tasks){
    const phases=[
      {days:'1–5',focus:'Decisions, demand, and boundaries'},
      {days:'6–10',focus:'Offer ladder, pricing, lead magnet, and proof'},
      {days:'11–20',focus:'Website, intake, records, SOPs, Business OS, providers, and financial controls'},
      {days:'21–27',focus:'Content, analytics, QA, backup, restore, and rollback'},
      {days:'28–30',focus:'Owner launch decision and measured review'}
    ];
    return phases.map(phase=>{
      const [start,end]=phase.days.split('–').map(Number);
      return {...phase,taskIds:tasks.filter(task=>task.dueDay>=start&&task.dueDay<=end).map(task=>task.id)};
    });
  }
  function buildOsConfiguration(input,products){
    const enabledModules=['tasks','leads','customers','jobs','quotes','invoices','payments','expenses','communications','files','contracts','website','reports','proof','errors','settings'];
    if(input.businessModels.includes('online')||input.businessModels.includes('digital'))enabledModules.push('social','advertising','accounting');
    const featureFlags={customerPortal:false,customerUploads:false,hostedPayments:false,outboundEmail:false,socialPublishing:false,advertisingLaunch:false,websiteDeployment:false,accountingApiSync:false,calendarSync:false,recurringContracts:true,providerNeutralCsv:true};
    return {
      schemaVersion:1,
      tenant:{key:slugify(input.businessName),name:input.businessName,mode:'isolated',crossTenantReads:false,crossTenantWrites:false},
      environment:'test',
      releaseChannel:'development',
      tierRecommendation:input.businessModels.length>2?'Growth':'Operations',
      modules:Array.from(new Set(enabledModules)),
      roles:['owner','administrator','operator','reviewer','customer-own'],
      controls:{selectedRecordOnly:true,bulkExecution:false,automaticRetry:false,duplicateProtection:true,proofLogRequired:true,errorLogRequired:true,ownerApprovalRequiredForExternalActions:true,externalActionsEnabled:false},
      featureFlags,
      providers:['catalog','payment','email','accounting','social','website','storage','calendar'].map(slot=>({slot,provider:null,credentialState:'NOT_CONFIGURED',executionState:'LOCKED',ownerReleaseRequired:true})),
      catalog:{source:'generated/business-concept-package.json#productRecords',products:products.length,bundles:0,catalogValidationRequired:true},
      theme:{brandName:input.businessName,accentColor:'#17324d',surfaceColor:'#ffffff',fontFamily:'system-ui'},
      privacy:{publicPrivateSeparationRequired:true,customerIsolationRequired:true,privateSourceClasses:['customer records','vendor records','employee records','private addresses','family information','unapproved photographs','credentials','payment data','proprietary files']},
      externalActionsEnabled:false
    };
  }
  function buildBusinessPackDraft(input,osConfig,products){
    const featureFlags=clone(osConfig.featureFlags);
    for(const flag of EXTERNAL_FLAGS)featureFlags[flag]=false;
    return {
      id:slugify(input.businessName),
      name:`${input.businessName} Business Pack`,
      version:'0.1.0-draft',
      defaultTenantKey:osConfig.tenant.key,
      defaultTier:osConfig.tierRecommendation,
      externalActionsEnabled:false,
      theme:clone(osConfig.theme),
      enabledModules:clone(osConfig.modules),
      featureFlags,
      catalog:{source:'generated/business-concept-package.json#productRecords',products:products.length,bundles:0,catalogValidationRequired:true},
      providers:osConfig.providers.map(provider=>({slot:provider.slot,mode:provider.slot==='catalog'?'file':provider.slot==='email'?'draft-only':provider.slot==='accounting'?'csv':provider.slot==='social'?'internal-schedule':provider.slot==='website'?'review-only':'manual',provider:null})),
      privacy:clone(osConfig.privacy),
      support:{approvalOwner:'Business owner',customerFacingApprovalRequired:true,deploymentApprovalRequired:true,selectedRecordOnly:true},
      status:OWNER_REVIEW
    };
  }
  function buildSummary(input){
    return {
      name:input.businessName,
      idea:input.idea,
      ownerSkills:input.ownerSkills,
      customers:input.customers,
      serviceArea:input.serviceArea,
      assetsEquipment:input.assetsEquipment,
      timeAvailable:input.timeAvailable,
      hoursPerWeek:input.hoursPerWeek,
      launchBudget:input.launchBudget,
      launchBudgetAmount:input.launchBudgetAmount||null,
      contactPreference:input.contactPreference,
      revenueGoals:input.revenueGoals,
      monthlyRevenueGoal:input.monthlyRevenueGoal||null,
      businessModels:input.businessModels,
      restrictions:input.restrictionsList,
      risks:input.riskList,
      currentSystems:input.currentSystemList,
      expansionIdeas:input.expansionList,
      primaryProblem:input.primaryProblem,
      primaryOutcome:input.primaryOutcome
    };
  }
  function generatePackage(rawInput,options={}){
    const input=normalizeInput(rawInput);
    const errors=validateInput(input);
    if(errors.length)throw new Error(errors.join(' '));
    const pricing=pricingModel(input);
    const segments=buildSegments(input);
    const offers=buildOffers(input,pricing);
    const products=buildProducts(input,offers);
    const addOns=buildAddOns(input,pricing);
    const contracts=buildContracts(input,pricing);
    const sitemap=buildSitemap(input);
    const pageOutlines=buildPageOutlines(input,sitemap);
    const sops=buildSops(input);
    const socialDrafts=buildSocial(input,segments);
    const expenses=buildExpenses(input);
    const risks=buildRisks(input);
    const missingInformation=buildMissingInformation(input);
    const decisions=buildDecisions(input);
    const tasks=buildTasks(input,products);
    const osConfig=buildOsConfiguration(input,products);
    const businessPackDraft=buildBusinessPackDraft(input,osConfig,products);
    const generatedAt=options.generatedAt||new Date().toISOString();
    const packageData={
      metadata:{schema:SCHEMA,version:VERSION,generatedAt,status:OWNER_REVIEW,inputDigest:digest(input),automaticExternalActions:false,selfApproved:false,externalActionsOccurred:false,redactionsApplied:input.redactionsApplied},
      businessSummary:buildSummary(input),
      customerProblemSegments:segments,
      offers,
      productLadder:offers.map(offer=>({offerId:offer.id,level:offer.level,name:offer.name,priceRange:offer.priceRange,nextStep:offer.id==='OFFER-FREE'?'OFFER-STARTER':offer.id==='OFFER-STARTER'?'OFFER-CORE':offer.id==='OFFER-CORE'?'OFFER-PREMIUM':'OFFER-CARE'})),
      pricingLogic:pricing,
      freeLeadMagnet:{id:'LEAD-MAGNET-001',name:offers[0].name,format:'Browser checklist plus downloadable CSV or PDF',inputs:['Customer situation','Current problem','Desired result','Known constraints'],outputs:['Readiness score or checklist','Missing-information list','Recommended next step'],conversionPath:'Free lead magnet → starter snapshot → core outcome → premium implementation → bounded care plan',status:OWNER_REVIEW},
      addOns,
      recurringContracts:contracts,
      sitemap,
      pageOutlines,
      intakeQuestions:buildIntake(input),
      productRecords:products,
      sopList:sops,
      businessOSConfiguration:osConfig,
      businessPackDraft,
      launchPlan30Days:buildLaunchPlan(tasks),
      socialThemes:Array.from(new Set(socialDrafts.map(item=>item.theme))),
      socialDrafts,
      expenseCategories:expenses,
      risks,
      missingInformation,
      decisions,
      tasks,
      records:{products,addOns,contracts,sops,socialDrafts,expenses,risks,decisions,tasks},
      ownerReviewChecklist:[
        'No customer-facing communication was sent.',
        'No quote, invoice, payment request, charge, refund, or recurring billing was executed.',
        'No social post, advertisement, website change, legal entity, account, or provider was created or published.',
        'No engineering, safety, legal, tax, insurance, permit, or licensing conclusion was made.',
        'All generated prices, tasks, records, configurations, content, and launch actions remain drafts requiring owner review.',
        'Selected-record, tenant-isolation, duplicate-protection, Proof Log, Error Log, privacy, backup, and rollback controls remain required.'
      ],
      commercializationBlockers:[
        'Commercial license signing, entitlement, billing, revocation, and support infrastructure are not configured.',
        'Provider accounts, credentials, regression tests, duplicate locks, Proof/Error behavior, and rollback are not configured.',
        'Customer authentication, customer-own storage authorization, and production infrastructure are not configured.',
        'Legal entity, public name, tax, insurance, licensing, privacy, refund, cancellation, and local requirements remain owner decisions with qualified advice as applicable.',
        'Market validation, public-safe proof, final prices, capacity, service levels, and product-support obligations remain unapproved.'
      ]
    };
    const packageErrors=validatePackage(packageData);
    if(packageErrors.length)throw new Error(packageErrors.join(' '));
    return packageData;
  }
  function validatePackage(packageData){
    const errors=[];
    const required=['businessSummary','customerProblemSegments','offers','productLadder','pricingLogic','freeLeadMagnet','addOns','recurringContracts','sitemap','pageOutlines','intakeQuestions','productRecords','sopList','businessOSConfiguration','businessPackDraft','launchPlan30Days','socialThemes','socialDrafts','expenseCategories','risks','missingInformation','decisions','tasks','records'];
    for(const fieldName of required)if(packageData[fieldName]==null)errors.push(`Generated package is missing ${fieldName}.`);
    if(packageData.metadata?.status!==OWNER_REVIEW)errors.push('Package must require owner review.');
    if(packageData.metadata?.externalActionsOccurred!==false||packageData.metadata?.automaticExternalActions!==false||packageData.metadata?.selfApproved!==false)errors.push('Generated package safety state is invalid.');
    const productIds=(packageData.productRecords||[]).map(item=>item.id);
    if(new Set(productIds).size!==productIds.length)errors.push('Product IDs must be unique.');
    const taskIds=new Set((packageData.tasks||[]).map(item=>item.id));
    for(const task of packageData.tasks||[]){
      if(task.status!=='NEEDS_OWNER_REVIEW'||task.selectedRecordOnly!==true||task.bulkExecution!==false||task.externalActionsEnabled!==false)errors.push(`Task ${task.id} violates owner-review controls.`);
      for(const dependency of task.dependencies||[])if(!taskIds.has(dependency))errors.push(`Task ${task.id} references missing dependency ${dependency}.`);
    }
    if(packageData.businessOSConfiguration?.tenant?.mode!=='isolated'||packageData.businessOSConfiguration?.tenant?.crossTenantReads!==false||packageData.businessOSConfiguration?.tenant?.crossTenantWrites!==false)errors.push('Tenant isolation is required.');
    if(packageData.businessOSConfiguration?.externalActionsEnabled!==false||packageData.businessPackDraft?.externalActionsEnabled!==false)errors.push('External actions must remain disabled.');
    for(const flag of EXTERNAL_FLAGS)if(packageData.businessPackDraft?.featureFlags?.[flag]!==false)errors.push(`External feature flag ${flag} must remain disabled.`);
    return errors;
  }
  function markdown(packageData){
    const lines=[`# ${packageData.businessSummary.name} — Owner-Review Business Launch Package`,'',`Status: ${packageData.metadata.status}`,`Generated: ${packageData.metadata.generatedAt}`,`Schema: ${packageData.metadata.schema}`,`Input digest: ${packageData.metadata.inputDigest}`,'','## Business summary',packageData.businessSummary.idea,'',`Service area: ${packageData.businessSummary.serviceArea||'Not supplied'}`,`Business models: ${packageData.businessSummary.businessModels.join(', ')}`,`Time available: ${packageData.businessSummary.timeAvailable||packageData.businessSummary.hoursPerWeek+' hours/week'}`,`Revenue goal: ${packageData.businessSummary.revenueGoals||'Not supplied'}`,'','## Customer/problem segments'];
    packageData.customerProblemSegments.forEach(segment=>lines.push(`- **${segment.name}** — ${segment.primaryProblem} → ${segment.desiredOutcome}`));
    lines.push('','## Product ladder');
    packageData.offers.forEach(offer=>lines.push(`- **${offer.level}: ${offer.name}** — ${offer.purpose} — ${offer.priceRange[0]===offer.priceRange[1]?'$'+offer.priceRange[0]:`$${offer.priceRange[0]}–$${offer.priceRange[1]}`}`));
    lines.push('','## Pricing logic',...packageData.pricingLogic.rules.map(rule=>`- ${rule}`),'','## Sitemap',...packageData.sitemap.map(page=>`- ${page}`),'','## SOP list',...packageData.sopList.map(item=>`- ${item.id} — ${item.name}`),'','## 30-day launch plan');
    packageData.launchPlan30Days.forEach(phase=>lines.push(`### Days ${phase.days}: ${phase.focus}`,...phase.taskIds.map(id=>`- ${id}`)));
    lines.push('','## Created Tasks');
    packageData.tasks.forEach(task=>lines.push(`- ${task.id} — Day ${task.dueDay} — ${task.title} [${task.status}]`));
    lines.push('','## Missing information',...packageData.missingInformation.map(item=>`- ${item}`),'','## Decisions',...packageData.decisions.map(item=>`- ${item.id} — ${item.title}`),'','## Safety state',...packageData.ownerReviewChecklist.map(item=>`- ${item}`),'','## Commercialization blockers',...packageData.commercializationBlockers.map(item=>`- ${item}`));
    return lines.join('\n');
  }
  function tasksCsv(packageData){
    const rows=[['task_id','title','module','due_day','status','dependencies','selected_record_only','bulk_execution','external_actions_enabled']];
    for(const task of packageData.tasks)rows.push([task.id,task.title,task.module,task.dueDay,task.status,(task.dependencies||[]).join('|'),task.selectedRecordOnly,task.bulkExecution,task.externalActionsEnabled]);
    return rows.map(row=>row.map(value=>`"${asString(value).replace(/"/g,'""')}"`).join(',')).join('\n')+'\n';
  }
  return {VERSION,SCHEMA,OWNER_REVIEW,EXTERNAL_FLAGS,REQUIRED_INPUT_FIELDS,normalizeInput,validateInput,generatePackage,validatePackage,markdown,tasksCsv,digest,slugify,parseAmount,redactText};
});
