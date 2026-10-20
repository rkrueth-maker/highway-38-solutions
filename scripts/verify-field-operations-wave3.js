'use strict';
const assert=require('assert');
const F=require('../commercial-app/field-operations-next.js');
const BID='BIZ-H38';
const event=(id,start,end,user='U1',asset='A1')=>({id,businessId:BID,start,end,employeeIds:[user],assetIds:[asset],jobId:`J-${id}`});
const conflicts=F.scheduleConflicts([event('1','2026-09-28T08:00:00','2026-09-28T10:00:00'),event('2','2026-09-28T09:00:00','2026-09-28T11:00:00')]);
assert.equal(conflicts.length,1);assert.deepEqual(conflicts[0].employees,['U1']);assert.deepEqual(conflicts[0].assets,['A1']);
const noCross=F.scheduleConflicts([event('1','2026-09-28T08:00:00','2026-09-28T10:00:00'),{...event('2','2026-09-28T09:00:00','2026-09-28T11:00:00'),businessId:'OTHER'}]);assert.equal(noCross.length,0);
let job={'Job ID':'J1','Business ID':BID,'Field State':'Assigned','Record Version':1};job=F.fieldTransition(job,{to:'Travel',actorId:'U1'});assert.equal(job['Field State'],'Travel');job=F.fieldTransition(job,{to:'Arrived'});job=F.fieldTransition(job,{to:'Working'});job=F.fieldTransition(job,{to:'Completed'});assert.equal(job['Field State'],'Completed');assert.throws(()=>F.fieldTransition(job,{to:'Travel'}),/Cannot move/);
const mutable=F.offlineOperation({businessId:BID,operationId:'OP1',deviceId:'D1',recordType:'job',recordId:'J1',action:'UPSERT',baseVersion:2,payload:{status:'Working'}});assert.equal(F.replayDecision(mutable,{'Record Version':3}).decision,'REVIEW_CONFLICT');const appendOnly=F.offlineOperation({businessId:BID,operationId:'OP2',deviceId:'D1',recordType:'fieldNote',recordId:'N1',action:'UPSERT',baseVersion:2,payload:{note:'x'}});assert.equal(F.replayDecision(appendOnly,{'Record Version':3}).decision,'APPLY_APPEND');assert.throws(()=>F.offlineOperation({businessId:BID,deviceId:'D1',recordType:'payment',recordId:'P1',action:'PAY'}),/Financial execution/);
const template=F.formTemplate({businessId:BID,name:'Completion',fields:[{id:'done',label:'Complete',type:'checkbox',required:true},{id:'photo',label:'Photo',type:'photo',required:true,showWhen:{fieldId:'done',equals:true}}]});assert.equal(F.validateForm(template,{done:true}).valid,false);assert.equal(F.validateForm(template,{done:false}).valid,true);const resp=F.formResponse({businessId:BID,template,jobId:'J1',answers:{done:true,photo:'FILE1'},offline:true});assert.equal(resp.Status,'Queued for sync');
assert.equal(F.locationAllowed('field',{assignedDriver:false}),false);assert.equal(F.locationAllowed('field',{assignedDriver:true}),true);assert.equal(F.locationAllowed('dispatcher',{}),true);const hidden=F.vehicleSnapshot({Latitude:1,Longitude:2,'Last Known Location':'Secret'},'field',{assignedDriver:false});assert.equal(hidden['Location Restricted'],true);assert.equal(hidden.Latitude,undefined);
const projection=F.fieldProjection({jobs:[{'Job ID':'J1','Assigned User ID':'U1','Pay Rate':50,'Gross Margin':40},{'Job ID':'J2','Assigned User ID':'U2'}]},{id:'U1',role:'field'});assert.equal(projection.jobs.length,1);assert.equal(projection.jobs[0]['Pay Rate'],undefined);assert.equal(projection.ownerFinancialVisible,false);
const due=F.maintenanceDue({'Asset ID':'A1','Current Meter':1200,'Next Service Meter':1000});assert.equal(due.due,true);
const plan=F.dispatchProposal({businessId:BID,jobs:[{'Business ID':BID,'Job ID':'J1',Status:'Open',Priority:'Urgent',Latitude:47.2,Longitude:-93.5}],events:[],employees:[],assets:[]});assert.equal(plan.unscheduled.length,1);assert.equal(plan.priority.length,1);assert.equal(plan.automaticScheduling,false);assert.equal(plan.requiresDispatcherApproval,true);
/* WS2 dispatch board engine (spec §4.1/§4.3/§4.4 + §1.8 defect fix). */
const canon=(id,start,end,user,businessId=BID)=>({'Schedule Event ID':id,'Business ID':businessId,'Job ID':`J-${id}`,'Related Record ID':`J-${id}`,Title:`Work ${id}`,'Start Time':start,'End Time':end,'Assigned User ID':user,Status:'Scheduled'});
/* §1.8: normalizeEvent folds the canonical singular assignee into employeeIds. */
assert.deepEqual(F.normalizeEvent(canon('S1','2026-09-28T08:00:00','2026-09-28T10:00:00','U9')).employeeIds,['U9']);
assert.deepEqual(F.normalizeEvent({...canon('S2','2026-09-28T08:00:00','2026-09-28T10:00:00','U9'),'Assigned User IDs':['U8','U9']}).employeeIds,['U9','U8']);
/* Two canonical (singular-assignee) events for the same user now conflict… */
const canonConflicts=F.scheduleConflicts([canon('C1','2026-09-28T08:00:00','2026-09-28T10:00:00','U1'),canon('C2','2026-09-28T09:00:00','2026-09-28T11:00:00','U1')]);
assert.equal(canonConflicts.length,1);assert.deepEqual(canonConflicts[0].employees,['U1']);
/* …different users do not, and different businesses do not. */
assert.equal(F.scheduleConflicts([canon('C3','2026-09-28T08:00:00','2026-09-28T10:00:00','U1'),canon('C4','2026-09-28T09:00:00','2026-09-28T11:00:00','U2')]).length,0);
assert.equal(F.scheduleConflicts([canon('C5','2026-09-28T08:00:00','2026-09-28T10:00:00','U1'),canon('C6','2026-09-28T09:00:00','2026-09-28T11:00:00','U1','OTHER')]).length,0);
/* boardEvents: job link resolves Related Record ID first, then Job ID;
 * assignees union singular + array; cancelled excluded; bad dates tolerated. */
