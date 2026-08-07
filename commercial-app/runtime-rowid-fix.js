(function(){
'use strict';
if(typeof window.rowId==='function')return;
function value(row,keys){
  for(const key of keys){
    if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];
  }
  return '';
}
window.rowId=function(row,...keys){return String(value(row,keys));};
window.H38_RUNTIME_ROWID_FIX=Object.freeze({
  enabled:true,
  build:'20260806-2145',
  purpose:'Expose the existing record-id helper safely to later browser modules.'
});
})();
