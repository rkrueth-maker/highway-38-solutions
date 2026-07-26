/** Public-safe CSV feeds used only to populate the existing H38 Office demo rows. */
var H38_UQB_PUBLIC_DEMO_SEED=Object.freeze({
  CUSTOMER_ID:'CUST-H38-UQB-PUBLIC-DEMO-001',
  OWNER_ID:'USER-OWNER-001',
  CREATED_TIME:'2026-07-26 17:45:00',
  CORE_FILE_ID:'1kDDKWx9jfObWm8EmaXm5weDCTJbQ8RTf7-sq4RDEYlA'
});

function boUqbPublicDemoSeedCell_(value){
  if(value==null)return '';
  var text=String(value);
  return /[",\r\n]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;
}

function boUqbPublicDemoSeedCsv_(rows){
  return rows.map(function(row){return row.map(boUqbPublicDemoSeedCell_).join(',');}).join('\n');
}

function boUqbPublicDemoSeedBullet_(values){return (values||[]).join(' • ');}
function boUqbPublicDemoSeedProjectId_(){return boUqbPublicDemoId_(H38_UQB_PUBLIC_DEMO.RUN_KEY,'PROJECT');}
function boUqbPublicDemoSeedSubquoteId_(number){return boUqbPublicDemoId_(H38_UQB_PUBLIC_DEMO.RUN_KEY,'SUB',number);}
function boUqbPublicDemoSeedItemId_(number,line){return boUqbPublicDemoId_(H38_UQB_PUBLIC_DEMO.RUN_KEY,'ITEM',number+'-'+String(line).padStart(2,'0'));}
function boUqbPublicDemoSeedScopeId_(number,line){return boUqbPublicDemoId_(H38_UQB_PUBLIC_DEMO.RUN_KEY,'SCOPE',number+'-'+String(line).padStart(2,'0'));}
function boUqbPublicDemoSeedDrawingId_(sheet){return boUqbPublicDemoId_(H38_UQB_PUBLIC_DEMO.RUN_KEY,'DRAW',sheet);}

function boUqbPublicDemoSeedRows_(name){
  var seed=H38_UQB_PUBLIC_DEMO_SEED;
  var projectId=boUqbPublicDemoSeedProjectId_();
  var now=seed.CREATED_TIME;
  var owner=seed.OWNER_ID;
  var base=ScriptApp.getService().getUrl();
  if(name==='customers')return [[
    seed.CUSTOMER_ID,'H38','C-DEMO-PUBLIC-001','Universal Quote Demonstration — Public New House','Demonstration','',
    'uqb-public-demo@example.invalid','','','','Demonstration Only','Not Applicable','Hypothetical Demonstration; Public Safe',
    'Active','None','Public-safe Office customer for the published ground-up new-house demonstration. No external action.',now,now
  ]];
  if(name==='projects')return [[
    projectId,'H38',H38_UQB_PUBLIC_DEMO.RUN_KEY,seed.CUSTOMER_ID,'Universal Quote Demonstration — Public New House',
    H38_UQB_PUBLIC_DEMO.PROJECT_TITLE,H38_UQB_PUBLIC_DEMO.PROPERTY,5,'public_new_house',
    'Ground-up new-house construction beginning with survey, erosion control, lot clearing, grubbing, excavation, underground services, foundation, framing, trades, finishes, final grading, commissioning, and closeout.',
    '',1,'Current',H38_UQB_PUBLIC_DEMO.TOTAL,'','','','',
    'Preconstruction → lot clearing → earthwork → foundation → shell → trades → finishes → site completion → closeout',
    JSON.stringify([['Authorization',10],['Site and foundation',20],['Weather-tight shell',25],['Rough trades',20],['Finishes',20],['Closeout',5]]),'[]',
    'Hypothetical demonstration. Survey, soils, utility, code, permit, supplier, subcontractor, and field inputs require verification.',
    'Land purchase, financing, unverified concealed conditions, and work outside the written phase quotes.',
    'Field dimensions, soils, utilities, structural requirements, licensed-trade design, permits, selections, lead times, and site conditions require verification.',
    'Owner Approval Required','Office Demo Verified','Applicable licensed-professional and authority review required before regulated work.','Demonstration',owner,now,now,'No'
  ]];
  if(name==='revisions')return [[
    boUqbPublicDemoId_(H38_UQB_PUBLIC_DEMO.RUN_KEY,'REV'), 'H38',projectId,1,'Office-generated public new-house demonstration',
    JSON.stringify({projectTitle:H38_UQB_PUBLIC_DEMO.PROJECT_TITLE,total:H38_UQB_PUBLIC_DEMO.TOTAL,scope:'ground-up new-house construction from lot clearing through closeout'}),
    'Owner Approval Required',owner,now,'No'
  ]];
  if(name==='subquotes')return H38_UQB_PUBLIC_DEMO.QUOTES.map(function(spec,index){return [
    boUqbPublicDemoSeedSubquoteId_(spec.n),'H38',projectId,'','',index+1,'Construction Phase',spec.title,spec.key,
    boUqbPublicDemoSeedBullet_(spec.scope),
    'Coordinate this phase with the Office project record, drawings, predecessor/successor work, inspections, selections, schedule, purchasing controls, and completion evidence.',
    'Complete the written phase scope, approved drawings, manufacturer instructions, applicable code and inspections, and documented quality checks.',
    'Photos, measurements, inspection or test records, approved changes, product records, and completion signoff as applicable.',
    'Written phase scope complete, deficiencies resolved, required evidence attached, applicable inspections and startup complete, and owner-reviewed closeout recorded.',
    'Concealed conditions, utility conflicts, code deficiencies, changed selections, unavailable products, or work beyond the written scope require owner-reviewed change control.',
    boUqbPublicDemoSeedBullet_(spec.ass),boUqbPublicDemoSeedBullet_(spec.ex),'','',spec.total,'Yes','Yes',1,'Owner Approval Required','Demonstration',owner,now,now,'No'
  ];});
  if(name==='items'){
    var items=[];
    H38_UQB_PUBLIC_DEMO.QUOTES.forEach(function(spec){spec.lines.forEach(function(line,index){
      var method=String(line[2]).toLowerCase().indexOf('allowance')>=0?'allowance':'flat_rate_package';
      items.push([
        boUqbPublicDemoSeedItemId_(spec.n,index+1),'H38',projectId,boUqbPublicDemoSeedSubquoteId_(spec.n),index+1,
        method==='allowance'?'Allowance':'Labor and materials',line[0],line[1],line[2],method,line[3],'',
        line[1]===1?'approved phase line amount':'quantity × rate','PUBLIC-DEMO-2026-07-26',JSON.stringify({quantity:line[1],rate:line[3]}),'{}',line[4],line[4],
        'No','Yes','Office demonstration specification','No','','','[]','Demonstration',owner,now,now,'No'
      ]);
    });});
    return items;
  }
  if(name==='scopes'){
    var scopes=[];
    H38_UQB_PUBLIC_DEMO.QUOTES.forEach(function(spec){
      var sid=boUqbPublicDemoSeedSubquoteId_(spec.n);
      var sections=[
        ['customer_scope','Complete included scope',boUqbPublicDemoSeedBullet_(spec.scope)],
        ['internal_instruction','Internal coordination','Coordinate this phase with the Office project record, drawings, inspections, purchasing controls, schedule, predecessor/successor work, and adjacent trades.'],
        ['quality','Quality requirements','Verify work against the approved scope, manufacturer requirements, applicable code, inspections, and documented acceptance criteria.'],
        ['evidence','Evidence requirements','Attach required photos, dimensions, tests, inspections, product records, approved changes, and completion proof.'],
        ['completion','Deliverables and completion','Complete the phase, resolve deficiencies, attach warranties and manuals where applicable, and record owner-reviewed completion.'],
        ['change_condition','Change conditions','Hidden conditions, utility conflicts, code deficiencies, changed selections, unavailable products, or work outside the written scope require a written owner-reviewed change.']
      ];
      sections.forEach(function(section,index){scopes.push([
        boUqbPublicDemoSeedScopeId_(spec.n,index+1),'H38',projectId,sid,section[0],index+1,section[1],section[2],'[]','Owner Approval Required','Demonstration',owner,now,now,'No'
      ]);});
    });
    return scopes;
  }
  if(name==='drawings'){
    var tradeMap={G:'preconstruction',A:'framing',M:'hvac',P:'plumbing',E:'electrical',C:'sitefinish'};
    var quoteByKey={};H38_UQB_PUBLIC_DEMO.QUOTES.forEach(function(spec){quoteByKey[spec.key]=spec.n;});
    return H38_UQB_PUBLIC_DEMO.DRAWINGS.map(function(spec){
      var quoteNumber=quoteByKey[tradeMap[spec.n.charAt(0)]||'preconstruction'];
      var professional=/professional|permit/i.test(spec.classification)?'Yes':'No';
      return [
        boUqbPublicDemoSeedDrawingId_(spec.n),'H38',projectId,boUqbPublicDemoSeedSubquoteId_(quoteNumber),spec.n,spec.title,spec.type,spec.classification,
        'As noted on sheet','Imperial',seed.CORE_FILE_ID,'PUBLIC-ASSET:'+spec.asset,'E','2026-07-25',
        'Office drawing record references the controlled Revision E CAD asset displayed by the sanitized public renderer.',
        'Representative undeveloped lot and proposed residence; verify all actual conditions.','Highway 38 Solutions demonstration',spec.review,'Owner Approval Required',professional,
        'Yes','Yes','Demonstration',owner,now,now,'No'
      ];
    });
  }
  if(name==='drawing-revisions')return H38_UQB_PUBLIC_DEMO.DRAWINGS.map(function(spec){return [
    boUqbPublicDemoId_(H38_UQB_PUBLIC_DEMO.RUN_KEY,'DRAWREV',spec.n),'H38',boUqbPublicDemoSeedDrawingId_(spec.n),projectId,'','E',
    'Office-linked coordinated new-house CAD demonstration sheet',seed.CORE_FILE_ID,'Yes','Yes','Needs Professional / Field Review','Owner Approval Required','',owner,now,'No'
  ];});
  if(name==='documents'){
    var documents=H38_UQB_PUBLIC_DEMO.QUOTES.map(function(spec){
      var sid=boUqbPublicDemoSeedSubquoteId_(spec.n),documentId=boUqbPublicDemoId_(H38_UQB_PUBLIC_DEMO.RUN_KEY,'DOC','QUOTE-'+spec.n);
      return [documentId,'H38',seed.CORE_FILE_ID,base+'?publicUqbQuote='+encodeURIComponent(sid),spec.n+' — '+spec.title+' — Printable Office Demo.html','text/html','',documentId,
        'UQB Subquote',sid,'UQB Demonstration Quote Print View','','','Generated','Not Required — Generated','Owner Review Required','Owner Approval Required','Not Posted','Public Demo View',
        'H38|UQB|PUBLIC|QUOTE|'+spec.n,'Yes','No','Public Demonstration Source',owner,now,now];
    });
    var combinedId=boUqbPublicDemoId_(H38_UQB_PUBLIC_DEMO.RUN_KEY,'DOC','COMBINED');
    documents.push([combinedId,'H38',seed.CORE_FILE_ID,base+'?publicUqbDemo=1','Complete New-House Quote and CAD Register — Office Demo.html','text/html','',combinedId,
      'UQB Project',projectId,'UQB Combined Demonstration Package','','','Generated','Not Required — Generated','Owner Review Required','Owner Approval Required','Not Posted','Public Demo View',
      'H38|UQB|PUBLIC|COMBINED','Yes','No','Public Demonstration Source',owner,now,now]);
    return documents;
  }
  if(name==='proof')return [[
    'PROOF-H38-UQB-PUBLIC-DEMO-001','H38',now,'rkrueth@gmail.com','Business Office','Project',projectId,'PUBLISH UQB PUBLIC DEMO','PUBLISH UQB PUBLIC DEMO','PASS',
    JSON.stringify({project:1,subquotes:14,items:56,scopes:84,drawings:10,documents:15,published:1,externalActionsPerformed:false}),
    'Persistent Office records published through deterministic sanitized routes. No customer send, purchase, payment, scheduling, approval, or work authorization.'
  ]];
  throw new Error('Unsupported public Office demo seed: '+name);
}

function boRenderUniversalPublicSeed_(name){
  var allowed=['customers','projects','revisions','subquotes','items','scopes','drawings','drawing-revisions','documents','proof'];
  boAssert_(allowed.indexOf(name)>=0,'Unsupported public Office demo seed.');
  return ContentService.createTextOutput(boUqbPublicDemoSeedCsv_(boUqbPublicDemoSeedRows_(name))).setMimeType(ContentService.MimeType.CSV);
}
