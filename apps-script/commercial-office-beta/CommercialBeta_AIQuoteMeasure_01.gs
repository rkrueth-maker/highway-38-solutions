/** Price Book-first AI quote drafting and photo-assisted measurement.
 * All results are internal drafts. Measurements remain unverified and no result is approved or sent.
 */
function cbAiQuoteText_(value){return cbText_(value).replace(/\s+/g,' ').trim();}
function cbAiQuoteProvider_(){
  var props=cbProperties_(),connected=cbText_(props.getProperty('COMMERCIAL_BETA_AI_CONNECTED')).toUpperCase()==='TRUE';
  var key=cbText_(props.getProperty('COMMERCIAL_BETA_AI_API_KEY')||props.getProperty('OPENAI_API_KEY'));
  var model=cbText_(props.getProperty('COMMERCIAL_BETA_AI_MODEL')||props.getProperty('H38_AI_TEXT_MODEL'))||'gpt-4.1-mini';
  return{connected:connected&&!!key,key:key,model:model};
}
function cbAiQuoteParseJson_(text){
  var cleaned=cbText_(text).replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
  try{return JSON.parse(cleaned);}catch(error){var start=cleaned.indexOf('{'),end=cleaned.lastIndexOf('}');cbAssert_(start>=0&&end>start,'AI returned an unreadable JSON draft.');return JSON.parse(cleaned.slice(start,end+1));}
}
function cbAiQuoteResponseJson_(provider,instructions,content){
  var response=UrlFetchApp.fetch('https://api.openai.com/v1/responses',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+provider.key},payload:JSON.stringify({model:provider.model,instructions:instructions,input:[{role:'user',content:content}],max_output_tokens:3000}),muteHttpExceptions:true});
  cbAssert_(response.getResponseCode()>=200&&response.getResponseCode()<300,'AI provider returned '+response.getResponseCode()+'.');
  var json=JSON.parse(response.getContentText()),text=cbText_(json.output_text);
  if(!text&&Array.isArray(json.output))json.output.some(function(item){return(item.content||[]).some(function(part){if(part.text){text=part.text;return true;}return false;});});
  return cbAiQuoteParseJson_(text);
}
function cbAiQuoteTokens_(text){return cbAiQuoteText_(text).toLowerCase().split(/\W+/).filter(function(token){return token.length>2;});}
function cbAiQuotePriceMatches_(context,text){
  var tokens=cbAiQuoteTokens_(text);
  return cbRows_(context.inventory,'items').filter(function(row){return cbText_(row.Status).toUpperCase().indexOf('ARCHIVED')<0;}).map(function(row){var hay=(cbText_(row.SKU)+' '+cbText_(row.Description)+' '+cbText_(row.Category)).toLowerCase(),score=tokens.reduce(function(sum,token){return sum+(hay.indexOf(token)>=0?1:0);},0);return{row:row,score:score};}).sort(function(a,b){return b.score-a.score;}).filter(function(item){return item.score>0;}).slice(0,20);
}
function cbAiQuotePhotoInputs_(context,quoteId){
  var total=0,documents=[],inputs=[];
  cbRows_(context.core,'attachments').filter(function(row){return cbText_(row['Related Record ID'])===quoteId&&cbText_(row['Mime Type']).indexOf('image/')===0&&cbText_(row['File ID']);}).slice(-4).forEach(function(row){
    try{var blob=DriveApp.getFileById(row['File ID']).getBlob(),bytes=blob.getBytes();if(bytes.length>6000000||total+bytes.length>12000000)return;total+=bytes.length;documents.push(cbText_(row['Document ID']));inputs.push({type:'input_image',image_url:'data:'+blob.getContentType()+';base64,'+Utilities.base64Encode(bytes),detail:'high'});}catch(error){cbError_(context.row['Business ID'],'READ AI QUOTE PHOTO',error);}
  });
  return{inputs:inputs,documentIds:documents,totalBytes:total};
}
function cbAiQuoteCadContext_(context,quoteId){return cbRows_(context.core,'documents').filter(function(row){return cbText_(row['Source ID'])===quoteId&&(/CAD/i.test(cbText_(row['Source Type']))||/\.(dxf|dwg|dwt|dws)$/i.test(cbText_(row['File Name'])));}).slice(-10).map(function(row){return{documentId:row['Document ID'],fileName:row['File Name'],mimeType:row['Mime Type']};});}
function cbAiQuoteStore_(context,input,draft,providerName,matches,photoDocuments,cadDocuments){
  var now=cbNow_(),conversationId=cbText_(input.aiConversationId)||cbUuid_('AI-CONVERSATION');
  if(!cbPlatformFindRow_(context.core,'aiConversations','AI Conversation ID',conversationId))cbAppend_(context.core,'aiConversations',{'AI Conversation ID':conversationId,'Business ID':context.row['Business ID'],'User ID':context.user.userId,'Title':cbText_(draft.projectTitle)||'AI quote draft','Context JSON':JSON.stringify({pageKey:'quotes',quoteId:cbText_(input.quoteId),priceBookSearchedFirst:true,photoDocumentIds:photoDocuments,cadDocuments:cadDocuments}),'Status':'Active','Created Time':now,'Updated Time':now,'Record Version':1});
  cbAppend_(context.core,'aiMessages',{'AI Message ID':cbUuid_('AI-MESSAGE'),'Business ID':context.row['Business ID'],'AI Conversation ID':conversationId,'Role':'User','Body':cbAiQuoteText_([input.projectTitle,input.scope,input.measurementNotes,input.notes].join(' ')),'Sources JSON':JSON.stringify(photoDocuments.concat(cadDocuments.map(function(item){return item.documentId;}))),'Action JSON':'{}','Created Time':now,'Record Version':1});
  cbAppend_(context.core,'aiMessages',{'AI Message ID':cbUuid_('AI-MESSAGE'),'Business ID':context.row['Business ID'],'AI Conversation ID':conversationId,'Role':'Assistant','Body':'Quote draft staged for owner review. Price Book searched first. Linked photos and CAD context were considered when available.','Sources JSON':JSON.stringify(matches.map(function(item){return item.row['Item ID'];}).concat(photoDocuments,cadDocuments.map(function(item){return item.documentId;}))),'Action JSON':JSON.stringify(draft),'Created Time':now,'Record Version':1});
  cbAppend_(context.core,'actionQueue',{'Action Queue ID':cbUuid_('ACTION'),'Business ID':context.row['Business ID'],'User ID':context.user.userId,'Action Type':'REVIEW AI QUOTE DRAFT','Related Record Type':'Quote','Related Record ID':cbText_(input.quoteId),'Payload JSON':JSON.stringify(draft),'Risk Level':'Owner Review Required','Review State':'Pending','Approved By':'','Executed Time':'','Status':'Pending Review','Created Time':now,'Updated Time':now,'Record Version':1});
  cbAudit_(context.row['Business ID'],'AI BUILD QUOTE DRAFT','Quote',cbText_(input.quoteId),'PASS','Price Book searched first. '+providerName+' result staged for owner review.');
  return conversationId;
}
function cbCompletionAiBuildQuoteDraft_(request){
  var input=request||{},context=cbCompletionContext_(input.businessId,'manageQuotes'),customerId=cbText_(input.customerId),quoteId=cbText_(input.quoteId),text=cbAiQuoteText_([input.projectTitle,input.scope,input.measurementNotes,input.notes].join(' '));
  cbAssert_(customerId,'Customer selection is required.');cbAssert_(text,'Scope, notes or measurements are required.');
  var matches=cbAiQuotePriceMatches_(context,text),photos=cbAiQuotePhotoInputs_(context,quoteId),cadDocuments=cbAiQuoteCadContext_(context,quoteId),draft={projectTitle:cbText_(input.projectTitle)||'AI-assisted quote draft',scope:cbText_(input.scope),suggestedLines:matches.slice(0,10).map(function(item){return{catalogId:item.row['Item ID'],description:item.row.Description,quantity:1,unit:item.row['Unit of Measure']||'each',rate:Number(item.row['Selling Price']||0),priceStatus:'Owner review required',confidence:'Price Book match',evidence:'Price Book searched first'};}),assumptions:[],exclusions:['No automatic approval, promise or customer send.'],missingInformation:['Confirm critical dimensions, quantities, utilities, access, permits and site conditions.'],photoObservations:photos.documentIds.length?['Linked quote photos are available for visual review.']:[]},provider=cbAiQuoteProvider_(),providerName='Price Book-assisted local fallback';
  if(provider.connected){
    try{
      var priceBook=matches.map(function(item){return{id:item.row['Item ID'],sku:item.row.SKU,description:item.row.Description,category:item.row.Category,unit:item.row['Unit of Measure'],sellingPrice:item.row['Selling Price']};}),content=[{type:'input_text',text:'PROJECT INPUT\n'+text+'\n\nPRICE BOOK MATCHES\n'+JSON.stringify(priceBook)+'\n\nLINKED CAD DOCUMENTS\n'+JSON.stringify(cadDocuments)+'\nCAD metadata may guide which verified source dimensions exist, but do not invent dimensions that are not present in the supplied text.'}].concat(photos.inputs);
      draft=cbAiQuoteResponseJson_(provider,'You are H38 AI inside the Quote Builder. Search the supplied Price Book first. Use only supplied scope, notes, linked photos and CAD metadata. Never invent measurements, quantities, hidden conditions, permits, final pricing or customer promises. CAD source dimensions supplied in notes may be treated as source data; photo-derived dimensions must remain unverified. Return strict JSON with projectTitle, scope, suggestedLines, assumptions, exclusions, missingInformation and photoObservations. Every suggested line must include catalogId, description, quantity, unit, rate, priceStatus, confidence and evidence. Price status must remain owner review required. Never approve or send.',content);
      providerName='Configured AI provider';
    }catch(error){cbError_(context.row['Business ID'],'AI BUILD QUOTE DRAFT',error);}
  }
  draft.suggestedLines=Array.isArray(draft.suggestedLines)?draft.suggestedLines:[];draft.suggestedLines=draft.suggestedLines.map(function(line){return Object.assign({},line,{priceStatus:'Owner review required'});});
  var conversationId=cbAiQuoteStore_(context,input,draft,providerName,matches,photos.documentIds,cadDocuments);
  return{status:'PASS',aiConversationId:conversationId,draft:draft,provider:providerName,priceBookSearchedFirst:true,photoCount:photos.documentIds.length,cadDocumentCount:cadDocuments.length,ownerReviewRequired:true,automaticApproval:false,automaticSend:false,externalActionsEnabled:false};
}
function cbAiMeasureImage_(context,input){
  var fileId='',attachmentId=cbText_(input.attachmentId),documentId=cbText_(input.photoDocumentId),quoteId=cbText_(input.quoteId);
  if(attachmentId){var attachment=cbPlatformFindRow_(context.core,'attachments','Attachment ID',attachmentId);if(attachment)fileId=cbText_(attachment['File ID']);}
  if(!fileId&&documentId){var document=cbPlatformFindRow_(context.core,'documents','Document ID',documentId);if(document)fileId=cbText_(document['File ID']);}
  if(!fileId&&quoteId){var found=cbRows_(context.core,'attachments').filter(function(row){return cbText_(row['Related Record ID'])===quoteId&&cbText_(row['Mime Type']).indexOf('image/')===0&&cbText_(row['File ID']);}).slice(-1)[0];if(found)fileId=cbText_(found['File ID']);}
  if(fileId){var blob=DriveApp.getFileById(fileId).getBlob(),bytes=blob.getBytes();cbAssert_(bytes.length<=8000000,'AI measurement photo is too large.');return'data:'+blob.getContentType()+';base64,'+Utilities.base64Encode(bytes);}
  var url=cbText_(input.imageUrl);return /^https:\/\/(www\.)?highway38solutions\.com\//i.test(url)?url:'';
}
function cbCompletionAiMeasurePhoto_(request){
  var input=request||{},context=cbCompletionContext_(input.businessId,'manageField'),quoteId=cbText_(input.quoteId),name=cbText_(input.measurementName),referenceSize=Number(input.referenceSize||0),referenceUnit=cbText_(input.referenceUnit),provider=cbAiQuoteProvider_(),image=cbAiMeasureImage_(context,input),now=cbNow_();
  cbAssert_(quoteId,'Save or open a quote first.');cbAssert_(name,'Measurement name is required.');cbAssert_(referenceSize>0&&referenceUnit,'A known reference size and unit are required.');
  if(!image||!provider.connected){
    cbAppend_(context.core,'actionQueue',{'Action Queue ID':cbUuid_('ACTION'),'Business ID':context.row['Business ID'],'User ID':context.user.userId,'Action Type':'AI MEASUREMENT REQUEST','Related Record Type':'Quote','Related Record ID':quoteId,'Payload JSON':JSON.stringify({measurementName:name,referenceSize:referenceSize,referenceUnit:referenceUnit,photoAvailable:!!image}),'Risk Level':'Needs Verification','Review State':'Blocked','Approved By':'','Executed Time':'','Status':'HOLD — photo or configured AI required','Created Time':now,'Updated Time':now,'Record Version':1});
    return{status:'HOLD',message:!image?'Add an accessible quote photo before AI-assisted measuring.':'The AI provider is not configured for photo measurement.',ownerReviewRequired:true,fieldVerificationRequired:true,automaticApproval:false};
  }
  var result=cbAiQuoteResponseJson_(provider,'Estimate only the requested visible dimension relative to the known-size reference. Never claim precision, hidden geometry or field verification. Return strict JSON with value, unit, confidence, evidence, assumptions and missingInformation. Confidence must not be Verified.',[{type:'input_text',text:'REQUESTED MEASUREMENT: '+name+'\nKNOWN REFERENCE: '+referenceSize+' '+referenceUnit+'\nNOTES: '+cbText_(input.notes)},{type:'input_image',image_url:image,detail:'high'}]),value=Number(result.value||0),unit=cbText_(result.unit)||referenceUnit;cbAssert_(value>0,'AI did not return a usable estimated value.');
  var id=cbUuid_('MEASUREMENT');cbAppend_(context.core,'measurements',{'Measurement ID':id,'Business ID':context.row['Business ID'],'Job ID':cbText_(input.jobId),'Quote ID':quoteId,'Related Record Type':'Quote','Related Record ID':quoteId,'Measurement Name':name,'Measurement Type':cbText_(input.measurementType)||'Length','Value':value,'Unit':unit,'Method':'AI-assisted photo estimate','Confidence':'Needs verification','Reference Size':referenceSize,'Reference Unit':referenceUnit,'Photo Document ID':cbText_(input.photoDocumentId),'Notes':'AI ESTIMATE — FIELD VERIFICATION REQUIRED. '+JSON.stringify({confidence:result.confidence,evidence:result.evidence,assumptions:result.assumptions,missingInformation:result.missingInformation}),'Status':'Needs Verification','Created By':context.user.userId,'Created Time':now,'Updated Time':now,'Record Version':1});
  cbAudit_(context.row['Business ID'],'AI ASSISTED MEASUREMENT','Measurement',id,'PASS','Photo estimate staged. Field verification required.');
  return{status:'PASS',measurementId:id,value:value,unit:unit,confidence:'Needs verification',provider:'Configured AI provider',fieldVerificationRequired:true,ownerReviewRequired:true,automaticApproval:false};
}
