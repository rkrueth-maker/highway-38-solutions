/**
 * Unified visible navigation derived from BusinessOffice_ModuleContract.gs.
 * Do not add, rename, move, enable, or delete modules in this file.
 */
function h38PortalModuleRegistry_(quoteCapabilityOwner) {
  if(typeof boGetUnifiedModuleContract_!=='function')throw new Error('Canonical unified module contract is unavailable.');
  var contract=boGetUnifiedModuleContract_();
  var groups={};
  (contract.groups||[]).forEach(function(group){
    groups[group.id]={id:group.id,label:group.label,icon:group.icon||'',order:Number(group.order||0),items:[]};
  });
  (contract.modules||[]).forEach(function(item){
    if(item.visible!==true||!item.route||!groups[item.group])return;
    groups[item.group].items.push({
      key:item.route,
      label:item.label,
      icon:item.icon||'',
      type:item.type==='business'?'business':'native',
      module:item.module,
      gate:item.gate,
      capability:item.capability||'',
      capabilityOwner:item.module==='quotes'?(quoteCapabilityOwner||'legacyQuotes'):'',
      keywords:item.keywords||'',
      secondary:item.secondary===true,
      dependencies:(item.dependencies||[]).slice(),
      loadStrategy:item.loadStrategy||'on-demand',
      cacheTtlSeconds:Number(item.cacheTtlSeconds||0),
      dataOwner:item.dataOwner||'',
      disablePolicy:item.disablePolicy||'soft-disable-preserve-records'
    });
  });
  return Object.keys(groups).map(function(key){return groups[key];}).sort(function(a,b){return a.order-b.order;}).filter(function(group){return group.items.length>0;});
}
