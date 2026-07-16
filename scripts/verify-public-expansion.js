'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const exists=p=>fs.existsSync(path.join(root,p));
const fail=m=>{throw new Error(m)};
const need=(text,marker,label)=>{if(!text.includes(marker))fail(`${label}: missing ${marker}`)};

const requiredFiles=['index.html','products.html','business-systems.html','sample-library-now.html','free-tools.html','start-request.html','solutions.html','service-guides.html','case-study-template.html','business-systems-data.js','public-expansion.css','public-expansion.js','tool-downloads.js','public-site-config.js','docs/public-website/CUSTOM_DOMAIN_READINESS.md'];
requiredFiles.forEach(p=>{if(!exists(p))fail(`missing required file ${p}`)});

const catalog=read('catalog-data.js');
const productIds=[...catalog.matchAll(/"id":"H38-P\d{3}"/g)].map(x=>x[0]);
const bundleIds=[...catalog.matchAll(/"id":"H38-B\d{3}"/g)].map(x=>x[0]);
if(productIds.length!==15)fail(`expected 15 product records, found ${productIds.length}`);
if(bundleIds.length!==9)fail(`expected 9 bundle records, found ${bundleIds.length}`);

const home=read('index.html');
need(home,'Big problems. Clear plans.','home');
need(home,'href="start-request.html">Start a Request','home primary CTA');
need(home,'href="sample-library-now.html">View Samples','home secondary CTA');
need(home,'Submitting a request creates no charge','home no-charge reassurance');
need(home,'homepage-hero-garage-workspace.webp','approved hero image');
need(home,'project-planning-desk.webp','approved planning image');
need(home,'Programmed and maintained thousands of CNC jobs','verified experience');
if(home.includes('25,000+'))fail('unsupported CNC claim remains');

const systems=read('business-systems-data.js');
['Website Build Package','Business Office Suite','Command Center Suite','Complete Business System'].forEach(x=>need(systems,x,'business systems'));
need(systems,'Request a scoped quote','business systems pricing');
need(systems,'Tax-preparation support only','tax boundary');
need(systems,'defined future product','Command Center honesty');
if(/H38-[PB]\d{3}/.test(systems))fail('new business systems must not receive H38 product or bundle IDs');

const products=read('products.html');
need(products,'data-products="plans"','planning products');
need(products,'data-products="implementation"','implementation products');
need(products,'data-products="manufacturing"','manufacturing products');
need(products,'data-bundles','bundles');
need(products,'15 fixed-price services. 9 approved bundles. 4 scoped systems.','catalog preservation marker');

const samples=read('sample-library-now.html');
need(samples,'data-samples="all"','existing samples');
need(samples,'data-system-scenarios','system demonstrations');
need(samples,'hypothetical demonstration','proof classification wording');
need(samples,'Workflow proof formats','workflow proof');

const tools=read('tool-downloads.js');
const toolNames=['Problem Definition Worksheet','Project Planning Checklist','Space Measurement Checklist','Garage and Shop Photo Checklist','Owner Decision Checklist','Project Scope Template','Shop Flow Observation Sheet','Tool and Material Zone Worksheet','Lead-to-Job Status Tracker','Follow-Up Checklist','Workflow Mapping Worksheet','Repeated Task Audit','File Cleanup Planning Checklist','Automation Opportunity Checklist','Machine Idle-Reason Tracker','Basic ROI Assumption Worksheet','Vendor RFQ Preparation Checklist','Fixture Concept Question Sheet','Vision Inspection Sample Checklist','Robot Tending Information Checklist','Automation Vendor Comparison Sheet','Small-Business Website Planning Checklist','Website Content Collection Worksheet','Business Office Readiness Checklist','Customer and Job Workflow Checklist','Command Center Requirements Worksheet','User Role Planning Sheet','Business System Implementation Checklist','Business Data Migration Checklist','Backup and Recovery Readiness Checklist'];
if(toolNames.length!==30)fail('verifier tool list must contain 30 required downloads');
toolNames.forEach(x=>need(tools,x,'free tools'));
need(read('free-tools.html'),'data-expanded-downloads','free tools host');

const publicJs=read('public-expansion.js');
['Services','Business Systems','Samples','Free Tools','Start a Request'].forEach(x=>need(publicJs,x,'public navigation'));
need(publicJs,'exp-best-for','Best for rendering');
need(publicJs,'business-system-interest','business system intake');
need(publicJs,'Filter samples by result','sample result filtering');

const approvedImages=['assets/approved-website-images/homepage-hero-garage-workspace.webp','assets/approved-website-images/project-planning-desk.webp','assets/approved-website-images/business-workflow-office.webp','assets/approved-website-images/manufacturing-automation.webp','assets/approved-website-images/05-organized-tool-wall-workbench.jpg','assets/approved-website-images/06-garage-layout-zones.jpg','assets/approved-website-images/07-storage-organization-system.jpg','assets/approved-website-images/08-request-process-checklist.jpg','assets/approved-website-images/09-clean-working-shop-floor.jpg','assets/approved-website-images/10-project-planning-documents.jpg','assets/approved-website-images/11-exterior-shop-building.jpg','assets/approved-website-images/12-cnc-machining-closeup.jpg','assets/approved-website-images/13-digital-organization-file-system.jpg'];
approvedImages.forEach(p=>{if(!exists(p))fail(`missing approved image ${p}`)});

const guides=read('service-guides.html');
['garage-layout-planning','shop-organization-planning','small-business-workflow-setup','digital-workflow-implementation','file-document-cleanup','manufacturing-bottleneck-analysis','automation-opportunity-review','automation-rfq-preparation','fixture-jig-concept-review','vision-inspection-planning','robot-tending-concept-planning','small-business-website-building','business-office-system-setup','owner-command-center-setup','complete-business-system-implementation'].forEach(x=>need(guides,`id="${x}"`,'service guides'));

const caseStudy=read('case-study-template.html');
['Customer problem','Starting condition','Information received','Work performed','Deliverables','Customer-controlled decisions','Final result','Proof and authorization'].forEach(x=>need(caseStudy,x,'case study template'));
need(read('docs/public-website/CUSTOM_DOMAIN_READINESS.md'),'NO DOMAIN, BILLING, OR DNS CHANGE AUTHORIZED','domain boundary');
need(read('public-site-config.js'),'awaiting-owner-approved-wording','service area configuration');

console.log(JSON.stringify({status:'PASS',products:productIds.length,bundles:bundleIds.length,businessSystems:4,freeDownloads:toolNames.length,approvedImages:approvedImages.length,serviceGuides:15},null,2));
