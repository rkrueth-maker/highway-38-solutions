function cbCompletionProviderSeed_(context,type,name,propertyPrefix,capabilities){
  var rows=cbRows_(context.core,'providers'),id='PROVIDER-'+type.toUpperCase(),row=rows.find(function(item){return item['Provider ID']===id;}),props=cbProperties_(),connected=cbText_(props.getProperty(propertyPrefix+'_CONNECTED')).toUpperCase()==='TRUE',now=cbNow_();
  var connectionStatus=connected?'Connected':'Not Connected',capabilitiesJson=JSON.stringify(capabilities||[]);
  if(row){
    if(cbText_(row['Connection Status'])===connectionStatus&&cbText_(row['Capabilities JSON'])===capabilitiesJson&&cbText_(row.Status)==='Active')return;
    cbPlatformUpdateRow_(context.core,'providers',row.__row,{'Provider Name':name,'Connection Status':connectionStatus,'Capabilities JSON':capabilitiesJson,'Last Check Time':now,'Last Error':'','Status':'Active','Updated Time':now,'Record Version':Math.max(1,Number(row['Record Version']||1))+1});
  }else cbAppend_(context.core,'providers',{'Provider ID':id,'Business ID':context.row['Business ID'],'Provider Type':type,'Provider Name':name,'Connection Status':connectionStatus,'Capabilities JSON':capabilitiesJson,'Settings JSON':'{}','Last Check Time':now,'Last Error':'','Status':'Active','Updated Time':now,'Record Version':1});
}
function cbCompletionSeedDefaults_(context){
  var businessId=context.row['Business ID'],now=cbNow_();
  var general=cbRows_(context.core,'conversations').find(function(row){return row['Business ID']===businessId&&row['Conversation Type']==='Channel'&&row.Subject==='General';});
  if(!general){var conversationId=cbUuid_('CONVERSATION');cbAppend_(context.core,'conversations',{'Conversation ID':conversationId,'Business ID':businessId,'Conversation Type':'Channel','Subject':'General','Related Record Type':'Business','Related Record ID':businessId,'Participant IDs JSON':'[]','Status':'Active','Created Time':now,'Updated Time':now,'Record Version':1});}
  cbCompletionProviderSeed_(context,'email','Email Provider','COMMERCIAL_BETA_EMAIL',['inbox','threads','drafts','attachments']);
  cbCompletionProviderSeed_(context,'sms','Business SMS Provider','COMMERCIAL_BETA_SMS',['inbox','outbox','media','consent','delivery']);
  cbCompletionProviderSeed_(context,'social','Social Publishing Provider','COMMERCIAL_BETA_SOCIAL',['drafts','schedule','publish','analytics']);
  cbCompletionProviderSeed_(context,'ai','AI Provider','COMMERCIAL_BETA_AI',['questions','guidance','recommendations','voice']);
  var knowledge=cbRows_(context.core,'aiKnowledge');
  var defaults=[
    ['getting-started','Getting started','Start with Today, add customers and work, build quotes, schedule jobs, capture field proof, then invoice and close out.','core'],
    ['offline','Working offline','Download or refresh a business snapshot before leaving service. Drafts, notes, photos, messages, measurements, equipment actions and selected records stay on the device until synchronized.','offline'],
    ['quotes','Quote Builder','Quote Builder uses the shared customer, project, price book, document, approval and communication records. Cached prices always remain owner-review required.','quotes'],
    ['communications','Communications','Internal messages, email drafts, business text drafts and portal messages stay visibly separated. External messages require a connected provider and authorized release.','communications'],
    ['social','Social Control','Create content, attach assets, request review, approve, schedule, record manual publication proof and track results. The platform never publishes automatically unless a provider is connected and the owner explicitly releases that capability.','social'],
    ['fleet','Fleet and maintenance','Assign vehicles, trailers, tools and equipment to jobs; record inspections, usage, fuel, maintenance, downtime and return condition.','fleet'],
    ['voice','Voice and driving mode','Voice can read work, capture notes and prepare drafts. Pricing, approvals, sending, payments, deletion and settings changes wait for parked review.','voice']
  ];
  defaults.forEach(function(item){if(!knowledge.some(function(row){return row['Knowledge ID']==='KNOWLEDGE-'+item[0];}))cbAppend_(context.core,'aiKnowledge',{'Knowledge ID':'KNOWLEDGE-'+item[0],'Business ID':businessId,'Topic':item[0],'Title':item[1],'Content':item[2],'Module Key':item[3],'Role IDs JSON':'[]','Source':'H38 Platform','Version':CB_CONFIG.version,'Status':'Active','Updated Time':now,'Record Version':1});});
  var quick=cbRows_(context.core,'quickActions');
  [['new-quote','New quote','quotes'],['add-customer','Add customer','customers'],['take-photo','Take job photo','field'],['new-message','New message','messages'],['record-expense','Record expense','money'],['assign-equipment','Assign equipment','fleet'],['new-social','Create social draft','social']].forEach(function(item,index){if(!quick.some(function(row){return row['Action Key']===item[0];}))cbAppend_(context.core,'quickActions',{'Quick Action ID':cbUuid_('QUICK-ACTION'),'Business ID':businessId,'Action Key':item[0],'Label':item[1],'Page Key':item[2],'Role IDs JSON':'[]','Configuration JSON':'{}','Sort Order':index+1,'Status':'Active','Created Time':now,'Updated Time':now,'Record Version':1});});
}
function cbCompletionProductShells_(){return{
  office:['today','customers','work','quotes','measure','schedule','messages','field','inventory','fleet','money','documents','social','ai','settings'],
  quote:['today','customers','quotes','measure','messages','documents','ai','settings'],
  field:['today','work','measure','schedule','messages','field','fleet','documents','ai'],
  inventory:['today','work','messages','inventory','fleet','documents','ai'],
  social:['today','messages','social','ai','settings']
};}
function cbCompletionQuoteView_(context){
  var quotes=cbRows_(context.core,'quotes'),lines=cbRows_(context.core,'quoteLines'),grouped={};lines.forEach(function(line){var id=line['Quote ID'];if(!grouped[id])grouped[id]=[];grouped[id].push(cbCompletionCleanRow_(line));});
  return quotes.slice().reverse().slice(0,400).map(function(row){var out=cbCompletionCleanRow_(row);out.lines=grouped[row['Quote ID']]||[];return out;});
}
