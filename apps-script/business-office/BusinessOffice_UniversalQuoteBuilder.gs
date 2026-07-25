/**
 * Highway 38 Universal Quote Builder.
 *
 * Canonical Quote Builder extension. It does not create a second application,
 * database, customer boundary, approval system, or deployment. The engine
 * provides progressive quote depth, deterministic calculations, controlled
 * agent definitions, drawing classifications, and reusable demonstration data.
 */
var H38_UQB=Object.freeze({
  VERSION:'2026-07-25-universal-v1',
  EXTERNAL_ACTIONS_ENABLED:false,
  MAX_LINES:200,
  LEVELS:Object.freeze([
    Object.freeze({level:1,key:'basic',name:'Basic quote',description:'Fast customer, service, quantity, frequency, price, description, terms, and acceptance.',requires:['customer','service','quantity','price','terms']}),
    Object.freeze({level:2,key:'itemized',name:'Itemized quote',description:'Multiple services, materials, labor, packages, options, recurring frequencies, taxes, discounts, and customer-facing controls.',requires:['lineItems','pricingMethod','options']}),
    Object.freeze({level:3,key:'area',name:'Area-based quote',description:'Areas, rooms, zones, measurements, quantities, unit pricing, marked-up photos, drawings, materials, labor, and area instructions.',requires:['areas','measurements','quantitySources','drawingLinks']}),
    Object.freeze({level:4,key:'technical',name:'Technical quote',description:'Specifications, revision-controlled drawings, operations, rates, setup, programming, tooling, inspection, material specifications, quantities, purchased components, delivery, and risk.',requires:['specifications','operations','revisions','inspection','technicalAssumptions']}),
    Object.freeze({level:5,key:'concept',name:'Concept and integration proposal',description:'Existing conditions, alternatives, architecture, layouts, flows, cycle time, utilities, equipment, controls, safety, phases, commissioning, training, acceptance, vendors, contingencies, and open questions.',requires:['existingConditions','alternatives','systemArchitecture','phases','acceptanceCriteria']})
  ]),
  PRICING_METHODS:Object.freeze([
    'per_item','per_service','per_hour','per_labor_classification','per_machine_hour','per_setup','per_programming_hour','per_operation','per_part','per_assembly','per_batch','per_production_lot','per_visit','per_room','per_fixture','per_opening','per_square_foot','per_linear_foot','per_cubic_foot','per_cubic_yard','per_acre','per_pound','per_ton','per_mile','flat_rate_package','recurring_service','tiered_quantity','formula_based','cost_plus','target_margin','vendor_pass_through','subcontractor_pass_through','allowance','time_and_material'
  ]),
  DRAWING_CLASSIFICATIONS:Object.freeze([
    'Conceptual','Estimating','Subcontractor bidding','Field layout','Construction-ready','Permit submission','Engineer or licensed-professional review required','Approved final'
  ]),
  AGENTS:Object.freeze([
    Object.freeze({key:'intake_requirements',name:'Intake and Requirements Agent',mode:['Assist','Prepare'],records:['Requests','Customers','Documents','Quotes'],approval:'user review required'}),
    Object.freeze({key:'quote_architect',name:'Quote Architect Agent',mode:['Assist','Prepare'],records:['Quotes','Quote Lines','Documents','Approvals'],approval:'user review required'}),
    Object.freeze({key:'measurement_quantity',name:'Measurement and Quantity Agent',mode:['Assist','Prepare'],records:['Documents','Quotes','Quote Lines'],approval:'verified measurement required'}),
    Object.freeze({key:'pricing_costing',name:'Pricing and Costing Agent',mode:['Assist','Prepare'],records:['Price Book','Quotes','Quote Lines'],approval:'pricing changes require authorized approval'}),
    Object.freeze({key:'scope_instruction',name:'Scope and Instruction Agent',mode:['Assist','Prepare'],records:['Quotes','Work Orders','Documents'],approval:'user review required'}),
    Object.freeze({key:'drawing',name:'Drawing Agent',mode:['Assist','Prepare'],records:['Documents','Quotes'],approval:'classification and professional-review controls required'}),
    Object.freeze({key:'quote_review',name:'Quote Review Agent',mode:['Assist','Prepare'],records:['Quotes','Quote Lines','Documents','Approvals'],approval:'authorized user decides'}),
    Object.freeze({key:'business_setup',name:'Business Setup Agent',mode:['Assist','Prepare'],records:['Setup','Price Book','Templates','Documents'],approval:'all proposed business rules require authorized activation'})
  ]),
  SETUP_LEVELS:Object.freeze([
    Object.freeze({key:'self',name:'Basic self-setup',commercial:'Included in Quote Builder'}),
    Object.freeze({key:'assisted',name:'Assisted setup',commercial:'Paid add-on'}),
    Object.freeze({key:'advanced',name:'Advanced technical setup',commercial:'Scoped implementation'}),
    Object.freeze({key:'optimization',name:'Ongoing optimization',commercial:'Optional managed service'})
  ])
});

