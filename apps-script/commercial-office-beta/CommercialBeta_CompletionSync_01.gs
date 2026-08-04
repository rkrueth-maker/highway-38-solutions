/** Idempotent online/offline synchronization for every supported product shell. */
function cbCompletionOperationPrior_(context,operationId){return cbRows_(context.core,'offlineSync').find(function(row){return row['Idempotency Key']===operationId;})||null;}
function cbCompletionOperationInput_(context,operation){var payload=operation&&operation.payload?operation.payload:{};return Object.assign({},payload,{businessId:context.row['Business ID'],operationId:cbText_(operation.operationId),offlineOperationId:cbText_(operation.operationId),deviceId:cbText_(operation.deviceId),baseVersion:Number(operation.baseVersion||0)});}
function cbCompletionApplyOperation_(context,operation){
  var action=cbText_(operation.action).toUpperCase(),input=cbCompletionOperationInput_(context,operation),result;
  if(action==='SAVE_CUSTOMER')result=cbCompletionSaveCustomer_(input);
  else if(action==='SAVE_PROPERTY')result=cbCompletionSaveProperty_(input);
  else if(action==='SAVE_REQUEST')result=cbCompletionSaveRequest_(input);
  else if(action==='SAVE_JOB')result=cbCompletionSaveJob_(input);
  else if(action==='SAVE_TASK')result=cbCompletionSaveTask_(input);
  else if(action==='SAVE_SCHEDULE')result=cbCompletionSaveSchedule_(input);
  else if(action==='SAVE_MEASUREMENT')result=cbCompletionSaveMeasurement_(input);
  else if(action==='RECORD_TIME')result=cbCompletionRecordTime_(input);
  else if(action==='SAVE_QUOTE'||action==='UPSERT_QUOTE_DRAFT')result=cbCompletionSaveQuote_(input);
  else if(action==='POST_INVENTORY')result=cbCompletionPostInventory_(input);
  else if(action==='ASSIGN_ASSET'||action==='ASSIGN_ASSET_TO_JOB')result=cbCompletionAssignAsset_(input);
  else if(action==='RETURN_ASSET'||action==='RETURN_ASSET_FROM_JOB')result=cbCompletionReturnAsset_(input);
  else if(action==='SCHEDULE_MAINTENANCE')result=cbCompletionScheduleMaintenance_(input);
  else if(action==='RECORD_INSPECTION')result=cbCompletionRecordInspection_(input);
  else if(action==='RECORD_ASSET_USAGE')result=cbCompletionRecordAssetUsage_(input);
  else if(action==='SAVE_INVOICE')result=cbCompletionSaveInvoice_(input);
  else if(action==='RECORD_PAYMENT')result=cbCompletionRecordPayment_(input);
  else if(action==='SAVE_EXPENSE')result=cbCompletionSaveExpense_(input);
  else if(action==='SAVE_ATTACHMENT')result=cbCompletionSaveAttachment_(input);
  else if(action==='CREATE_CONVERSATION')result=cbCompletionCreateConversation_(input);
  else if(action==='SEND_INTERNAL_MESSAGE')result=cbCompletionSendInternalMessage_(input);
  else if(action==='SAVE_EMAIL_DRAFT')result=cbCompletionSaveEmailDraft_(input);
  else if(action==='SAVE_SMS_DRAFT')result=cbCompletionSaveSmsDraft_(input);
  else if(action==='SAVE_PORTAL_MESSAGE')result=cbCompletionSavePortalMessage_(input);
  else if(action==='CONVERT_MESSAGE_TO_TASK')result=cbCompletionConvertMessageToTask_(input);
  else if(action==='SAVE_SOCIAL_POST')result=cbCompletionSaveSocialPost_(input);
  else if(action==='REQUEST_SOCIAL_REVIEW')result=cbCompletionRequestSocialReview_(input);
  else if(action==='APPROVE_SOCIAL_POST')result=cbCompletionApproveSocialPost_(input);
  else if(action==='SCHEDULE_SOCIAL_POST')result=cbCompletionScheduleSocialPost_(input);
  else if(action==='MARK_SOCIAL_POSTED')result=cbCompletionMarkSocialPosted_(input);
  else if(action==='RECORD_SOCIAL_METRIC')result=cbCompletionRecordSocialMetric_(input);
  else if(action==='SAVE_CAMPAIGN')result=cbCompletionSaveCampaign_(input);
  else if(action==='SAVE_SOCIAL_ACCOUNT')result=cbCompletionSaveSocialAccount_(input);
  else if(action==='SAVE_FEATURE_REQUEST')result=cbCompletionSaveFeatureRequest_(input);
  else if(action==='SAVE_VOICE_ITEM')result=cbCompletionSaveVoiceItem_(input);
  else if(action==='SAVE_SETTING')result=cbCompletionSaveSetting_(input);
  else if(action==='SAVE_USER')result=cbCompletionSaveUser_(input);
  else if(action==='SAVE_ENTITY')result=cbCompletionSaveEntity_(input);
  else if(action==='SAVE_PARITY_ENTITY')result=cbCompletionSaveParityEntity_(input);
  else if(action==='ARCHIVE_ENTITY')result=cbCompletionArchiveEntity_(input);
  else if(action==='RECORD_USAGE_EVENT')result=cbCompletionRecordUsageEvent_(input);
  else throw new Error('Unsupported offline operation: '+action);
  return result||{status:'PASS'};
}
function cbCompletionResultRecordId_(result,operation){
  var keys=['recordId','customerId','propertyId','requestId','jobId','taskId','quoteId','scheduleEventId','measurementId','timeEntryId','transactionId','assignmentId','maintenanceId','inspectionId','usageId','invoiceId','paymentId','expenseId','documentId','conversationId','messageId','emailMessageId','smsMessageId','portalMessageId','socialPostId','socialMetricId','campaignId','featureRequestId','voiceQueueId','userId'];
  for(var i=0;i<keys.length;i+=1)if(result&&result[keys[i]])return result[keys[i]];return cbText_(operation.recordId);
}
function cbCompletionSyncOne_(context,operation){
  var operationId=cbText_(operation.operationId);cbAssert_(operationId,'Operation ID is required.');var prior=cbCompletionOperationPrior_(context,operationId);if(prior)return{operationId:operationId,status:'ALREADY_SYNCED',recordId:prior['Record ID']};var result=cbCompletionApplyOperation_(context,operation),recordId=cbCompletionResultRecordId_(result,operation),status=result.status==='CONFLICT'?'CONFLICT':'SYNCED',now=cbNow_(),payload=operation.payload||{};cbAppend_(context.core,'offlineSync',{'Sync Event ID':cbUuid_('SYNC'),'Business ID':context.row['Business ID'],'User ID':context.user.userId,'Device ID':cbText_(operation.deviceId),'Action Type':cbText_(operation.action).toUpperCase(),'Local Timestamp':cbText_(operation.localTimestamp),'Record Type':cbText_(operation.recordType),'Record ID':recordId,'Record Version':Number(result.recordVersion||result.revision||1),'Idempotency Key':operationId,'Sync Status':status,'Retry Count':Number(operation.retryCount||0),'Payload Hash':Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(payload))).slice(0,40),'Error Status':status==='CONFLICT'?'Needs Review':'','Server Timestamp':now});return{operationId:operationId,status:status,recordId:recordId,result:result};
}
function cbCompletionSyncOperations_(request){
  var input=request||{},context=cbCompletionContext_(input.businessId,''),operations=Array.isArray(input.operations)?input.operations:[];cbAssert_(operations.length<=100,'Sync is limited to 100 operations per request.');var lock=LockService.getScriptLock();lock.waitLock(30000);try{return{status:'PASS',businessId:context.row['Business ID'],serverTime:cbNow_(),results:operations.map(function(operation){try{return cbCompletionSyncOne_(context,operation);}catch(error){cbError_(context.row['Business ID'],'SYNC '+cbText_(operation.action),error);return{operationId:cbText_(operation.operationId),status:'FAILED',message:error.message};}})};}finally{lock.releaseLock();}
}
