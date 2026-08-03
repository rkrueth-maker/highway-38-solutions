/** Highway 38 Commercial Office Beta — isolated Google-native configuration. */
var CB_CONFIG=Object.freeze({
  version:'0.3.0',
  schemaVersion:2,
  environment:'commercial-google-native-beta',
  title:'Highway 38 Commercial Office Beta',
  rootFolderName:'Highway 38 Commercial Office Beta',
  controlWorkbookName:'Highway 38 Commercial Office Beta — Control Data',
  defaultTimeZone:'America/Chicago',
  defaultCurrency:'USD',
  ownerEmails:Object.freeze(['rkrueth@gmail.com']),
  industryPacks:Object.freeze([
    'Contractor and Property Services',
    'Landscaping and Outdoor Work',
    'Repair Shop',
    'Equipment Rental',
    'Manufacturing and Fabrication',
    'Facility Maintenance',
    'General Service Business'
  ]),
  modules:Object.freeze([
    'core','customers','work','quotes','documents','approvals','inventory','assets','fleet','maintenance',
    'purchasing','field','capture','communications','email','sms','ai','voice','offline','reports'
  ]),
  pwaAllowedOrigins:Object.freeze([
    'https://rkrueth-maker.github.io',
    'http://localhost:8000',
    'http://127.0.0.1:8000'
  ]),
  externalActionsEnabled:false,
  productionMigrationEnabled:false
});

function cbText_(value){return String(value==null?'':value).trim();}
function cbNow_(){return new Date().toISOString();}
function cbUuid_(prefix){return cbText_(prefix||'ID')+'-'+Utilities.getUuid().toUpperCase();}
function cbProperties_(){return PropertiesService.getScriptProperties();}
function cbJson_(value){return JSON.stringify(value,null,2);}
function cbAssert_(condition,message){if(!condition)throw new Error(message||'Commercial beta request is on hold.');}
function cbCurrentEmail_(){return cbText_(Session.getActiveUser().getEmail()).toLowerCase();}
function cbOwnerEmails_(){
  var configured=cbText_(cbProperties_().getProperty('COMMERCIAL_BETA_OWNER_EMAILS'));
  var values=configured?configured.split(','):CB_CONFIG.ownerEmails.slice();
  return values.map(function(email){return cbText_(email).toLowerCase();}).filter(Boolean);
}
function cbRequireOwner_(){
  var email=cbCurrentEmail_();
  cbAssert_(email,'Sign in with an authorized Google account. Anonymous access is not allowed.');
  cbAssert_(cbOwnerEmails_().indexOf(email)>=0,'This separate commercial beta is Owner-only during initial provisioning.');
  return {email:email,role:'Owner'};
}
function cbNormalizeKey_(value){
  return cbText_(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80);
}
function cbUrl_(type,id){
  if(!id)return'';
  if(type==='folder')return'https://drive.google.com/drive/folders/'+id;
  if(type==='sheet')return'https://docs.google.com/spreadsheets/d/'+id+'/edit';
  return'';
}
function cbParseJson_(value,fallback){try{return value?JSON.parse(value):fallback;}catch(error){return fallback;}}
function cbParseList_(value){
  if(Array.isArray(value))return value.map(cbText_).filter(Boolean);
  var text=cbText_(value);if(!text)return[];
  var parsed=cbParseJson_(text,null);if(Array.isArray(parsed))return parsed.map(cbText_).filter(Boolean);
  return text.split(',').map(cbText_).filter(Boolean);
}
function cbNormalizeIndustryPacks_(value){
  var seen={};return cbParseList_(value).filter(function(pack){
    if(CB_CONFIG.industryPacks.indexOf(pack)<0||seen[pack])return false;seen[pack]=true;return true;
  });
}
function cbIndustryLabel_(value){return cbNormalizeIndustryPacks_(value).join(', ');}
