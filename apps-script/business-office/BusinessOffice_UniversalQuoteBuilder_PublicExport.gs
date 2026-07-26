/**
 * Sanitized static export for the public Universal Quote Builder demonstration.
 * This function is Owner-only and returns customer-facing fields derived from
 * the published H38 Business Office demo records. Private record IDs, Drive
 * IDs, internal costs, margins, vendors, users, approvals, and logs are never
 * included in the returned object.
 */
function boUniversalPublicDemoExport(){
  var owner=boRequireOwner_();
  boUniversalEnsureStore_();
  var data=boUqbPublicDemoRows_();
  var project=data.project;
  var projectId=project['Project ID'];
  var quoteSpecs={};
  var drawingSpecs={};
  H38_UQB_PUBLIC_DEMO.QUOTES.forEach(function(spec){quoteSpecs[String(spec.n)]=spec;});
  H38_UQB_PUBLIC_DEMO.DRAWINGS.forEach(function(spec){drawingSpecs[spec.n]=spec;});
  var documents=boReadTable_(H38_BO_SHEETS.DOCUMENTS,{includeVoided:true}).filter(function(row){
    return row['Project ID']===projectId && /UQB.*Demonstration|UQB Combined/.test(row['Document Type']||'') && row['Is Voided']!=='Yes';
  });
  var scopesBySubquote={};
  data.scopes.forEach(function(row){
    var key=row['Subquote ID'];
    if(!scopesBySubquote[key])scopesBySubquote[key]={};
    scopesBySubquote[key][row['Section Type']]={title:row.Title||'',body:row.Body||''};
  });
  var itemsBySubquote={};
  data.items.forEach(function(row){
    var key=row['Subquote ID'];
    if(!itemsBySubquote[key])itemsBySubquote[key]=[];
    itemsBySubquote[key].push({
      sequence:Number(row.Sequence||0),
      category:row.Category||'',
      description:row.Description||'',
      quantity:Number(row.Quantity||0),
      unit:row.Unit||'',
      pricingMethod:row['Pricing Method']||'',
      rate:Number(row.Rate||0),
      amount:Number(row['Final Price']||0),
      sourceStatus:row['Source Status']||''
    });
  });
  Object.keys(itemsBySubquote).forEach(function(key){itemsBySubquote[key].sort(function(a,b){return a.sequence-b.sequence;});});
  var quotes=data.subquotes.map(function(row){
    var sequence=String(Number(row.Sequence||0)).padStart(2,'0');
    var spec=quoteSpecs[sequence]||{};
    var sourceId=row['Subquote ID'];
    var quoteDocument=documents.some(function(doc){return doc['Source Type']==='UQB Subquote'&&doc['Source ID']===sourceId;});
    return {
      sequence:Number(row.Sequence||0),
      number:sequence,
      title:row.Title||'',
      phaseKey:row['Area / System / Trade / Phase / Assembly']||'',
      total:Number(row['Customer Price']||0),
      schedule:spec.duration||'',
      payment:spec.deposit||'',
      scope:(scopesBySubquote[sourceId]&&scopesBySubquote[sourceId].customer_scope&&scopesBySubquote[sourceId].customer_scope.body)||row['Customer Scope']||'',
      internalCoordination:(scopesBySubquote[sourceId]&&scopesBySubquote[sourceId].internal_instruction&&scopesBySubquote[sourceId].internal_instruction.body)||'',
      qualityRequirements:(scopesBySubquote[sourceId]&&scopesBySubquote[sourceId].quality&&scopesBySubquote[sourceId].quality.body)||row['Quality Requirements']||'',
      evidenceRequirements:(scopesBySubquote[sourceId]&&scopesBySubquote[sourceId].evidence&&scopesBySubquote[sourceId].evidence.body)||row['Evidence Requirements']||'',
      completionDeliverables:(scopesBySubquote[sourceId]&&scopesBySubquote[sourceId].completion&&scopesBySubquote[sourceId].completion.body)||row['Completion Criteria']||'',
      changeConditions:(scopesBySubquote[sourceId]&&scopesBySubquote[sourceId].change_condition&&scopesBySubquote[sourceId].change_condition.body)||row['Change Conditions']||'',
      assumptions:String(row.Assumptions||'').split(/\n+/).filter(Boolean),
      exclusions:String(row.Exclusions||'').split(/\n+/).filter(Boolean),
      items:itemsBySubquote[sourceId]||[],
      generatedQuoteDocument:quoteDocument,
      ownerApprovalRequired:true,
      customerVisible:row['Customer Visible']==='Yes'
    };
  }).sort(function(a,b){return a.sequence-b.sequence;});
  var drawings=data.drawings.map(function(row){
    var spec=drawingSpecs[row['Sheet Number']]||{};
    return {
      sheetNumber:row['Sheet Number']||'',
      title:row['Drawing Title']||'',
      drawingType:row['Drawing Type']||'',
      classification:row.Classification||'',
      scale:row.Scale||'',
      units:row.Units||'',
      revision:row['Current Revision']||'',
      revisionDate:row['Revision Date']||'',
      notes:row.Notes||'',
      assumptions:row.Assumptions||'',
      preparedBy:row['Prepared By']||'',
      reviewStatus:row['Review Status']||'',
      professionalReviewRequired:row['Professional Review Required']==='Yes',
      quantityImpact:row['Quantity Impact']==='Yes',
      scopeImpact:row['Scope Impact']==='Yes',
      officeFileAttached:!!row['File ID'],
      publicAsset:'assets/quote-builder/whole-house-cad/'+(spec.asset||'')
    };
  }).sort(function(a,b){return a.sheetNumber.localeCompare(b.sheetNumber);});
  var exportValue={
    status:'PASS',
    schemaVersion:'2026-07-26-office-public-export-v1',
    sourceOfTruth:'H38 Business Office',
    runKey:project['Run Key'],
    generatedAt:boNow_(),
    project:{
      title:project['Project Title'],
      property:project['Property / Site'],
      quoteLevel:Number(project['Quote Level']||5),
      projectType:project['Project Type'],
      summary:project.Summary||'',
      revision:Number(project['Revision Number']||1),
      revisionStatus:project['Revision Status']||'',
      customerTotal:Number(project['Customer Total']||0),
      scheduleBasis:project['Schedule Basis']||'',
      paymentMilestones:boUniversalJson_(project['Payment Milestones JSON'],[]),
      assumptions:String(project.Assumptions||'').split(/\n+/).filter(Boolean),
      exclusions:String(project.Exclusions||'').split(/\n+/).filter(Boolean),
      riskSummary:project['Risk Summary']||'',
      professionalReviewStatus:project['Professional Review Status']||''
    },
    counts:{
      projects:1,
      quotes:quotes.length,
      items:data.items.length,
      scopeSections:data.scopes.length,
      drawings:drawings.length,
      generatedDocuments:documents.length,
      published:1
    },
    quotes:quotes,
    drawings:drawings,
    controls:{
      demonstrationOnly:true,
      contract:false,
      permitSet:false,
      constructionAuthorization:false,
      ownerApprovalRequired:true,
      privateFieldsExcluded:true,
      externalActionsPerformed:false
    }
  };
  boAssert_(quotes.length===14,'Public export requires exactly 14 Office phase quotes.');
  boAssert_(data.items.length===56,'Public export requires exactly 56 Office quote items.');
  boAssert_(data.scopes.length===84,'Public export requires exactly 84 Office scope sections.');
  boAssert_(drawings.length===10&&drawings.every(function(row){return row.officeFileAttached&&row.publicAsset;}),'Public export requires exactly 10 attached Office CAD files with public-safe assets.');
  boAssert_(documents.length===15,'Public export requires exactly 15 generated Office documents.');
  boAssert_(quotes.every(function(row){return row.generatedQuoteDocument&&row.items.length===4;}),'Every public phase quote requires its Office-generated document and four itemized lines.');
  var digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(exportValue),Utilities.Charset.UTF_8);
  exportValue.officeExportFingerprint=Utilities.base64EncodeWebSafe(digest).replace(/=+$/,'');
  boProof_('EXPORT SANITIZED UQB PUBLIC DEMO','Project',projectId,'PASS',JSON.stringify({runKey:exportValue.runKey,counts:exportValue.counts,fingerprint:exportValue.officeExportFingerprint,privateFieldsExcluded:true,externalActionsPerformed:false}),owner.Email);
  return exportValue;
}