function boUniversalText_(value){return String(value==null?'':value).trim();}
function boUniversalNumber_(value){var n=Number(value);return isFinite(n)?n:0;}
function boUniversalClamp_(value,min,max){return Math.max(min,Math.min(max,value));}
function boUniversalMoney_(value){return Math.round(boUniversalNumber_(value)*100)/100;}
function boUniversalRunKey_(value){
  var key=boUniversalText_(value).toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,32);
  return key||Utilities.formatDate(new Date(),Session.getScriptTimeZone()||'America/Chicago','yyyyMMdd-HHmmss');
}

function boUniversalQuoteExamples_(){
  return [
    {key:'lawn',level:1,title:'Recurring lawn mowing',business:'Property maintenance',summary:'Simple recurring service with frequency, lot basis, price, terms, and acceptance.',pricing:['per_visit','recurring_service']},
    {key:'cleaning',level:1,title:'Commercial cleaning service',business:'Cleaning',summary:'Recurring service quote with zones, frequency, supplies, and optional deep-clean add-on.',pricing:['per_service','recurring_service']},
    {key:'consulting',level:1,title:'Professional consulting engagement',business:'Professional services',summary:'Milestone-based advisory scope with hourly overage and deliverable acceptance.',pricing:['flat_rate_package','per_hour']},
    {key:'landscape',level:3,title:'Landscape renovation',business:'Landscaping',summary:'Measured beds, materials, labor, equipment, marked-up photos, and area-specific scope.',pricing:['per_square_foot','per_cubic_yard','per_hour']},
    {key:'concrete',level:3,title:'Concrete patio and walk',business:'Concrete',summary:'Square footage, thickness, excavation, base, reinforcement, concrete volume, finishing, and access factors.',pricing:['per_square_foot','per_cubic_yard']},
    {key:'deck',level:3,title:'Deck replacement',business:'Carpentry',summary:'Footings, framing, decking, railing, stairs, drawings, inspection points, and options.',pricing:['per_square_foot','per_linear_foot','per_item']},
    {key:'roofing',level:3,title:'Roof replacement',business:'Roofing',summary:'Roof areas, pitch and difficulty factors, waste, underlayment, flashing, ventilation, and alternates.',pricing:['per_square_foot','formula_based']},
    {key:'painting',level:3,title:'Interior painting',business:'Painting',summary:'Rooms, wall and ceiling areas, prep levels, coatings, labor, and exclusions.',pricing:['per_room','per_square_foot']},
    {key:'plumbing',level:4,title:'Plumbing renovation',business:'Plumbing',summary:'Fixture schedule, piping routes, demolition, rough-in, finish, testing, permits, and inspection.',pricing:['per_fixture','per_hour','allowance']},
    {key:'electrical',level:4,title:'Electrical service and lighting',business:'Electrical',summary:'Panel, circuits, devices, lighting plan, controls, testing, permit, and code-review flags.',pricing:['per_opening','per_hour','allowance']},
    {key:'hvac',level:4,title:'HVAC replacement and zoning',business:'HVAC',summary:'Load assumptions, equipment, distribution, controls, startup, balancing, and commissioning.',pricing:['per_item','per_hour','allowance']},
    {key:'kitchen',level:5,title:'Kitchen remodel',business:'Remodeling',summary:'Coordinated demolition, layout, cabinets, counters, plumbing, electrical, HVAC, flooring, paint, schedule, and allowances.',pricing:['flat_rate_package','allowance','subcontractor_pass_through']},
    {key:'automotive',level:4,title:'Engine and brake repair',business:'Automotive repair',summary:'Diagnostic findings, labor operations, parts, fluids, machine work, options, and completion tests.',pricing:['per_operation','per_hour','per_item']},
    {key:'machining',level:4,title:'CNC machined production parts',business:'Machining',summary:'Material, setup, programming, machine time, tooling, inspection, quantity breaks, and delivery.',pricing:['per_setup','per_programming_hour','per_machine_hour','per_part','tiered_quantity']},
    {key:'fabrication',level:4,title:'Welded fabrication assembly',business:'Fabrication and welding',summary:'Material takeoff, cutting, forming, welding, finishing, inspection, purchased components, and assembly.',pricing:['per_pound','per_operation','per_hour','per_assembly']},
    {key:'stamping',level:4,title:'Progressive stamping production',business:'Metal stamping',summary:'Tooling, setup, press rate, material, scrap, secondary operations, lot quantities, and quality plan.',pricing:['per_setup','per_machine_hour','per_production_lot','per_part']},
    {key:'automation',level:5,title:'Robotic machine-tending cell',business:'Industrial automation',summary:'Existing process, alternatives, layout, cycle time, robot, guarding, controls, integration, startup, training, and acceptance.',pricing:['formula_based','cost_plus','target_margin','vendor_pass_through']},
    {key:'whole_house',level:5,title:'Whole-house renovation and property improvement',business:'Multi-business project',summary:'One customer and property coordinated through a master proposal, trade sub-quotes, bid packages, drawings, schedule, and approvals.',pricing:['flat_rate_package','allowance','subcontractor_pass_through','target_margin']}
  ];
}

