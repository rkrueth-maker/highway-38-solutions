/** Owner-only public log readers for the Portal UI. */
function h38PortalProofLog(query) {
  h38PortalAssertOwner_();
  return h38PortalSearchLegacyLog_('Proof Log', query || '');
}

function h38PortalErrorLog(query) {
  h38PortalAssertOwner_();
  return h38PortalSearchLegacyLog_('Error Log', query || '');
}
