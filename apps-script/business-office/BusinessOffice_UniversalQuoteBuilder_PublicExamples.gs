/**
 * Universal Quote Builder — matched public quote and CAD examples.
 *
 * Public routes are rendered only from the immutable H38 public demonstration
 * specification and repository-hosted CAD assets. They do not query, read, or
 * expose live customers, private Highway 38 records, internal cost, margin,
 * vendors, users, approvals, logs, or authenticated Business Office data.
 */
var H38_UQB_PUBLIC_EXAMPLE_PACKAGES=Object.freeze([
  Object.freeze({key:'preconstruction',sequence:1,title:'Preconstruction & General Notes',summary:'Planning, survey, permit, coordination, and project-control quote matched to the general notes and drawing index.',sheets:['G-001']}),
  Object.freeze({key:'framing',sequence:5,title:'Structural Framing & Architectural Plans',summary:'Weather-tight structural shell quote matched to coordinated floor plans, elevations, and building sections.',sheets:['A-101','A-102','A-201','A-301']}),
  Object.freeze({key:'interior',sequence:11,title:'Cabinets & Interior Finish Coordination',summary:'Interior millwork, cabinet, countertop, flooring, tile, and finish quote matched to the enlarged kitchen plan and elevations.',sheets:['A-401']}),
  Object.freeze({key:'plumbing',sequence:7,title:'New-Construction Plumbing',summary:'Complete plumbing quote matched to the plumbing plan, riser, fixture schedule, and routed services.',sheets:['P-101']}),
  Object.freeze({key:'electrical',sequence:8,title:'Electrical & Low Voltage',summary:'Electrical and low-voltage quote matched to the lighting, power, device, and panel-schedule sheet.',sheets:['E-101']}),
  Object.freeze({key:'hvac',sequence:9,title:'HVAC & Ventilation',summary:'Heating, cooling, ventilation, controls, and commissioning quote matched to the mechanical distribution plan.',sheets:['M-101']}),
  Object.freeze({key:'sitefinish',sequence:13,title:'Final Grading, Drainage & Landscaping',summary:'Final site-completion quote matched to the site, deck, concrete, drainage, and landscape sheet.',sheets:['C-S-L-101']})
]);

function boUqbPublicExampleSpec_(key){
  var normalized=String(key||'').trim().toLowerCase();
  return H38_UQB_PUBLIC_EXAMPLE_PACKAGES.find(function(spec){return spec.key===normalized;})||null;
}

function boUqbPublicExampleData_(key){
  var packageSpec=boUqbPublicExampleSpec_(key);
  boAssert_(packageSpec,'Public example package not found.');
  var quoteSpec=H38_UQB_PUBLIC_DEMO.QUOTES.find(function(spec){return Number(spec.n)===Number(packageSpec.sequence);});
  boAssert_(quoteSpec,'Public example quote specification not found.');
  var quote={
    'Subquote ID':'PUBLIC-UQB-'+packageSpec.key.toUpperCase(),
    'Sequence':Number(quoteSpec.n),
    'Title':quoteSpec.title,
    'Customer Scope':quoteSpec.scope.join('\n'),
    'Customer Price':quoteSpec.total,
    'Customer Visible':'Yes',
    'Assumptions':quoteSpec.ass.join('\n'),
    'Exclusions':quoteSpec.ex.join('\n'),
    'Change Conditions':'Concealed conditions, utility conflicts, code deficiencies, changed selections, unavailable products, or work beyond the written scope require owner-reviewed change control.',
    'Completion Criteria':'Written scope complete, deficiencies resolved, required evidence attached, and closeout requirements satisfied.',
    'Duration':quoteSpec.duration,
    'Deposit':quoteSpec.deposit,
    '_Package Key':packageSpec.key
  };
  boAssert_(quote['Customer Visible']==='Yes','Public example quote is not customer visible.');
  var items=quoteSpec.lines.map(function(line,index){return{
    'Sequence':index+1,
    'Description':line[0],
    'Quantity':line[1],
    'Unit':line[2],
    'Rate':line[3],
    'Final Price':line[4],
    'Customer Visible':'Yes'
  };});
  var drawings=H38_UQB_PUBLIC_DEMO.DRAWINGS.filter(function(drawing){return packageSpec.sheets.indexOf(drawing.n)>=0;}).sort(function(a,b){return packageSpec.sheets.indexOf(a.n)-packageSpec.sheets.indexOf(b.n);}).map(function(drawing){return{
    'Drawing ID':'PUBLIC-UQB-DRAW-'+drawing.n,
    'Sheet Number':drawing.n,
    'Drawing Title':drawing.title,
    'Drawing Type':drawing.type,
    'Classification':drawing.classification,
    'Current Revision':'E',
    'Review Status':drawing.review,
    'Asset URL':H38_UQB_PUBLIC_DEMO.ASSET_BASE+encodeURIComponent(drawing.asset)
  };});
  boAssert_(drawings.length===packageSpec.sheets.length,'Public example CAD set is incomplete.');
  return{
    project:{'Project Title':H38_UQB_PUBLIC_DEMO.PROJECT_TITLE,'Property / Site':H38_UQB_PUBLIC_DEMO.PROPERTY},
    spec:packageSpec,
    quote:quote,
    items:items,
    scopes:[{'Section Type':'customer_scope','Body':quoteSpec.scope.join('\n')}],
    drawings:drawings
  };
}