function boUniversalHouseDemo_(){
  var trades=[
    ['planning','Planning, layout and coordination',12500,'Existing-condition verification, coordinated concept layouts, drawing package, permit and professional-review allowances.'],
    ['demolition','Selective demolition',14200,'Protection, selective removal, disposal, temporary controls, and discovery allowance.'],
    ['carpentry','Structural and finish carpentry',28600,'Openings, framing corrections, blocking, trim, doors, and coordinated field layout.'],
    ['cabinets','Cabinets and countertops',38500,'Cabinet package, hardware, templates, quartz allowance, delivery, and installation.'],
    ['plumbing','Plumbing',24750,'Kitchen, baths, laundry, fixture schedule, rough-in, finish, testing, permit, and inspection.'],
    ['electrical','Electrical and lighting',26900,'Service review, circuits, devices, lighting, controls, low-voltage pathways, permit, and inspection.'],
    ['hvac','HVAC and ventilation',21800,'Equipment and zoning concept, distribution changes, ventilation, controls, startup, and balancing.'],
    ['flooring','Flooring',18400,'Subfloor preparation, resilient and wood flooring allowances, transitions, and protection.'],
    ['painting','Interior and exterior painting',16750,'Preparation, primer, coatings, trim, touch-up, and closeout.'],
    ['concrete','Concrete patio and walk',19200,'Excavation, base, forming, reinforcement, concrete, finish, joints, and curing.'],
    ['deck','Deck and porch',27400,'Footings, framing, decking, stairs, railing, flashing, and inspection points.'],
    ['landscape','Landscaping and drainage',23600,'Grading, drainage, planting, beds, mulch, restoration, and establishment care.'],
    ['garage','Garage and shop layout',8600,'Storage, work zones, utilities, lighting, equipment clearances, and phased implementation.'],
    ['security','Security cameras and low voltage',5950,'Camera locations, cabling, network equipment, recording, setup, and owner training.']
  ];
  var direct=trades.reduce(function(total,row){return total+row[2];},0),allowances=24500,contingency=boUniversalMoney_((direct+allowances)*0.10),total=boUniversalMoney_(direct+allowances+contingency);
  return {
    marker:'H38-UQB-HOUSE',
    title:'Whole-House Renovation and Property Improvement',
    customer:'Universal Quote Builder Demonstration Customer',
    property:'38 Example Road, Grand Rapids, MN',
    classification:'Hypothetical demonstration',
    summary:'One customer, one property, one master proposal, and independently manageable trade packages produced through the same Universal Quote Builder.',
    directCost:direct,
    allowances:allowances,
    contingency:contingency,
    total:total,
    phases:['Verification and coordinated design','Permits, selections, and procurement','Selective demolition','Rough construction and trade work','Interior and exterior finishes','Startup, inspection, proof, and closeout'],
    milestones:[['Authorization and scheduling',10],['Selections and procurement release',25],['Rough work complete',25],['Finish installation complete',25],['Inspection and closeout',15]],
    drawings:[
      {number:'A-101',title:'Existing house and floor layout',classification:'Estimating',revision:'A',review:'Field dimensions required before construction issue'},
      {number:'A-201',title:'Proposed kitchen layout',classification:'Field layout',revision:'B',review:'Customer selection review pending'},
      {number:'A-301',title:'Cabinet elevation',classification:'Subcontractor bidding',revision:'A',review:'Cabinet supplier verification required'},
      {number:'P-101',title:'Plumbing fixture and rough-in layout',classification:'Engineer or licensed-professional review required',revision:'A',review:'Licensed plumbing contractor and permit review required'},
      {number:'E-101',title:'Electrical device and lighting layout',classification:'Permit submission',revision:'A',review:'Licensed electrical contractor and authority review required'},
      {number:'M-101',title:'HVAC equipment and zoning concept',classification:'Conceptual',revision:'A',review:'Load calculation and licensed contractor review required'},
      {number:'C-101',title:'Concrete patio and walk layout',classification:'Estimating',revision:'A',review:'Field elevation and drainage verification required'},
      {number:'S-101',title:'Deck and porch layout',classification:'Engineer or licensed-professional review required',revision:'A',review:'Footing, ledger, load, and permit review required'},
      {number:'L-101',title:'Yard, drainage, and landscape plan',classification:'Field layout',revision:'A',review:'Utilities and property boundaries must be verified'},
      {number:'G-101',title:'Garage and shop layout',classification:'Conceptual',revision:'A',review:'Equipment and electrical requirements pending'}
    ],
    subquotes:trades.map(function(row,index){return {sequence:index+1,key:row[0],title:row[1],amount:row[2],scope:row[3],status:'Internal Review',approvalStatus:'Not Requested',customerVisible:true,internalCostIncluded:true};}),
    bidPackages:['Cabinets and countertops','Plumbing','Electrical and lighting','HVAC and ventilation','Concrete patio and walk','Landscaping and drainage'],
    internal:{marginVisible:true,scopeGapChecks:['Final product selections','Hazardous-material survey if indicated','Hidden-condition responsibility','Utility capacity confirmations','Permit and licensed-professional requirements'],externalActionsPerformed:false}
  };
}