const board=F.boardEvents([
 canon('B1','2026-09-28T08:00:00','2026-09-28T10:00:00','U1'),
 {...canon('B2','2026-09-28T11:00:00','','U2'),'Related Record ID':'','Assigned User IDs':['U3']},
 {...canon('B3','2026-09-28T12:00:00','2026-09-28T13:00:00','U1'),Status:'Cancelled'},
 {'Schedule Event ID':'B4','Business ID':BID,'Start Time':'not-a-date','Assigned User ID':'U1',Status:'Scheduled'},
]);
assert.equal(board.length,2);assert.equal(board.needsTime,1);
assert.equal(board[0].jobId,'J-B1');assert.deepEqual(board[0].assigneeIds,['U1']);assert.equal(board[0].hasEnd,true);
assert.equal(board[1].jobId,'J-B2');assert.deepEqual(board[1].assigneeIds,['U2','U3']);assert.equal(board[1].hasEnd,false);
/* DISPATCH_CHIP mapping (spec §4.3 table). */
assert.deepEqual(F.DISPATCH_CHIP('Scheduled',{assigned:false}),{label:'Unassigned',kind:'bad'});
assert.deepEqual(F.DISPATCH_CHIP('Done',{assigned:true}),{label:'Done',kind:'good'});
assert.deepEqual(F.DISPATCH_CHIP('Complete',{assigned:true}),{label:'Done',kind:'good'});
assert.deepEqual(F.DISPATCH_CHIP('En Route',{assigned:true}),{label:'En route',kind:'pending'});
assert.deepEqual(F.DISPATCH_CHIP('On Site',{assigned:true}),{label:'On site',kind:'pending'});
assert.deepEqual(F.DISPATCH_CHIP('In Progress',{assigned:true}),{label:'Working',kind:'pending'});
assert.deepEqual(F.DISPATCH_CHIP('Scheduled',{assigned:true}),{label:'Scheduled',kind:'info'});
assert.deepEqual(F.DISPATCH_CHIP('Assigned',{assigned:true}),{label:'Scheduled',kind:'info'});
assert.deepEqual(F.DISPATCH_CHIP('Cancelled',{assigned:true}),{label:'Cancelled',kind:'neutral'});
assert.deepEqual(F.DISPATCH_CHIP('Something Else',{assigned:true}),{label:'Something Else',kind:''});
/* dailyLoad sums counts and booked minutes per assignee; open-ended = 0 min. */
const load=F.dailyLoad(board);
assert.deepEqual(load.U1,{count:1,minutes:120});assert.deepEqual(load.U2,{count:1,minutes:0});assert.deepEqual(load.U3,{count:1,minutes:0});
const load2=F.dailyLoad(F.boardEvents([canon('L1','2026-09-28T08:00:00','2026-09-28T09:30:00','U1'),canon('L2','2026-09-28T10:00:00','2026-09-28T10:45:00','U1')]));
assert.deepEqual(load2.U1,{count:2,minutes:135});
console.log('Field operations Wave 3 engine acceptance complete.');
