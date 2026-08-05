(function () {
  'use strict';

  const auth=window.H38_SUPABASE_AUTH;
  const Bridge=window.H38Bridge;
  if(!auth || auth.enabled!==true || !Bridge || !Bridge.prototype)return;

  const previousConnect=Bridge.prototype.connect;
  Bridge.prototype.connect=async function(){
    const result=await previousConnect.apply(this,arguments);
    const businessId=String(auth.getState().selectedBusinessId || window.state?.businessId || '');
    if(!this.ready || !businessId || this.__h38OperationalHydration)return result;
    this.__h38OperationalHydration=true;
    try{
      const snapshot=await this.request('fullStartupRefresh',{businessId},45000);
      if(snapshot && typeof this.onFullSnapshot==='function')await this.onFullSnapshot(snapshot,businessId);
    }catch(error){
      console.warn('Final Supabase Business Office hydration:',error.message || error);
    }finally{
      this.__h38OperationalHydration=false;
    }
    return result;
  };
})();
