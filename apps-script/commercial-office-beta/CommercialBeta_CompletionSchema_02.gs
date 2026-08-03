function cbEnsureCompletionSchema_(core,inventory,assets){
  Object.keys(CB_COMPLETION_HEADERS.core).forEach(function(name){cbPlatformEnsureHeaders_(core,name,CB_COMPLETION_HEADERS.core[name]);});
  Object.keys(CB_COMPLETION_HEADERS.inventory).forEach(function(name){cbPlatformEnsureHeaders_(inventory,name,CB_COMPLETION_HEADERS.inventory[name]);});
  return {core:core,inventory:inventory,assets:assets};
}
