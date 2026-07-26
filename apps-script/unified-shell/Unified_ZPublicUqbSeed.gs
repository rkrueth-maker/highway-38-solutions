/** Extend the existing narrow public UQB route with deterministic CSV seed feeds. */
function h38UnifiedShellPublicUqbRoute_(event){
  var proposalToken=h38UnifiedShellParameter_(event,'proposal');
  var seed=h38UnifiedShellParameter_(event,'publicUqbSeed');
  var demo=h38UnifiedShellParameter_(event,'publicUqbDemo');
  var drawing=h38UnifiedShellParameter_(event,'publicUqbDrawing');
  var quote=h38UnifiedShellParameter_(event,'publicUqbQuote');
  if(proposalToken){
    if(typeof boRenderCustomerProposal_!=='function')throw new Error('Customer proposal renderer is unavailable.');
    return boRenderCustomerProposal_(proposalToken);
  }
  if(seed){
    if(typeof boRenderUniversalPublicSeed_!=='function')throw new Error('Published Universal Quote Builder seed is unavailable.');
    return boRenderUniversalPublicSeed_(seed);
  }
  if(demo==='1'){
    if(typeof boRenderUniversalPublicDemo_!=='function')throw new Error('Published Universal Quote Builder demonstration is unavailable.');
    return boRenderUniversalPublicDemo_();
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
}
