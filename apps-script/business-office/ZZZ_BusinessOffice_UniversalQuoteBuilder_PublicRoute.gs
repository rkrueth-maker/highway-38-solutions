/**
 * Unified-shell public route extension for matched Office-backed UQB packages.
 *
 * This assignment intentionally replaces only the public route dispatcher.
 * Authentication and every private Business Office route remain unchanged.
 */
h38UnifiedShellPublicUqbRoute_=function(event){
  var proposalToken=h38UnifiedShellParameter_(event,'proposal');
  var status=h38UnifiedShellParameter_(event,'publicUqbStatus');
  var demo=h38UnifiedShellParameter_(event,'publicUqbDemo');
  var packageKey=h38UnifiedShellParameter_(event,'publicUqbPackage');
  var packageView=h38UnifiedShellParameter_(event,'view');
  var drawing=h38UnifiedShellParameter_(event,'publicUqbDrawing');
  var quote=h38UnifiedShellParameter_(event,'publicUqbQuote');
  if(proposalToken){
    if(typeof boRenderCustomerProposal_!=='function')throw new Error('Customer proposal renderer is unavailable.');
    return boRenderCustomerProposal_(proposalToken);
  }
  if(status==='1'){
    if(typeof boRenderUniversalPublicOfficeStatus_!=='function')throw new Error('Published Office demonstration status is unavailable.');
    return boRenderUniversalPublicOfficeStatus_();
  }
  if(demo==='1'){
    if(typeof boRenderUniversalPublicExamples_==='function')return boRenderUniversalPublicExamples_();
    if(typeof boRenderUniversalPublicDemo_!=='function')throw new Error('Published Universal Quote Builder demonstration is unavailable.');
    return boRenderUniversalPublicDemo_();
  }
  if(packageKey){
    if(typeof boRenderUniversalPublicExamplePackage_!=='function')throw new Error('Published quote and CAD package renderer is unavailable.');
    return boRenderUniversalPublicExamplePackage_(packageKey,packageView);
  }
  if(drawing){
    if(typeof boRenderUniversalPublicDrawing_!=='function')throw new Error('Published drawing renderer is unavailable.');
    return boRenderUniversalPublicDrawing_(drawing);
  }
  if(quote){
    if(typeof boRenderUniversalPublicQuote_!=='function')throw new Error('Published quote renderer is unavailable.');
    return boRenderUniversalPublicQuote_(quote);
  }
  return null;
};
