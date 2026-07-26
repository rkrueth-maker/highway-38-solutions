/**
 * Universal Quote Builder — deterministic published Office record adapter.
 *
 * The existing H38 Business Office Core Data workbook is the source of truth.
 * This late-loaded adapter selects the published demonstration project and
 * renders only customer-visible quote, item, scope, and drawing fields.
 * Internal cost, margin, vendors, users, approvals, logs, and unrelated
 * customer records are never returned by these public routes.
 */
var H38_UQB_OFFICE_PUBLIC=Object.freeze({
  RUN_KEY:'PUBLIC-NEW-HOUSE-DEMO-V1',
  PROJECT_ID:'H38-UQB-PUBLIC-PUBLIC-NEW-HOUSE-DEMO-V1-PROJECT-001',
  DOCUMENT_PREFIX:'H38-UQB-PUBLIC-PUBLIC-NEW-HOUSE-DEMO-V1-DOC-',
  CORE_FILE_ID:'1kDDKWx9jfObWm8EmaXm5weDCTJbQ8RTf7-sq4RDEYlA'
});

function boUqbOfficePublicAsset_(drawing){
  var marker=String(drawing&&drawing['Preview File ID']||'');
  boAssert_(marker.indexOf('PUBLIC-ASSET:')===0,'The Office drawing record does not reference an approved public CAD asset.');
  var asset=marker.slice('PUBLIC-ASSET:'.length);
  var approved=H38_UQB_PUBLIC_DEMO.DRAWINGS.some(function(spec){
    return spec.asset===asset&&spec.n===drawing['Sheet Number'];
  });
  boAssert_(approved,'The Office drawing record references an unapproved CAD asset.');
  return asset;
}

function boUqbOfficePublicSvg_(drawing){
  boAssert_(drawing&&drawing['Project ID']===H38_UQB_OFFICE_PUBLIC.PROJECT_ID,'The drawing is not part of the published Office demonstration.');
  boAssert_(drawing.Status==='Demonstration'&&drawing['Is Voided']!=='Yes','The published drawing is unavailable.');
  var asset=boUqbOfficePublicAsset_(drawing);
  var response=UrlFetchApp.fetch(H38_UQB_PUBLIC_DEMO.ASSET_BASE+encodeURIComponent(asset),{muteHttpExceptions:true,followRedirects:true});
  boAssert_(response.getResponseCode()===200,'The approved CAD asset is unavailable: '+drawing['Sheet Number']);
  var svg=response.getContentText('UTF-8');
  boAssert_(/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg),'The approved CAD asset is not valid SVG.');
  return svg.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/\son\w+\s*=\s*(["']).*?\1/gi,'');
}

boUqbPublicDemoStatus_=function(runKey){
  var key=boUniversalRunKey_(runKey||H38_UQB_OFFICE_PUBLIC.RUN_KEY);
  var projectId=H38_UQB_OFFICE_PUBLIC.PROJECT_ID;
  var project=boUqbPublicDemoFind_('PROJECTS',projectId);
  var subquotes=boUniversalReadRows_('SUBQUOTES').filter(function(row){return row['Project ID']===projectId&&row.Status==='Demonstration'&&row['Is Voided']!=='Yes';});
  var items=boUniversalReadRows_('ITEMS').filter(function(row){return row['Project ID']===projectId&&row.Status==='Demonstration'&&row['Is Voided']!=='Yes';});
  var scopes=boUniversalReadRows_('SCOPES').filter(function(row){return row['Project ID']===projectId&&row.Status==='Demonstration'&&row['Is Voided']!=='Yes';});
  var drawings=boUniversalReadRows_('DRAWINGS').filter(function(row){return row['Project ID']===projectId&&row.Status==='Demonstration'&&row['Is Voided']!=='Yes'&&row['File ID'];});
  var documents=boReadTable_(H38_BO_SHEETS.DOCUMENTS,{includeVoided:true}).filter(function(row){return String(row['Document ID']||'').indexOf(H38_UQB_OFFICE_PUBLIC.DOCUMENT_PREFIX)===0&&row['Is Voided']!=='Yes';});
  var published=!!(project&&project['Run Key']===key&&project.Status==='Demonstration'&&project['Is Voided']!=='Yes');
  var expected={project:1,subquotes:14,items:56,scopes:84,drawings:10,documents:15,published:1};
  var counts={project:project?1:0,subquotes:subquotes.length,items:items.length,scopes:scopes.length,drawings:drawings.length,documents:documents.length,published:published?1:0};
  var complete=Object.keys(expected).every(function(name){return counts[name]===expected[name];});
  var completed=0,total=0;
  Object.keys(expected).forEach(function(name){completed+=Math.min(counts[name],expected[name]);total+=expected[name];});
  return{status:complete?'PASS':'PARTIAL',complete:complete,runKey:key,projectId:projectId,counts:counts,expected:expected,progressPercent:Math.round(completed/total*100),sourceOfTruth:'H38 Business Office Core Data',publicationMode:'verified Office records',externalActionsPerformed:false};
};

boUqbPublicDemoActive_=function(){
  var project=boUqbPublicDemoFind_('PROJECTS',H38_UQB_OFFICE_PUBLIC.PROJECT_ID);
  boAssert_(project&&project['Run Key']===H38_UQB_OFFICE_PUBLIC.RUN_KEY&&project.Status==='Demonstration'&&project['Is Voided']!=='Yes','The Office-generated public demonstration is unavailable.');
  var status=boUqbPublicDemoStatus_(H38_UQB_OFFICE_PUBLIC.RUN_KEY);
  boAssert_(status.complete,'The Office-generated public demonstration is incomplete.');
  return project;
};

boRenderUniversalPublicDrawing_=function(drawingId){
  var project=boUqbPublicDemoActive_();
  var drawing=boUniversalReadRows_('DRAWINGS').find(function(row){
    return row['Project ID']===project['Project ID']&&row['Drawing ID']===drawingId&&row.Status==='Demonstration'&&row['Is Voided']!=='Yes';
  });
  boAssert_(drawing,'Published Office drawing not found.');
  var svg=boUqbOfficePublicSvg_(drawing);
  var title=boUqbPublicDemoEscape_(drawing['Sheet Number']+' — '+drawing['Drawing Title']);
  var html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+'</title><style>html,body{margin:0;background:#fff}svg{display:block;width:100%;height:auto}</style></head><body>'+svg+'</body></html>';
  return HtmlService.createHtmlOutput(html).setTitle(title).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport','width=device-width,initial-scale=1');
};
