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
  // Public presentation only. Membership and records always come from Supabase.
  let entryBusiness=null;
  let entryPortal='';

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
    if(brandName){brandName.textContent=businessName;brandName.dataset.h38FullBrand=businessName;brandName.dataset.h38ShortBrand=text(brand.shortName||businessName);}
    const shellLabel=document.getElementById('shellLabel');
    if(shellLabel)shellLabel.textContent='Business Office';
    const theme=document.querySelector('meta[name="theme-color"]');
    if(theme)theme.setAttribute('content',primary);
    document.title=`${businessName} Business Office`;
  }

  function current(){
    apply(window.state?.snapshot || {business:entryBusiness || {}});
  }
  function loginBrand(){
    if(!entryBusiness || window.state?.snapshot?.user)return;
    current();
    const kicker=document.querySelector('.h38-access-kicker');
    if(kicker)kicker.textContent=entryBusiness.businessName+' secure access';
    const customer=document.querySelector('.h38-customer-access');
    if(customer&&entryPortal)customer.href=entryPortal;
  }
  addEventListener('h38:business-snapshot-updated',current);
  addEventListener('h38:auth-cleared',()=>{apply({business:entryBusiness || {}});});
  addEventListener('h38:auth-panel-rendered',loginBrand);
  const entryKey=new URLSearchParams(location.search).get('businessKey');
  if(entryKey==='northern-lakes'){
    fetch('../business-packs/northern-lakes/supabase-business-pack.json',{cache:'no-cache'})
      .then(response=>{if(!response.ok)throw new Error('Brand configuration unavailable');return response.json();})
      .then(pack=>{
        if(pack.business?.businessKey!==entryKey || pack.package?.systemOfRecord!=='supabase')return;
        entryBusiness={businessKey:entryKey,businessName:pack.business.displayName,brandConfig:pack.branding};
        entryPortal=pack.urls?.customerPortal || '';
        if(!window.state?.snapshot?.user)loginBrand();
      }).catch(()=>{ /* Branding failure must never open another runtime or grant access. */ });
  }

  window.H38_CLIENT_BRANDING={enabled:true,apply};
})();
