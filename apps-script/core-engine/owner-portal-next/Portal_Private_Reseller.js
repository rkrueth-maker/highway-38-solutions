function h38PortalPrivateResellerCanView_(access){
  // The private Reseller Scout is owned by the Supabase-authenticated commercial
  // shell. Never surface it through the legacy Apps Script application shell.
  return false;
}