function boUqbPublicExampleBaseUrl_(){return boUqbPublicDemoBaseUrl_();}
function boUqbPublicExampleMoney_(value){return boUqbPublicDemoMoney_(value);}
function boUqbPublicExampleEscape_(value){return boUqbPublicDemoEscape_(value);}
function boUqbPublicExampleUrl_(key,view){var url=boUqbPublicExampleBaseUrl_()+'?publicUqbPackage='+encodeURIComponent(key);if(view)url+='&view='+encodeURIComponent(view);return url;}
function boUqbPublicExampleQuoteUrl_(quote){return boUqbPublicExampleUrl_(quote['_Package Key'],'quote');}
function boUqbPublicExampleDrawingUrl_(drawing){return drawing['Asset URL'];}

function boRenderUniversalPublicExamples_(){
  var e=boUqbPublicExampleEscape_,base=boUqbPublicExampleBaseUrl_();
  var packages=H38_UQB_PUBLIC_EXAMPLE_PACKAGES.map(function(spec){return boUqbPublicExampleData_(spec.key);});
  var html='<!doctype html><html><head><base target="_top"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Universal Quote Builder Public Examples</title><style>'+
  ':root{--n:#0b1f34;--g:#1f6b47;--o:#e85d18;--l:#d8e2dc;--s:#eef4f0}*{box-sizing:border-box}body{margin:0;background:#edf2f5;color:#142131;font:14px/1.5 Arial,sans-serif}.bar{position:sticky;top:0;z-index:5;background:var(--n);color:#fff;padding:12px 16px;display:flex;align-items:center;gap:12px}.bar strong{margin-right:auto}.bar a{background:#fff;color:var(--n);padding:9px 12px;border-radius:8px;text-decoration:none;font-weight:800}main{max-width:1180px;margin:auto;padding:18px}.overview,.example{background:#fff;border:1px solid var(--l);border-radius:18px;margin-bottom:18px;padding:20px}.overview{background:linear-gradient(135deg,#fff 0 72%,#eaf1f5 72%)}h1,h2,h3{color:var(--n)}h1{font-size:clamp(2rem,5vw,3.6rem);line-height:1.05;margin:.35em 0}.stamp{display:inline-block;border:3px solid #9d2525;color:#9d2525;font-weight:900;padding:6px 10px;transform:rotate(-2deg)}.overview-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:18px}.overview-grid div{background:var(--s);border-radius:12px;padding:14px}.overview-grid strong{display:block;color:var(--g);font-size:1.05rem}.public-note{border-left:5px solid var(--g);background:#e7f5ec;padding:12px 14px;margin-top:16px}.example-head{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:start}.price{font-size:1.7rem;font-weight:900;color:var(--g);white-space:nowrap}.preview{display:grid;grid-template-columns:1.2fr .8fr;gap:16px;margin-top:14px}.preview iframe{display:block;width:100%;aspect-ratio:17/11;border:1px solid #111;background:#fff}.sheet-list{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}.sheet-list span{background:var(--s);border:1px solid var(--l);border-radius:999px;padding:5px 9px;font-weight:800}.actions{display:grid;gap:9px;margin-top:14px}.actions a{display:block;border-radius:9px;padding:11px 13px;text-align:center;text-decoration:none;font-weight:900;background:var(--n);color:#fff}.actions a:nth-child(2){background:#fff;color:var(--n);border:2px solid var(--n)}.actions a:nth-child(3){background:var(--o)}.review{font-size:12px;color:#52636c}.notice{border-left:5px solid var(--o);background:#fff4e7;padding:11px 13px;margin-top:12px}@media(max-width:800px){.overview-grid,.preview,.example-head{grid-template-columns:1fr}.price{white-space:normal}}</style></head><body>';
  html+='<div class="bar"><strong>Universal Quote Builder — Public Examples</strong><a href="'+e(base+'?publicUqbDemo=1')+'">Examples overview</a></div><main>';
  html+='<section class="overview"><span class="stamp">PUBLIC DEMONSTRATION — NOT A CONTRACT</span><h1>Complete quotes matched to coordinated CAD sheets</h1><p>This public example library connects each customer-facing quote with the drawings used to define, price, coordinate, and review that scope.</p><div class="overview-grid"><div><strong>1. Review the quote</strong>Open the full scope, itemized price, assumptions, exclusions, changes, and completion requirements.</div><div><strong>2. Review the CAD sheets</strong>Open every full-size drawing assigned to that quote example.</div><div><strong>3. Keep the package together</strong>Print or save the complete matched quote-and-drawing package as one file.</div></div><div class="public-note"><strong>Public examples only:</strong> These pages use the fixed public demonstration specification and public CAD assets only. No live customers, private Highway 38 records, internal costs, margins, vendors, users, approvals, logs, or authenticated Business Office data are read or displayed.</div></section>';
  html+='<h2>Matched quote and CAD examples</h2>';
  packages.forEach(function(pkg,index){var first=pkg.drawings[0];html+='<article class="example" id="example-'+e(pkg.spec.key)+'"><div class="example-head"><div><span class="stamp">EXAMPLE '+String(index+1).padStart(2,'0')+'</span><h2>'+e(pkg.spec.title)+'</h2><p>'+e(pkg.spec.summary)+'</p></div><div class="price">'+boUqbPublicExampleMoney_(pkg.quote['Customer Price'])+'</div></div><div class="preview"><div><iframe loading="lazy" title="'+e(first['Sheet Number']+' '+first['Drawing Title'])+'" src="'+e(boUqbPublicExampleDrawingUrl_(first))+'"></iframe><div class="sheet-list">';pkg.drawings.forEach(function(d){html+='<span>'+e(d['Sheet Number'])+'</span>';});html+='</div><p class="review">'+e(pkg.drawings.length===1?pkg.drawings[0]['Drawing Title']:pkg.drawings.length+' coordinated CAD sheets included')+'</p></div><aside><h3>Complete public package</h3><p><strong>Quote:</strong> '+e(pkg.quote.Title)+'</p><p><strong>CAD:</strong> '+pkg.drawings.map(function(d){return e(d['Sheet Number']+' — '+d['Drawing Title']);}).join('<br>')+'</p><div class="actions"><a href="'+e(boUqbPublicExampleQuoteUrl_(pkg.quote))+'" target="_blank" rel="noopener">View full quote</a><a href="'+e(boUqbPublicExampleUrl_(pkg.spec.key,'cad'))+'" target="_blank" rel="noopener">View full-size CAD sheets</a><a href="'+e(boUqbPublicExampleUrl_(pkg.spec.key,'package'))+'" target="_blank" rel="noopener">Print / save complete package</a></div></aside></div><div class="notice"><strong>Demonstration control:</strong> Actual work requires verified measurements, selections, current pricing, field conditions, applicable licensed-professional review, permits, and authorized approval.</div></article>';});
  html+='</main><script>function sendHeight(){try{parent.postMessage({type:"h38-uqb-demo-height",height:document.documentElement.scrollHeight},"*")}catch(e){}}addEventListener("load",sendHeight);addEventListener("resize",sendHeight);new ResizeObserver(sendHeight).observe(document.body);</script></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('Universal Quote Builder Public Examples').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport','width=device-width,initial-scale=1');
}

