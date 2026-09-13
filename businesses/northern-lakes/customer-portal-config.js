/** Browser-safe Northern Lakes Customer Portal configuration.
 * The publishable key is intentionally public. Supabase Row Level Security is the authorization boundary.
 * Never add service_role, provider secrets, webhook secrets or private credentials here.
 */
window.NL_CUSTOMER_PORTAL_CONFIG=Object.freeze({
 enabled:true,
 businessId:'736a44a8-b36b-4ced-b5ed-456ed252d8ed',
 businessKey:'northern-lakes',
 businessName:'Northern Lakes Property Maintenance LLC',
 supabaseUrl:'https://jqukmwtsgcsaruucnqja.supabase.co',
 publishableKey:'sb_publishable_XrF41kGmTC2SmSTgPvo5OQ_vqcBd0N1',
 canonicalRedirectUrl:'https://highway38solutions.com/businesses/northern-lakes/customer-portal.html',
 allowedRedirectOrigins:[
  'https://highway38solutions.com',
  'https://rkrueth-maker.github.io'
 ],
 storageBucket:'customer-portal',
 payment:Object.freeze({
  mode:'provider-not-configured',
  liveChargingEnabled:false,
  testMode:true,
  adapter:'hosted-payment-url',
  notice:'Online payment setup is prepared but live charging is not active. A Pay Invoice button appears only when Northern Lakes has attached a verified hosted payment link to that invoice.'
 })
});
(function loadHighway38Attribution(){
 if(window.NL_HIGHWAY38_ATTRIBUTION||document.querySelector('script[data-nl-h38-attribution]'))return;
 const script=document.createElement('script');script.src='highway38-attribution.js?build=20260913-highway38-attribution-1';script.async=false;script.dataset.nlH38Attribution='1';document.head.appendChild(script);
})();
