/**
 * Quote Builder public capability examples inside the existing H38 Business Office.
 *
 * These records are presentation-only capability definitions. They do not create
 * customers, quotes, jobs, approvals, purchases, payments, schedules, or work
 * authorizations. The house example remains the fully published Office-backed
 * demonstration project.
 */
var H38_UQB_BUSINESS_OFFICE_WORKFLOW=Object.freeze([
  Object.freeze({key:'intake',sequence:1,name:'Intake',description:'Capture the request, customer facts, photos, notes, specifications, and desired result.'}),
  Object.freeze({key:'measure',sequence:2,name:'Measure',description:'Record dimensions, quantities, site conditions, marked photos, and verified quantity sources.'}),
  Object.freeze({key:'plan',sequence:3,name:'Plan',description:'Define alternatives, layouts, drawings, materials, trades, risks, and decisions.'}),
  Object.freeze({key:'quote',sequence:4,name:'Quote',description:'Build the itemized price, scope, assumptions, exclusions, options, terms, and matched documents.'}),
  Object.freeze({key:'approve',sequence:5,name:'Approve',description:'Keep owner review, customer acceptance, technical review, and release controls visible.'}),
  Object.freeze({key:'guide',sequence:6,name:'Guide',description:'Turn approved scope into instructions, checklists, purchasing needs, and job guidance.'}),
  Object.freeze({key:'execute',sequence:7,name:'Execute',description:'Track work, vendors, tasks, inspections, changes, and controlled completion activity.'}),
  Object.freeze({key:'prove',sequence:8,name:'Prove',description:'Attach photos, readings, documents, inspection results, and completion evidence.'}),
  Object.freeze({key:'close',sequence:9,name:'Close',description:'Complete invoice support, closeout, handoff, actual review, and reusable business knowledge.'})
]);