function boUqbPublicExampleSafeSvg_(drawing){
  var response=UrlFetchApp.fetch(drawing['Asset URL'],{muteHttpExceptions:true,followRedirects:true});
  boAssert_(response.getResponseCode()===200,'Public CAD asset could not be loaded: '+drawing['Sheet Number']);
  var svg=response.getContentText('UTF-8');
  boAssert_(/^\s*<svg[\s>]/i.test(svg),'Public CAD asset is not valid SVG.');
  return svg.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/\son\w+\s*=\s*(["']).*?\1/gi,'');
}

function boRenderUniversalPublicExamplePackage_(packageKey,view){
  var pkg=boUqbPublicExampleData_(packageKey),e=boUqbPublicExampleEscape_,mode=String(view||'package').toLowerCase(),cadOnly=mode==='cad',quoteOnly=mode==='quote',scope=pkg.scopes.find(function(row){return row['Section Type']==='customer_scope';});
  var html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+e(pkg.spec.title)+'</title><style>'+
  '@page quote{size:letter portrait;margin:.45in}@page cad{size:17in 11in landscape;margin:.2in}*{box-sizing:border-box}body{margin:0;background:#edf2f5;color:#142131;font:13px/1.45 Arial,sans-serif}.bar{position:sticky;top:0;z-index:10;background:#0b1f34;color:#fff;padding:12px 16px;display:flex;align-items:center;gap:12px}.bar strong{margin-right:auto}.bar button{border:0;border-radius:8px;background:#e85d18;color:#fff;padding:9px 12px;font-weight:900;cursor:pointer}.quote-page,.cad-sheet{background:#fff;margin:18px auto;border:1px solid #d8e2dc;box-shadow:0 12px 30px rgba(11,31,52,.12)}.quote-page{page:quote;max-width:8.5in;min-height:10.5in;padding:.45in}.cad-sheet{page:cad;max-width:17in;padding:.18in;break-before:page}.cad-sheet svg{display:block;width:100%;height:auto}.stamp{display:inline-block;border:3px solid #9d2525;color:#9d2525;font-weight:900;padding:6px 10px;transform:rotate(-2deg)}h1,h2,h3{color:#0b1f34}.price{font-size:2rem;color:#1f6b47;font-weight:900}.grid{display:grid;grid-template-columns:1.35fr .85fr;gap:16px}.box{border:1px solid #d8e2dc;border-radius:8px;padding:11px;margin:10px 0}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #d8e2dc;padding:7px;text-align:left}th{background:#0b1f34;color:#fff}td:last-child,th:last-child{text-align:right}.notice{background:#fff3df;border-left:5px solid #e85d18;padding:10px}.sheet-title{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:8px}.sheet-title h2{margin:0}@media(max-width:800px){.grid{grid-template-columns:1fr}.quote-page,.cad-sheet{margin:0;border:0;box-shadow:none}}@media print{body{background:#fff}.bar{display:none}.quote-page,.cad-sheet{margin:0;border:0;box-shadow:none}.cad-sheet{break-before:page}}</style></head><body><div class="bar"><strong>'+e(pkg.spec.title)+'</strong><button onclick="window.print()">Print / Save PDF</button></div>';
  if(!cadOnly){html+='<main class="quote-page"><span class="stamp">PUBLIC DEMONSTRATION — NOT A CONTRACT</span><h1>'+e(pkg.quote.Title)+'</h1><p>'+e(pkg.project['Project Title'])+' · '+e(pkg.project['Property / Site'])+'</p><div class="price">'+boUqbPublicExampleMoney_(pkg.quote['Customer Price'])+'</div><div class="grid"><section><div class="box"><h2>Complete included scope</h2><p>'+e(scope?scope.Body:pkg.quote['Customer Scope']).replace(/\n/g,'<br>')+'</p></div><div class="box"><h2>Itemized price</h2><table><thead><tr><th>Description</th><th>Quantity</th><th>Rate</th><th>Amount</th></tr></thead><tbody>';pkg.items.forEach(function(item){html+='<tr><td>'+e(item.Description)+'</td><td>'+e(item.Quantity+' '+item.Unit)+'</td><td>'+boUqbPublicExampleMoney_(item.Rate)+'</td><td>'+boUqbPublicExampleMoney_(item['Final Price'])+'</td></tr>';});html+='<tr><td colspan="3"><strong>Total</strong></td><td><strong>'+boUqbPublicExampleMoney_(pkg.quote['Customer Price'])+'</strong></td></tr></tbody></table></div><div class="box"><h2>Completion deliverables</h2><p>'+e(pkg.quote['Completion Criteria'])+'</p></div></section><aside><div class="box"><h3>Matched CAD sheets</h3><p>'+pkg.drawings.map(function(d){return e(d['Sheet Number']+' — '+d['Drawing Title']);}).join('<br>')+'</p></div><div class="box"><h3>Schedule and payment</h3><p>'+e(pkg.quote.Duration)+'<br>'+e(pkg.quote.Deposit)+'</p></div><div class="box"><h3>Assumptions</h3><p>'+e(pkg.quote.Assumptions).replace(/\n/g,'<br>')+'</p></div><div class="box"><h3>Exclusions</h3><p>'+e(pkg.quote.Exclusions).replace(/\n/g,'<br>')+'</p></div><div class="box"><h3>Change conditions</h3><p>'+e(pkg.quote['Change Conditions'])+'</p></div></aside></div><div class="notice"><strong>Public example only:</strong> This package is rendered from the fixed public demonstration specification and public CAD assets. No private H38 records or authenticated Business Office data are read. Actual work requires verification and authorized approval.</div></main>';}
  if(!quoteOnly){pkg.drawings.forEach(function(d){html+='<section class="cad-sheet"><div class="sheet-title"><h2>'+e(d['Sheet Number'])+' — '+e(d['Drawing Title'])+'</h2><span>Revision '+e(d['Current Revision'])+'</span></div>'+boUqbPublicExampleSafeSvg_(d)+'</section>';});}
  html+='</body></html>';
  return HtmlService.createHtmlOutput(html).setTitle(pkg.spec.title+' — Public Demonstration').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport','width=device-width,initial-scale=1');
}
