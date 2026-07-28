/** Northern Lakes high-reliability workbook provisioning through the Sheets API. */
function nlpsFastSheetTitle_(value){return String(value||'Sheet').replace(/[\\/?*\[\]:]/g,'-').slice(0,100)||'Sheet';}
function nlpsFastA1Title_(value){return "'"+String(value||'Sheet').replace(/'/g,"''")+"'";}
function nlpsFastNormalizeRows_(rows){
  var source=Array.isArray(rows)?rows:[];
  if(!source.length)return{values:[],columns:1};
  var columns=Math.max.apply(null,source.map(function(row){return Array.isArray(row)?row.length:0;}));
  columns=Math.max(columns,1);
  return{columns:columns,values:source.map(function(row){var copy=Array.isArray(row)?row.slice():[row];while(copy.length<columns)copy.push('');return copy;})};
}
function nlpsFastCreateSpreadsheet_(title,definitions,folder){
  nlpsSetupAssert_(typeof Sheets!=='undefined'&&Sheets.Spreadsheets&&Sheets.Spreadsheets.Values,'Google Sheets API is required for Northern Lakes provisioning.');
  var defs=(definitions||[]).map(function(definition,index){
    var rows=nlpsFastNormalizeRows_(definition.rows||[]),name=nlpsFastSheetTitle_(definition.name||('Sheet '+(index+1)));
    return{name:name,rows:rows.values,columns:rows.columns,rowCount:Math.max(rows.values.length+20,100)};
  });
  nlpsSetupAssert_(defs.length,'At least one spreadsheet definition is required.');
  var created=Sheets.Spreadsheets.create({
    properties:{title:title,timeZone:'America/Chicago'},
    sheets:defs.map(function(definition){return{properties:{title:definition.name,gridProperties:{rowCount:definition.rowCount,columnCount:Math.max(definition.columns,12),frozenRowCount:definition.rows.length?1:0}}};})
  });
  var spreadsheetId=created.spreadsheetId;
  nlpsSetupAssert_(spreadsheetId,'Google Sheets did not return a spreadsheet ID.');
  var valueData=defs.filter(function(definition){return definition.rows.length;}).map(function(definition){return{range:nlpsFastA1Title_(definition.name)+'!A1',majorDimension:'ROWS',values:definition.rows};});
  if(valueData.length)Sheets.Spreadsheets.Values.batchUpdate({valueInputOption:'RAW',data:valueData},spreadsheetId);
  DriveApp.getFileById(spreadsheetId).moveTo(folder);
  var metadata=Sheets.Spreadsheets.get(spreadsheetId,{fields:'spreadsheetId,spreadsheetUrl,sheets.properties(sheetId,title)'});
  return{id:spreadsheetId,url:metadata.spreadsheetUrl||('https://docs.google.com/spreadsheets/d/'+spreadsheetId+'/edit'),sheets:(metadata.sheets||[]).map(function(sheet){return{id:sheet.properties.sheetId,name:sheet.properties.title};})};
}
function nlpsFastCreateCoreWorkbook_(schema,folder,installationId){
  nlpsSetupAssert_(schema&&Array.isArray(schema.sheets)&&schema.sheets.length===81,'Northern Lakes core workbook requires exactly 81 sheet definitions.');
  var created=nlpsFastCreateSpreadsheet_(NLPS_SETUP.BUSINESS_NAME+' — Business Office — '+installationId,schema.sheets.map(function(sheet){return{name:sheet.name,rows:sheet.rows||[]};}),folder);
  var spreadsheet=SpreadsheetApp.openById(created.id);
  spreadsheet.setSpreadsheetTimeZone('America/Chicago');
  return spreadsheet;
}
function nlpsFastCreateExamples_(folder){
  var definitions=nlpsExampleDefinitions_();
  nlpsSetupAssert_(definitions.length===13,'Northern Lakes training requires exactly 13 example sheets.');
  var created=nlpsFastCreateSpreadsheet_('Northern Lakes — Examples and Training',definitions.map(function(definition){
    return{name:definition.name,rows:[['TRAINING EXAMPLE — NOT A LIVE OPERATING RECORD'],definition.headers].concat(definition.rows||[])};
  }),folder);
  var byName={};created.sheets.forEach(function(sheet){byName[sheet.name]=sheet;});
  return definitions.map(function(definition){var sheet=byName[nlpsFastSheetTitle_(definition.name)]||{};return{name:definition.name,id:created.id,sheetId:sheet.id||'',url:created.url+(sheet.id!==undefined?'#gid='+sheet.id:'')};});
}