function boUniversalQuoteCatalog_(){
  return {
    version:H38_UQB.VERSION,
    levels:H38_UQB.LEVELS,
    pricingMethods:H38_UQB.PRICING_METHODS,
    drawingClassifications:H38_UQB.DRAWING_CLASSIFICATIONS,
    agents:H38_UQB.AGENTS,
    setupLevels:H38_UQB.SETUP_LEVELS,
    examples:boUniversalQuoteExamples_(),
    house:boUniversalHouseDemo_(),
    controls:{
      informationEnteredOnce:true,
      sharedStructuredProjectData:true,
      customerAndInternalViews:true,
      deterministicCalculations:true,
      ownerApprovalRequired:true,
      aiMayInventOfficialRates:false,
      externalActionsEnabled:false
    }
  };
}

function boUniversalQuoteBuilderCatalog(){
  boQuoteBuilderRequireAction_('View');
  return boUniversalQuoteCatalog_();
}

function boUniversalQuoteRecommendLevel(input){
  boQuoteBuilderRequireAction_('View');
  input=input||{};
  var level=1,reasons=[];
  var items=boUniversalNumber_(input.itemCount);
  if(items>1||input.options||input.recurring||input.materials||input.labor){level=Math.max(level,2);reasons.push('Multiple items, options, recurring work, materials, or labor require itemized controls.');}
  if(input.physicalAreas||input.measurements||input.markedPhotos||input.areaPricing){level=Math.max(level,3);reasons.push('Physical areas or measurements require area-based structure and quantity sources.');}
  if(input.technicalSpecifications||input.operations||input.revisionDrawings||input.inspection||input.machineRates){level=Math.max(level,4);reasons.push('Technical specifications, operations, revisions, rates, or inspection requirements require a technical quote.');}
  if(input.systemIntegration||input.multipleTrades||input.conceptAlternatives||input.commissioning||input.vendorPackages){level=5;reasons.push('Integrated systems, multiple trades, alternatives, commissioning, or vendor packages require a concept and integration proposal.');}
  if(!reasons.length)reasons.push('The supplied intake can be handled as a basic quote.');
  return {status:'PASS',recommendedLevel:level,level:H38_UQB.LEVELS[level-1],reasons:reasons,authorizedUserMayChange:true,externalActionsPerformed:false};
}

