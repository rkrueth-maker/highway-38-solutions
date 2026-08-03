/** Multiple business-type setup using the existing isolated installer and workbooks. */
function cbPlatformIndustryPacks_(value){return cbNormalizeIndustryPacks_(value);}
function cbIndustryPacksFromRow_(row){var packs=cbPlatformIndustryPacks_(row&&row['Industry Pack']);return packs.length?packs:[CB_CONFIG.industryPacks[0]];}
function cbPlatformWriteIndustryRows_(core,businessId,packs,primary){
  var sheet=core.getSheetByName('businessIndustries'),existing=cbRows_(core,'businessIndustries'),now=cbNow_();
  packs.forEach(function(pack){var row=existing.find(function(item){return item['Industry Pack']===pack;});if(row)cbPlatformUpdateRow_(core,'businessIndustries',row.__row,{'Primary':pack===primary?'Yes':'No','Status':'Active','Updated Time':now,'Record Version':Math.max(1,Number(row['Record Version']||1))+1});else cbAppend_(core,'businessIndustries',{'Business Industry ID':cbUuid_('INDUSTRY'),'Business ID':businessId,'Industry Pack':pack,'Primary':pack===primary?'Yes':'No','Status':'Active','Created Time':now,'Updated Time':now,'Record Version':1});
  });
  existing.filter(function(item){return packs.indexOf(item['Industry Pack'])<0&&item.Status==='Active';}).forEach(function(row){cbPlatformUpdateRow_(core,'businessIndustries',row.__row,{'Status':'Inactive','Primary':'No','Updated Time':now,'Record Version':Math.max(1,Number(row['Record Version']||1))+1});});
}
function cbPlatformUpdateManifest_(business,install,packs,primary){
  try{
    var root=DriveApp.getFolderById(business['Tenant Root Folder ID']),systems=root.getFoldersByName('00 — System');if(!systems.hasNext()||!install)return;
    var system=systems.next(),name='installation-manifest-'+install['Installation ID']+'.json',files=system.getFilesByName(name);if(!files.hasNext())return;
    var file=files.next(),manifest=cbParseJson_(file.getBlob().getDataAsString(),{});manifest.industryPack=primary;manifest.primaryIndustryPack=primary;manifest.industryPacks=packs;manifest.schemaVersion=CB_CONFIG.schemaVersion;manifest.installerVersion=CB_CONFIG.version;manifest.updatedTime=cbNow_();file.setContent(cbJson_(manifest));
  }catch(error){cbError_(business['Business ID'],'UPDATE INSTALLATION MANIFEST',error);}
}
function cbPlatformUpdateInstallationIndustry_(businessId,packs,primary){
  var control=cbControlSpreadsheet_(),business=cbRows_(control,CB_CONTROL_SHEETS.BUSINESSES).find(function(row){return row['Business ID']===businessId;});cbAssert_(business,'Business installation was not found.');
  var encoded=JSON.stringify(packs),now=cbNow_();cbPlatformUpdateRow_(control,CB_CONTROL_SHEETS.BUSINESSES,business.__row,{'Industry Pack':encoded,'Updated Time':now});
  var install=cbRows_(control,CB_CONTROL_SHEETS.INSTALLATIONS).find(function(row){return row['Business ID']===businessId;});if(install)cbPlatformUpdateRow_(control,CB_CONTROL_SHEETS.INSTALLATIONS,install.__row,{'Industry Pack':encoded,'Schema Version':CB_CONFIG.schemaVersion,'Installer Version':CB_CONFIG.version,'Updated Time':now});cbPlatformUpdateManifest_(business,install,packs,primary);
  var core=SpreadsheetApp.openById(business['Core Spreadsheet ID']),assets=SpreadsheetApp.openById(business['Asset Spreadsheet ID']);cbEnsurePlatformSchema_(core,assets);
  var coreBusiness=cbRows_(core,'businesses').find(function(row){return row['Business ID']===businessId;});if(coreBusiness)cbPlatformUpdateRow_(core,'businesses',coreBusiness.__row,{'Industry Pack':encoded,'Updated Time':now,'Record Version':Math.max(1,Number(coreBusiness['Record Version']||1))+1});
  cbPlatformWriteIndustryRows_(core,businessId,packs,primary);cbAudit_(businessId,'UPDATE BUSINESS TYPES','Business',businessId,'PASS','Selected business types: '+packs.join(', '));return business;
}
function cbCreateBusinessV2_(request){
  var input=request||{},packs=cbPlatformIndustryPacks_(input.industryPacks),primary=cbText_(input.primaryIndustryPack);cbAssert_(packs.length,'Select at least one approved business type.');if(packs.indexOf(primary)<0)primary=packs[0];
  var result=cbCreateBusiness_(Object.assign({},input,{industryPack:primary}));var businessId=result.businessId;cbAssert_(businessId,'Business installation did not return an ID.');cbPlatformUpdateInstallationIndustry_(businessId,packs,primary);
  result.industryPack=primary;result.primaryIndustryPack=primary;result.industryPacks=packs;result.message=result.status==='EXISTS'?'Existing business updated with the selected business types.':'Isolated business created with multiple business types.';return result;
}
function cbPlatformBusinessList_(){return cbListBusinesses_().map(function(item){item.industryPacks=cbPlatformIndustryPacks_(item.industryPack);item.primaryIndustryPack=item.industryPacks[0]||item.industryPack;return item;});}
