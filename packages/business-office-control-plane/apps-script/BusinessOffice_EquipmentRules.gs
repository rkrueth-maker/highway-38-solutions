/** Business Office Platform — deterministic equipment assignment and return rules. */
function boEquipmentAssignmentValidation_(asset,openAssignments,input){
  var row=asset||{},assignments=Array.isArray(openAssignments)?openAssignments:[],data=input||{},errors=[];
  if(!row['Asset ID'])errors.push('Equipment asset is required.');
  if(!String(data.employeeId||'').trim())errors.push('Choose an employee.');
  if(row.Status==='Out of Service'||row.Status==='Needs Service'||row.Availability==='Unavailable')errors.push('Equipment is unavailable.');
  if(assignments.some(function(item){return item['Asset ID']===row['Asset ID']&&(item.Status==='Assigned'||item.Status==='In Use');}))errors.push('Equipment is already assigned.');
  return{valid:errors.length===0,errors:errors,assetId:row['Asset ID']||'',employeeId:String(data.employeeId||''),jobId:String(data.jobId||''),taskId:String(data.taskId||'')};
}
function boEquipmentReturnCalculation_(assignment,asset,input,elapsedHours){
  var row=assignment||{},equipment=asset||{},data=input||{},start=Number(row['Start Meter']||0),end=Number(data.endMeter==null?equipment['Current Meter']||start:data.endMeter),meterHours=Math.max(0,end-start),hours=meterHours||Math.max(0,Number(elapsedHours||0)),rate=Math.max(0,Number(row['Hourly Cost Rate']||equipment['Hourly Cost Rate']||0)),condition=String(data.conditionIn||'Good'),needsService=['Needs Service','Damaged','Unsafe'].indexOf(condition)>=0;
  return{endMeter:end,hoursUsed:Math.round(hours*100)/100,hourlyCostRate:Math.round(rate*100)/100,costAmount:Math.round(hours*rate*100)/100,conditionIn:condition,needsService:needsService,availability:needsService?'Unavailable':'Available',status:needsService?'Needs Service':'Active',expenseCreated:false,accountingPosted:false};
}
