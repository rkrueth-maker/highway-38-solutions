/** Highway 38 owner-only links to separately isolated customer Business Offices. */
function h38LinkedOfficeConfig(){
  boRequireOwner_();
  return {
    status:'PASS',
    businessId:'NLPS',
    name:'Northern Lakes Property Maintenance LLC',
    label:'Northern Lakes',
    shortLabel:'Northern Lakes',
    ownerOnly:true,
    url:'https://script.google.com/macros/s/AKfycbzQVvg-1E0ofK5QuBseKjTdJ5NhEjtArvbHxVCO_W329BbZxfSO0F6ENJd5zgvMLGaL/exec',
    setupUrl:'https://script.google.com/macros/s/AKfycbzQVvg-1E0ofK5QuBseKjTdJ5NhEjtArvbHxVCO_W329BbZxfSO0F6ENJd5zgvMLGaL/exec?setup=1',
    isolated:true
  };
}
