/**
 * Direct-record publication fallback for the Office-generated UQB demo.
 *
 * Google currently denies the repository credential's Apps Script Execution
 * API call even though the same credential may pull, push, version, and deploy
 * the existing H38 project. This file does not create another application or
 * data store. It lets the public renderer use the deterministic, verified H38
 * Business Office records written to the existing Core Data workbook.
 */

function boUqbPublicDemoDirectProjectId_(runKey){
  return boUqbPublicDemoId_(boUniversalRunKey_(runKey||H38_UQB_PUBLIC_DEMO.RUN_KEY),'PROJECT');
}

function boUqbPublicDemoDirectDocumentPrefix_(runKey){
  return ['H38','UQB','PUBLIC',boUniversalRunKey_(runKey||H38_UQB_PUBLIC_DEMO.RUN_KEY),'DOC'].join('-')+'-';
}

/** Override the property-only status check with a deterministic Office-record check. */
function boUqbPublicDemoStatus_(runKey){
  var key=boUniversalRunKey_(runKey||H38_UQB_PUBLIC_DEMO.RUN_KEY);
  var projectId=boUqbPublicDemoDirectProjectId_(key);
  var project=boUqbPublicDemoFind_('PROJECTS',projectId);
  var subs=boUniversalReadRows_('SUBQUOTES').filter(function(row){return row['Project ID']===projectId;});
  var items=boUniversalReadRows_('ITEMS').filter(function(row){return row['Project ID']===projectId;});
  var scopes=boUniversalReadRows_('SCOPES').filter(function(row){return row['Project ID']===projectId;});
  var drawings=boUniversalReadRows_('DRAWINGS').filter(function(row){return row['Project ID']===projectId&&row['File ID'];});
  var documentPrefix=boUqbPublicDemoDirectDocumentPrefix_(key);
  var docs=boReadTable_(H38_BO_SHEETS.DOCUMENTS,{includeVoided:true}).filter(function(row){
    return String(row['Document ID']||'').indexOf(documentPrefix)===0 && row['Is Voided']!=='Yes';
  });
  var published=!!(project&&project.Status==='Demonstration'&&project['Run Key']===key);
  var expected={project:1,subquotes:14,items:56,scopes:84,drawings:10,documents:15,published:1};
  var counts={project:project?1:0,subquotes:subs.length,items:items.length,scopes:scopes.length,drawings:drawings.length,documents:docs.length,published:published?1:0};
  var complete=Object.keys(expected).every(function(name){return counts[name]>=expected[name];});
  var completedUnits=0,totalUnits=0;
  Object.keys(expected).forEach(function(name){completedUnits+=Math.min(counts[name],expected[name]);totalUnits+=expected[name];});
  return {status:complete?'PASS':'PARTIAL',complete:complete,runKey:key,projectId:projectId,counts:counts,expected:expected,progressPercent:Math.round(completedUnits/totalUnits*100),publicUrl:'?publicUqbDemo=1',sourceOfTruth:'H38 Business Office Core Data',publicationMode:'deterministic Office records',externalActionsPerformed:false};
}

/** Use the deterministic project when a script-property pointer is unavailable. */
function boUqbPublicDemoActive_(){
  var propertyId=PropertiesService.getScriptProperties().getProperty(H38_UQB_PUBLIC_DEMO.PROPERTY_PROJECT);
  var deterministicId=boUqbPublicDemoDirectProjectId_(H38_UQB_PUBLIC_DEMO.RUN_KEY);
  var candidates=[propertyId,deterministicId].filter(function(value,index,array){return value&&array.indexOf(value)===index;});
  var project=null;
  for(var index=0;index<candidates.length&&!project;index+=1){
    var candidate=boUqbPublicDemoFind_('PROJECTS',candidates[index]);
    if(candidate&&candidate.Status==='Demonstration'&&candidate['Run Key']===H38_UQB_PUBLIC_DEMO.RUN_KEY)project=candidate;
  }
  boAssert_(project,'The Office-generated public demo has not been published yet.');
  return project;
}

function boUqbPublicDemoControlledAsset_(drawing){
  var marker=String(drawing['Preview File ID']||drawing['File ID']||'');
  if(marker.indexOf('PUBLIC-ASSET:')!==0)return '';
  var asset=marker.slice('PUBLIC-ASSET:'.length);
  var approved=H38_UQB_PUBLIC_DEMO.DRAWINGS.some(function(spec){return spec.asset===asset&&spec.n===drawing['Sheet Number'];});
  boAssert_(approved,'The drawing asset is not part of the approved Office demonstration set.');
  return asset;
}

/** Render the exact controlled CAD asset referenced by the Office drawing record. */
function boRenderUniversalPublicDrawing_(drawingId){
  var project=boUqbPublicDemoActive_();
  var drawing=boUniversalReadRows_('DRAWINGS').find(function(row){return row['Project ID']===project['Project ID']&&row['Drawing ID']===drawingId&&row['File ID'];});
  boAssert_(drawing,'Published drawing not found.');
  var asset=boUqbPublicDemoControlledAsset_(drawing);
  var svg='';
  if(asset){
    var response=UrlFetchApp.fetch(H38_UQB_PUBLIC_DEMO.ASSET_BASE+encodeURIComponent(asset),{muteHttpExceptions:true,followRedirects:true});
    boAssert_(response.getResponseCode()===200,'The controlled CAD asset is unavailable.');
    svg=response.getContentText('UTF-8');
  }else{
    svg=DriveApp.getFileById(drawing['File ID']).getBlob().getDataAsString('UTF-8');
  }
  boAssert_(/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg),'Published drawing file is not valid SVG.');
  svg=svg.replace(/<script[\s\S]*?<\/script>/gi,'');
  var title=boUqbPublicDemoEscape_(drawing['Sheet Number']+' — '+drawing['Drawing Title']);
  var html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+'</title><style>html,body{margin:0;background:#fff}svg{display:block;width:100%;height:auto}</style></head><body>'+svg+'</body></html>';
  return HtmlService.createHtmlOutput(html).setTitle(title).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport','width=device-width,initial-scale=1');
}
