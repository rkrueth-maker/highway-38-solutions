function h38PortalPrivateResellerCanView_(access){
  var email=String(access&&access.user&&access.user.Email||'').trim().toLowerCase();
  return email==='highway38solutions@gmail.com'||email==='mandakw55@gmail.com';
}