var H38_UQB_PUBLIC_CAPABILITY_EXAMPLES=Object.freeze([
  Object.freeze({key:'flower',title:'Flower Garden Transformation',business:'Landscape',amount:3950,level:3,summary:'Measured garden-bed renovation with before-and-after photos, quantities, natural-stone edging, planting scope, cleanup, proof, and closeout.',publicPath:'flower-garden-quote-complete.html',officeMode:'Capability example',workflow:['intake','measure','plan','quote','approve','guide','execute','prove','close'],capabilities:['Before/after photos','Measured quantities','Itemized quote','Scope and cleanup','Completion proof']}),
  Object.freeze({key:'driveway',title:'Class 5 Driveway',business:'Site work',amount:6425,level:3,summary:'Site measurements, drainage assumptions, aggregate quantities, equipment, quote lines, inspections, proof, and closeout.',publicPath:'contractor-quote-complete.html?example=drive',officeMode:'Capability example',workflow:['intake','measure','plan','quote','approve','guide','execute','prove','close'],capabilities:['Site measurements','Drainage assumptions','Material quantities','Equipment planning','Inspection proof']}),
  Object.freeze({key:'pond',title:'Backyard Pond & Water Feature',business:'Landscape / water feature',amount:9875,level:5,summary:'Excavation, liner, pump, stone, planting, electrical coordination, startup, testing, owner guidance, and closeout.',publicPath:'contractor-quote-complete.html?example=pond',officeMode:'Capability example',workflow:['intake','measure','plan','quote','approve','guide','execute','prove','close'],capabilities:['Multi-system scope','Equipment selection','Electrical coordination','Startup testing','Owner handoff']}),
  Object.freeze({key:'clear',title:'Lot Clearing & Grading',business:'Site work',amount:5950,level:3,summary:'Clearing limits, grubbing, grading, erosion control, equipment, disposal, field proof, and acceptance.',publicPath:'contractor-quote-complete.html?example=clear',officeMode:'Capability example',workflow:['intake','measure','plan','quote','approve','guide','execute','prove','close'],capabilities:['Defined work limits','Equipment and disposal','Erosion controls','Field evidence','Acceptance criteria']}),
  Object.freeze({key:'deck',title:'8′ × 12′ Pressure-Treated Deck',business:'Carpentry',amount:5842,level:3,summary:'Footings, framing, decking, stairs, railing, drawings, inspection points, options, and DIY guidance.',publicPath:'contractor-quote-complete.html?example=deck',officeMode:'Capability example',workflow:['intake','measure','plan','quote','approve','guide','execute','prove','close'],capabilities:['Measured layout','Material takeoff','Construction drawings','Inspection points','Guided execution']}),
  Object.freeze({key:'irrigation',title:'Four-Zone Irrigation System',business:'Irrigation',amount:3642.50,level:4,summary:'Flow test, hydraulic layout, four zones, controls, testing, commissioning, and as-built records.',publicPath:'contractor-quote-complete.html?example=irrigation',officeMode:'Capability example',workflow:['intake','measure','plan','quote','approve','guide','execute','prove','close'],capabilities:['Flow verification','Hydraulic planning','Zone quantities','Commissioning','As-built records']}),
  Object.freeze({key:'kitchen',title:'Mid-Range Kitchen Remodel',business:'Remodeling',amount:18765,level:5,summary:'Demolition, cabinets, countertops, plumbing, electrical, finishes, allowances, commissioning, and coordinated closeout.',publicPath:'contractor-quote-complete.html?example=kitchen',officeMode:'Capability example',workflow:['intake','measure','plan','quote','approve','guide','execute','prove','close'],capabilities:['Multi-trade coordination','Allowances and options','Drawing support','Schedule controls','Commissioning']}),
  Object.freeze({key:'cabin',title:'Uncleared Lot to 3-Bedroom Cabin',business:'Whole-building project',amount:572550,level:5,summary:'The full Office-generated demonstration coordinates plans, clearing, driveway, well, septic, permits, structure, every trade, matched quotes, CAD, documents, proof, and closeout.',publicPath:'cabin-project-complete.html',officeMode:'Published Office demonstration',workflow:['intake','measure','plan','quote','approve','guide','execute','prove','close'],capabilities:['Persistent Office project','Fourteen phase quotes','Ten coordinated CAD sheets','Documents and proof','Full closeout workflow']})
]);

function boUniversalBusinessOfficeWorkflow_(){
  return H38_UQB_BUSINESS_OFFICE_WORKFLOW.map(function(stage){
    return{key:stage.key,sequence:stage.sequence,name:stage.name,description:stage.description};
  });
}

function boUniversalPublicCapabilityExamples_(){
  return H38_UQB_PUBLIC_CAPABILITY_EXAMPLES.map(function(example){
    return{
      key:example.key,title:example.title,business:example.business,amount:example.amount,
      level:example.level,summary:example.summary,publicPath:example.publicPath,
      officeMode:example.officeMode,workflow:example.workflow.slice(),
      capabilities:example.capabilities.slice()
    };
  });
}

var boUniversalQuoteCatalogBeforeCapabilityExamples_=boUniversalQuoteCatalog_;
boUniversalQuoteCatalog_=function(){
  var catalog=boUniversalQuoteCatalogBeforeCapabilityExamples_();
  catalog.businessOfficeWorkflow=boUniversalBusinessOfficeWorkflow_();
  catalog.publicCapabilityExamples=boUniversalPublicCapabilityExamples_();
  catalog.publicExamplesBaseUrl='https://rkrueth-maker.github.io/highway-38-solutions/';
  catalog.capabilityExampleControls={
    presentationOnly:true,
    publishedOfficeExampleKey:'cabin',
    publicExampleCount:H38_UQB_PUBLIC_CAPABILITY_EXAMPLES.length,
    workflowStageCount:H38_UQB_BUSINESS_OFFICE_WORKFLOW.length,
    externalActionsPerformed:false
  };
  return catalog;
};