function boUniversalPriceLine_(line,index){
  line=line||{};
  var method=boUniversalText_(line.method||'per_item');
  if(H38_UQB.PRICING_METHODS.indexOf(method)<0)throw new Error('Unsupported pricing method on line '+(index+1)+': '+method);
  var quantity=Math.max(0,boUniversalNumber_(line.quantity||1));
  var rate=Math.max(0,boUniversalNumber_(line.rate));
  var cost=Math.max(0,boUniversalNumber_(line.cost));
  var laborHours=Math.max(0,boUniversalNumber_(line.laborHours));
  var laborRate=Math.max(0,boUniversalNumber_(line.laborRate));
  var materialCost=Math.max(0,boUniversalNumber_(line.materialCost));
  var equipmentCost=Math.max(0,boUniversalNumber_(line.equipmentCost));
  var setup=Math.max(0,boUniversalNumber_(line.setup));
  var markup=boUniversalClamp_(boUniversalNumber_(line.markup),0,10);
  var margin=boUniversalClamp_(boUniversalNumber_(line.targetMargin),0,.95);
  var waste=boUniversalClamp_(boUniversalNumber_(line.wasteFactor),0,5);
  var difficulty=boUniversalClamp_(boUniversalNumber_(line.difficultyFactor)||1,.1,10);
  var contingency=boUniversalClamp_(boUniversalNumber_(line.contingencyFactor),0,5);
  var base=0,formula='';
  if(method==='cost_plus'){base=cost*(1+markup);formula='cost × (1 + markup)';}
  else if(method==='target_margin'){base=margin>=.95?0:cost/(1-margin);formula='cost ÷ (1 - target margin)';}
  else if(method==='time_and_material'){base=laborHours*laborRate+materialCost+equipmentCost+setup;formula='labor hours × labor rate + material + equipment + setup';}
  else if(method==='vendor_pass_through'||method==='subcontractor_pass_through'){base=cost*(1+markup);formula='approved pass-through cost × (1 + markup)';}
  else if(method==='allowance'){base=rate||cost;formula='approved allowance';}
  else {base=quantity*rate+setup;formula='quantity × rate + setup';}
  var calculated=base*(1+waste)*difficulty*(1+contingency);
  var minimum=Math.max(0,boUniversalNumber_(line.minimumCharge));
  calculated=Math.max(calculated,minimum);
  var manual=boUniversalText_(line.manualOverride);
  var overrideReason=boUniversalText_(line.overrideReason);
  var finalPrice=boUniversalMoney_(calculated),overridden=false;
  if(manual!==''){
    boRequireOwner_();
    if(!overrideReason)throw new Error('Manual override reason is required on line '+(index+1)+'.');
    finalPrice=boUniversalMoney_(Math.max(0,boUniversalNumber_(manual)));
    overridden=true;
  }
  return {
    lineNumber:index+1,
    description:boUniversalText_(line.description)||('Line '+(index+1)),
    method:method,
    priceBookVersion:boUniversalText_(line.priceBookVersion),
    inputValues:{quantity:quantity,rate:rate,cost:cost,laborHours:laborHours,laborRate:laborRate,materialCost:materialCost,equipmentCost:equipmentCost,setup:setup},
    formula:formula,
    factors:{wasteFactor:waste,markup:markup,targetMargin:margin,difficultyFactor:difficulty,contingencyFactor:contingency,minimumCharge:minimum},
    calculatedPrice:boUniversalMoney_(calculated),
    finalPrice:finalPrice,
    manualOverride:overridden,
    overrideReason:overrideReason,
    approvingUser:overridden?(boGetCurrentUser_().Email||'Owner'):'',
    sourceStatus:boUniversalText_(line.sourceStatus||'User supplied'),
    warnings:boUniversalText_(line.warning)?[boUniversalText_(line.warning)]:[]
  };
}

