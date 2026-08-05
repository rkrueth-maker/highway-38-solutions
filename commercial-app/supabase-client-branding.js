(function () {
  'use strict';

  const auth=window.H38_SUPABASE_AUTH;
  const Bridge=window.H38Bridge;
  if(!auth || auth.enabled!==true || !Bridge || !Bridge.prototype)return;

  const DEFAULTS={
    businessName:'Highway 38 Solutions',
    logoUrl:'../assets/highway38-logo.png?v=20260720-exact-0cbc4514',
    primaryColor:'#0b2438',
    secondaryColor:'#eef3f7',
    accentColor:'#d86d2b',
    neutralColor:'#152536',
    themeColor:'#0b2438'
  };
  const previousRequest=Bridge.prototype.request;
  const previousConnect=Bridge.prototype.connect;

  function text(value){return String(value==null?'':value);}
  function safeColor(value,fallback){
    const candidate=text(value).trim();
    return /^#[0-9a-f]{6}$/i.test(candidate)?candidate:fallback;
  }
  function safeLogo(value,fallback){
    const candidate=text(value).trim();
    if(!candidate)return fallback;
    try{
      const url=new URL(candidate,location.href);
      if(url.protocol!=='https:' && url.origin!==location.origin)return fallback;
      return url.toString();
    }catch(error){return fallback;}
  }
  function apply(snapshot){
    const business=snapshot?.business || {};
    const brand=business.brandConfig && typeof business.brandConfig==='object'?business.brandConfig:{};
    const businessName=text(business.businessName || business.displayName || DEFAULTS.businessName).trim() || DEFAULTS.businessName;
    const primary=safeColor(brand.primaryColor,DEFAULTS.primaryColor);
    const secondary=safeColor(brand.secondaryColor,DEFAULTS.secondaryColor);
    const accent=safeColor(brand.accentColor,DEFAULTS.accentColor);
    const neutral=safeColor(brand.neutralColor,DEFAULTS.neutralColor);
    const logo=safeLogo(brand.logoUrl,DEFAULTS.logoUrl);

    document.documentElement.style.setProperty('--navy',primary);
    document.documentElement.style.setProperty('--blue',primary);
    document.documentElement.style.setProperty('--orange',accent);
    document.documentElement.style.setProperty('--bg',secondary);
    document.documentElement.style.setProperty('--text',neutral);
    document.body.dataset.businessKey=text(business.businessKey || 'highway38');

    const logoNode=document.getElementById('approvedOfficeLogo');
    if(logoNode){logoNode.src=logo;logoNode.alt=`${businessName} logo`;}
    const brandName=document.querySelector('.brand strong');
    if(brandName)brandName.textContent=businessName;
    const shellLabel=document.getElementById('shellLabel');
    if(shellLabel)shellLabel.textContent='Business Office';
    const theme=document.querySelector('meta[name="theme-color"]');
    if(theme)theme.setAttribute('content',primary);
    document.title=`${businessName} Business Office`;
  }

  Bridge.prototype.request=async function(action,args,timeout){
    const result=await previousRequest.call(this,action,args,timeout);
    if((action==='fullStartupRefresh' || action==='completionBootstrap') && result){
      queueMicrotask(()=>apply(result));
    }
    return result;
  };

  Bridge.prototype.connect=async function(){
    const result=await previousConnect.apply(this,arguments);
    if(window.state?.snapshot)apply(window.state.snapshot);
    return result;
  };

  addEventListener('h38:auth-cleared',()=>apply({business:{businessKey:'highway38',businessName:DEFAULTS.businessName,brandConfig:DEFAULTS}}));

  window.H38_CLIENT_BRANDING={enabled:true,apply};
})();
