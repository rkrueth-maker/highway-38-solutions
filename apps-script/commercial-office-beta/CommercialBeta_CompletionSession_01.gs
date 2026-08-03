/** Signed-in session access used by the custom-domain Business Office shell. */
function cbSessionAccess(){
  var signed=cbCompletionSignedIn_();
  return {
    status:'PASS',
    canSwitchBusinesses:cbCompletionOwnerEmail_(signed.email),
    businesses:cbCompletionVisibleBusinesses_()
  };
}