function boUniversalQuoteCalculate(payload){
  boQuoteBuilderRequireAction_('Edit');
  payload=payload||{};
  var lines=Array.isArray(payload.lines)?payload.lines:[];
  if(!lines.length)throw new Error('At least one pricing line is required.');
  if(lines.length>H38_UQB.MAX_LINES)throw new Error('A maximum of '+H38_UQB.MAX_LINES+' pricing lines may be calculated at once.');
  var priced=lines.map(boUniversalPriceLine_);
  var subtotal=boUniversalMoney_(priced.reduce(function(total,line){return total+line.finalPrice;},0));
  var taxRate=boUniversalClamp_(boUniversalNumber_(payload.taxRate),0,1);
  var tax=boUniversalMoney_(subtotal*taxRate);
  var discount=boUniversalMoney_(Math.max(0,boUniversalNumber_(payload.discount)));
  var total=boUniversalMoney_(Math.max(0,subtotal+tax-discount));
  return {status:'PASS',version:H38_UQB.VERSION,lines:priced,subtotal:subtotal,taxRate:taxRate,tax:tax,discount:discount,total:total,deterministic:true,auditable:true,externalActionsPerformed:false};
}

function boUniversalPrepareHouseDemonstration(runKey){
  var owner=boRequireOwner_();
  var key=boUniversalRunKey_(runKey),house=boUniversalHouseDemo_();
  var runId=house.marker+'-'+key;
  var result={status:'PASS',runId:runId,runKey:key,projectId:runId+'-PROJECT',masterQuoteId:runId+'-QUOTE-MASTER',subquoteCount:house.subquotes.length,drawingCount:house.drawings.length,bidPackageCount:house.bidPackages.length,total:house.total,idempotencyKey:runId,house:house,externalActionsPerformed:false};
  boProof_('PREPARE UNIVERSAL HOUSE DEMONSTRATION','Project',result.projectId,'PASS','Prepared reusable structured house demonstration '+key+' with master proposal, trade sub-quotes, drawings, bid packages, and no external action.',owner.Email||'Owner');
  return result;
}

function boUniversalAgentRunRecord(agentKey,inputSummary,outputSummary,warnings){
  var owner=boQuoteBuilderRequireAction_('Edit'),agent=H38_UQB.AGENTS.filter(function(item){return item.key===agentKey;})[0];
  if(!agent)throw new Error('Unknown Universal Quote Builder agent: '+agentKey);
  var record={runId:'UQB-AGENT-'+Utilities.getUuid(),agent:agent.key,agentName:agent.name,startingUser:owner.user&&owner.user.email||'',sourceRecords:[],inputSummary:boUniversalText_(inputSummary),outputSummary:boUniversalText_(outputSummary),confidence:'Not independently verified',warnings:Array.isArray(warnings)?warnings:[],proposedActions:[],approvedActions:[],rejectedActions:[],promptVersion:H38_UQB.VERSION,knowledgeVersion:'BUSINESS-KNOWLEDGE-PACK-ACTIVE',model:'Configured by H38 AI runtime',usage:'Recorded by runtime',externalActionsPerformed:false,createdTime:boNow_()};
  boProof_('UNIVERSAL QUOTE AGENT RUN','Agent Run',record.runId,'PASS',JSON.stringify(record),record.startingUser||'Authorized user');
  return record;
}
