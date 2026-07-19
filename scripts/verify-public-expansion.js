'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const exists=p=>fs.existsSync(path.join(root,p));
const read=p=>exists(p)?fs.readFileSync(path.join(root,p),'utf8'):'';
const failures=[];
const check=(name,condition,detail='')=>{if(!condition)failures.push({name,detail});};
const requireFile=p=>check(`required file ${p}`,exists(p),p);

[
  'index.html','products.html','business-systems.html','sample-library-now.html','free-tools.html','start-request.html',
  'solutions.html','service-guides.html','case-study-template.html','business-systems-data.js','public-expansion.css',
  'public-expansion.js','tool-downloads.js','public-site-config.js','visual-cleanup.css','visual-cleanup-secondary.css',
  'request-flow.js','apps-script/unified-shell/Unified_PublicIntake.gs','docs/public-website/CUSTOM_DOMAIN_READINESS.md'
].forEach(requireFile);

const catalog=read('catalog-data.js');
const productCount=(catalog.match(/"id":"H38-P\d{3}"/g)||[]).length;
const bundleCount=(catalog.match(/"id":"H38-B\d{3}"/g)||[]).length;
check('catalog preserves 15 products',productCount===15,String(productCount));
check('catalog preserves 9 bundles',bundleCount===9,String(bundleCount));

const home=read('index.html');
check('homepage preserves approved promise',home.includes('<span>Big problems.</span>')&&home.includes('<strong>Clear plans.</strong>'));
check('homepage has request and examples actions',home.includes('href="start-request.html"')&&home.includes('href="sample-library-now.html"'));
check('homepage explains no-charge boundary',home.includes('Submitting a request creates no charge'));
check('homepage uses clean approved planning image',home.includes('assets/approved-website-images/10-project-planning-documents.jpg'));
check('homepage uses real responsive structure',home.includes('class="site-header"')&&home.includes('class="menu-button"')&&home.includes('class="hero-copy"')&&home.includes('class="hero-media"'));
check('homepage retired mockup and hotspot shell are absent',!home.includes('assets/approved-homepage-mockup.png')&&!/class="hotspot|Swipe horizontally|approved-home__stage/i.test(home));
check('homepage preserves four outcome paths',(home.match(/class="outcome-card"/g)||[]).length===4);
check('unsupported quantitative CNC claim absent',!home.includes('25,000+'));

const request=read('start-request.html');
const requestFlow=read('request-flow.js');
const intake=read('apps-script/unified-shell/Unified_PublicIntake.gs');
check('request flow preserves three steps',[1,2,3].every(step=>request.includes(`data-request-step="${step}"`)));
check('request form is connected to existing unified deployment',request.includes('data-intake-endpoint="https://script.google.com/macros/s/'));
check('request performs secure direct submission',requestFlow.includes('function submitDirect')&&requestFlow.includes("message.type!=='h38-public-intake'")&&requestFlow.includes('post.submit()'));
check('request returns confirmation record',requestFlow.includes('Request received')&&requestFlow.includes('requestId'));
check('request saves and restores progress',requestFlow.includes('H38Platform.saveDraft')&&requestFlow.includes('H38Platform.loadDraft'));
check('request keeps email fallback only',requestFlow.includes('function emailFallback')&&request.includes('id="email-summary" hidden'));
check('intake protects duplicates and owner approval',intake.includes('DUPLICATE_ACCEPTED')&&intake.includes('Owner Approval Required')&&intake.includes('External actions remain locked'));

const systems=read('business-systems-data.js');
['Website Build Package','Business Office Suite','Command Center Suite','Complete Business System'].forEach(name=>check(`business system ${name}`,systems.includes(name)));
check('business systems preserve tax boundary',systems.includes('Tax-preparation support only'));
check('business systems do not invent catalog IDs',!/H38-[PB]\d{3}/.test(systems));

const products=read('products.html');
check('product families remain present',['data-products="plans"','data-products="implementation"','data-products="manufacturing"','data-bundles'].every(marker=>products.includes(marker)));

const samples=read('sample-library-now.html');
check('sample library preserves all product samples',samples.includes('data-samples="all"'));
check('sample library preserves system demonstrations',samples.includes('data-system-scenarios'));
check('sample library preserves proof classification',samples.includes('data-image-classification="hypothetical-demonstration"'));

const tools=read('tool-downloads.js');
const toolNames=['Problem Definition Worksheet','Project Planning Checklist','Space Measurement Checklist','Garage and Shop Photo Checklist','Owner Decision Checklist','Project Scope Template','Shop Flow Observation Sheet','Tool and Material Zone Worksheet','Lead-to-Job Status Tracker','Follow-Up Checklist','Workflow Mapping Worksheet','Repeated Task Audit','File Cleanup Planning Checklist','Automation Opportunity Checklist','Machine Idle-Reason Tracker','Basic ROI Assumption Worksheet','Vendor RFQ Preparation Checklist','Fixture Concept Question Sheet','Vision Inspection Sample Checklist','Robot Tending Information Checklist','Automation Vendor Comparison Sheet','Small-Business Website Planning Checklist','Website Content Collection Worksheet','Business Office Readiness Checklist','Customer and Job Workflow Checklist','Command Center Requirements Worksheet','User Role Planning Sheet','Business System Implementation Checklist','Business Data Migration Checklist','Backup and Recovery Readiness Checklist'];
check('free-tool contract contains 30 downloads',toolNames.length===30);
toolNames.forEach(name=>check(`free tool ${name}`,tools.includes(name)));

[
  'assets/approved-website-images/10-project-planning-documents.jpg',
  'assets/rick-review-basic-layout-v1.png',
  'assets/rick-review-shop-flow-v1.png',
  'assets/product-proof/digital-workflow-build.png',
  'assets/product-proof/robot-tending-concept-pack.png'
].forEach(p=>check(`committed proof image ${p}`,exists(p)));

const guides=read('service-guides.html');
const guideIds=['garage-layout-planning','shop-organization-planning','small-business-workflow-setup','digital-workflow-implementation','file-document-cleanup','manufacturing-bottleneck-analysis','automation-opportunity-review','automation-rfq-preparation','fixture-jig-concept-review','vision-inspection-planning','robot-tending-concept-planning','small-business-website-building','business-office-system-setup','owner-command-center-setup','complete-business-system-implementation'];
guideIds.forEach(id=>check(`service guide ${id}`,guides.includes(`id="${id}"`)));
check('domain changes remain approval gated',read('docs/public-website/CUSTOM_DOMAIN_READINESS.md').includes('NO DOMAIN, BILLING, OR DNS CHANGE AUTHORIZED'));

const result={status:failures.length?'FAIL':'PASS',products:productCount,bundles:bundleCount,freeDownloads:toolNames.length,serviceGuides:guideIds.length,failures};
console.log(JSON.stringify(result,null,2));
process.exit(failures.length?1:0);
