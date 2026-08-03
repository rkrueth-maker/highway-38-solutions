function cbCompletionAssignedWork_(context){
  var canAll=cbCompletionCan_(context.user,'manageWork'),userId=context.user.userId,allTasks=cbRows_(context.core,'tasks'),tasks=canAll?allTasks:allTasks.filter(function(row){return row['Assigned User ID']===userId||(!row['Assigned User ID']&&!row['Assigned Crew ID']);}),jobIds={};tasks.forEach(function(row){if(row['Job ID'])jobIds[row['Job ID']]=true;});
  var jobs=cbRows_(context.core,'jobs').filter(function(row){return canAll||jobIds[row['Job ID']];}),schedules=cbRows_(context.core,'scheduleEvents').filter(function(row){return canAll||row['Assigned User ID']===userId||(row['Related Record Type']==='Job'&&jobIds[row['Related Record ID']]);}),notes=cbRows_(context.core,'jobNotes').filter(function(row){return canAll||jobIds[row['Job ID']];}),times=cbRows_(context.core,'timeEntries').filter(function(row){return canAll||row['User ID']===userId;});
  return{jobs:jobs.slice().reverse().slice(0,600).map(cbCompletionCleanRow_),tasks:tasks.slice().reverse().slice(0,800).map(cbCompletionCleanRow_),scheduleEvents:schedules.slice().reverse().slice(0,800).map(cbCompletionCleanRow_),jobNotes:notes.slice().reverse().slice(0,500).map(cbCompletionCleanRow_),timeEntries:times.slice().reverse().slice(0,500).map(cbCompletionCleanRow_)};
}
function cbCompletionCommunicationView_(context){
  if(!cbCompletionCan_(context.user,'manageCommunications'))return{conversations:[],messages:[],emailThreads:[],emailMessages:[],smsThreads:[],smsMessages:[],portalThreads:[],portalMessages:[]};
  var conversations=cbRows_(context.core,'conversations').filter(function(row){return cbCompletionConversationVisible_(context,row);}),ids={};conversations.forEach(function(row){ids[row['Conversation ID']]=true;});
  return{conversations:conversations.slice().reverse().slice(0,500).map(cbCompletionCleanRow_),messages:cbRows_(context.core,'messages').filter(function(row){return ids[row['Conversation ID']];}).slice().reverse().slice(0,1500).map(cbCompletionCleanRow_),emailThreads:cbCompletionListRows_(context,'core','emailThreads',500),emailMessages:cbCompletionListRows_(context,'core','emailMessages',1000),smsThreads:cbCompletionListRows_(context,'core','smsThreads',500),smsMessages:cbCompletionListRows_(context,'core','smsMessages',1000),portalThreads:cbCompletionListRows_(context,'core','customerPortalThreads',500),portalMessages:cbCompletionListRows_(context,'core','customerPortalMessages',1000)};
}
function cbCompletionPublicUsers_(context){
  var rows=cbCompletionListRows_(context,'core','users',300);if(cbCompletionCan_(context.user,'manageUsers'))return rows;
  return rows.map(function(row){return{'User ID':row['User ID'],'Display Name':row['Display Name'],'Role ID':row['Role ID'],'Status':row.Status};});
}
