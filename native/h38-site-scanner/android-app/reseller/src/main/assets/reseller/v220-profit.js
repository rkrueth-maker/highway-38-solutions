'use strict';
(function(root){
  const known=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  const n=v=>known(v)?Number(v):null;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const pct=v=>known(v)?Number(v):null;
  const round2=v=>known(v)?Math.round(Number(v)*100)/100:null;
  const median=values=>{const a=(values||[]).map(Number).filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2};
  const average=values=>{const a=(values||[]).map(Number).filter(Number.isFinite);return a.length?a.reduce((s,x)=>s+x,0)/a.length:null};
  const trim=values=>{const a=(values||[]).map(Number).filter(Number.isFinite).sort((x,y)=>x-y);if(a.length<5)return a;const cut=Math.floor(a.length*.1);return a.slice(cut,Math.max(cut+1,a.length-cut))};
  const confidenceRank=v=>({high:1,medium:.65,low:.35,unknown:.15})[String(v||'unknown').toLowerCase()]??.15;
  const freshnessRank=age=>{if(!known(age))return .45;age=Number(age);if(age<=7)return 1;if(age<=30)return .85;if(age<=90)return .65;if(age<=180)return .4;return .2};
  const burdenRank=v=>{v=String(v||'').toLowerCase();if(!v||v==='easy'||v==='low')return 1;if(v==='medium'||v==='moderate')return .6;return .25};
  function compSummary(input={}){
    const prices=(input.soldPrices||[]).map(Number).filter(x=>Number.isFinite(x)&&x>0),trimmed=trim(prices);
    const soldCount=known(input.soldCount)?Number(input.soldCount):prices.length;
    const activeCount=known(input.activeCount)?Number(input.activeCount):null;
    const med=known(input.soldMedian)?Number(input.soldMedian):median(trimmed.length?trimmed:prices);
    const low=known(input.soldLow)?Number(input.soldLow):(trimmed.length?trimmed[0]:null);
    const high=known(input.soldHigh)?Number(input.soldHigh):(trimmed.length?trimmed[trimmed.length-1]:null);
    const avg=known(input.soldAverage)?Number(input.soldAverage):average(trimmed.length?trimmed:prices);
    const askingLow=n(input.askingLow),askingHigh=n(input.askingHigh);
    const established=soldCount>0&&known(med)&&med>0;
    const sellThrough=established&&known(activeCount)?soldCount/Math.max(1,soldCount+activeCount):null;
    return {established,soldCount,activeCount,median:round2(med),average:round2(avg),low:round2(low),high:round2(high),askingLow:round2(askingLow),askingHigh:round2(askingHigh),sellThrough:sellThrough===null?null:round2(sellThrough),marketplace:input.marketplace||'',conditionMatch:input.conditionMatch||'unknown',freshnessDays:n(input.freshnessDays),confidence:String(input.confidence||'unknown').toLowerCase()};
  }
  function costValue(explicit,base,rate){if(known(explicit))return Number(explicit);if(known(rate)&&known(base))return Number(base)*Number(rate);return null}
  function evaluateOpportunity(input={}){
    const acquisition=n(input.acquisitionPrice),comp=compSummary(input),reasons=[],warnings=[];
    if(acquisition===null)return {recommendedAction:'NEEDS PRICE',dealScore:null,reasons:['Acquisition price is not established.'],warnings,comp};
    if(input.locationRequired===true&&input.locationKnown!==true)return {recommendedAction:'NEEDS LOCATION',dealScore:null,reasons:['Location is required before this opportunity can be ranked.'],warnings,comp};
    if(!comp.established){
      if(comp.activeCount>0||known(comp.askingLow)||known(comp.askingHigh))warnings.push('ASKING MARKET ONLY — active listings do not establish sold value.');
      return {recommendedAction:'NEEDS COMP',dealScore:null,reasons:['Verified sold/completed evidence is not sufficient to establish resale value.'],warnings,comp,acquisitionPrice:acquisition};
    }
    const resale=comp.median,fee=costValue(input.marketplaceFees,resale,pct(input.marketplaceFeeRate)),payment=costValue(input.paymentFees,resale,pct(input.paymentFeeRate));
    const shipping=n(input.shipping),tax=costValue(input.taxAllowance,acquisition,pct(input.taxRate)),travel=known(input.travelCost)?Number(input.travelCost):(known(input.travelMiles)&&known(input.mileageRate)?Number(input.travelMiles)*Number(input.mileageRate):null),premium=costValue(input.buyerPremium,acquisition,pct(input.buyerPremiumRate)),other=n(input.otherAcquisitionFees);
    const required={marketplaceFees:fee,paymentFees:payment,shipping,taxAllowance:tax,travelCost:travel,buyerPremium:premium,otherAcquisitionFees:other};
    const unknown=Object.entries(required).filter(([k,v])=>v===null&&input.requiredCosts?.includes?.(k)).map(([k])=>k);
    if(unknown.length){warnings.push(`Missing required cost evidence: ${unknown.join(', ')}.`);return {recommendedAction:'NEEDS VERIFICATION',dealScore:null,reasons:['Profit cannot be responsibly finalized until required costs are known.'],warnings,comp,acquisitionPrice:acquisition,resaleEstimate:resale};}
    const fees=(fee||0)+(payment||0),acqCosts=acquisition+(tax||0)+(premium||0)+(other||0)+(travel||0),sellingCosts=fees+(shipping||0),net=resale-sellingCosts,profit=net-acqCosts,roi=acqCosts>0?profit/acqCosts:null,margin=resale>0?profit/resale:null;
    const minProfit=known(input.minimumProfit)?Number(input.minimumProfit):25,minRoi=known(input.minimumROI)?Number(input.minimumROI):.5;
    let score=0;const parts=[];
    const profitPart=clamp((profit/Math.max(1,minProfit))*18,0,25);score+=profitPart;parts.push(['profit',profitPart]);
    const roiPart=roi===null?0:clamp((roi/Math.max(.01,minRoi))*14,0,20);score+=roiPart;parts.push(['roi',roiPart]);
    const marginPart=margin===null?0:clamp(margin*20,0,10);score+=marginPart;parts.push(['margin',marginPart]);
    const compPart=clamp((Math.log2(Math.max(1,comp.soldCount+1))/5)*15,2,15);score+=compPart;parts.push(['sold history',compPart]);
    const freshPart=freshnessRank(comp.freshnessDays)*8;score+=freshPart;parts.push(['freshness',freshPart]);
    const confPart=confidenceRank(comp.confidence)*8;score+=confPart;parts.push(['confidence',confPart]);
    const sellPart=comp.sellThrough===null?3:clamp(comp.sellThrough*10,1,6);score+=sellPart;parts.push(['sell-through',sellPart]);
    const dist=known(input.distanceMiles)?Number(input.distanceMiles):null,distPart=dist===null?2:dist<=10?4:dist<=25?3:dist<=50?2:dist<=100?1:0;score+=distPart;parts.push(['distance',distPart]);
    const burden=(burdenRank(input.shippingBurden)+burdenRank(input.sizeWeightBurden))/2*4;score+=burden;parts.push(['handling',burden]);
    score=Math.round(clamp(score,0,100));
    if(profit>=minProfit)reasons.push(`Expected profit ${round2(profit)} meets the ${round2(minProfit)} target.`);else reasons.push(`Expected profit ${round2(profit)} is below the ${round2(minProfit)} target.`);
    if(roi!==null)reasons.push(`Expected ROI ${Math.round(roi*100)}%.`);
    if(comp.soldCount>0)reasons.push(`${comp.soldCount} sold/completed comp${comp.soldCount===1?'':'s'} support the resale estimate.`);
    if(dist!==null)reasons.push(`${round2(dist)} mile travel burden.`);
    if(comp.freshnessDays!==null&&comp.freshnessDays>90)warnings.push(`Sold evidence is ${Math.round(comp.freshnessDays)} days old.`);
    if(String(comp.conditionMatch).toLowerCase()==='poor')warnings.push('Condition match is weak.');
    if(input.acquisitionUncertain===true)warnings.push('Acquisition price still needs local verification.');
    const action=profit<=0||roi===null||roi<0?'PASS':score>=75&&profit>=minProfit&&roi>=minRoi?'BUY':score>=55&&profit>0?'MAYBE':'PASS';
    const scoreReasons=parts.sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,value])=>`${name}: ${Math.round(value)} score points`);
    return {recommendedAction:action,dealScore:score,scoreReasons,reasons,warnings,acquisitionPrice:round2(acquisition),resaleEstimate:round2(resale),resaleLow:comp.low,resaleHigh:comp.high,marketplaceFees:round2(fee||0),paymentFees:round2(payment||0),shipping:round2(shipping||0),taxAllowance:round2(tax||0),travelCost:round2(travel||0),buyerPremium:round2(premium||0),otherAcquisitionFees:round2(other||0),expectedNetProceeds:round2(net),expectedProfit:round2(profit),roi:roi===null?null:round2(roi),margin:margin===null?null:round2(margin),sellThrough:comp.sellThrough,confidence:comp.confidence,comp};
  }
  function maxBid(input={}){
    const comp=compSummary(input);if(!comp.established)return {status:'NOT YET PROVEN',reason:'Verified sold comps are required before a responsible max bid can be calculated.',comp};
    if(!known(input.buyerPremiumRate))return {status:'NOT YET PROVEN',reason:'Buyer premium unknown',comp};
    const qty=known(input.quantity)?Math.max(1,Number(input.quantity)):1,resale=comp.median*qty;
    const sellFee=costValue(input.marketplaceFees,resale,pct(input.marketplaceFeeRate)),paymentSell=costValue(input.paymentFees,resale,pct(input.paymentFeeRate)),shipping=n(input.shipping),travel=n(input.travelCost),risk=n(input.riskBuffer),other=n(input.otherFixedAcquisitionFees);
    const missing=[];for(const [k,v] of [['marketplace fees',sellFee],['payment fees',paymentSell],['shipping/freight',shipping],['travel cost',travel],['risk buffer',risk],['other acquisition fees',other]])if(v===null&&input.requiredBidCosts?.includes?.(k))missing.push(k);
    if(missing.length)return {status:'NOT YET PROVEN',reason:`Missing ${missing.join(', ')}`,comp};
    const netBeforeAcq=resale-(sellFee||0)-(paymentSell||0)-(shipping||0)-(travel||0)-(risk||0),requiredProfit=known(input.minimumProfit)?Number(input.minimumProfit):0,minRoi=known(input.minimumROI)?Math.max(0,Number(input.minimumROI)):0;
    const allInByProfit=netBeforeAcq-requiredProfit,allInByRoi=minRoi>0?netBeforeAcq/(1+minRoi):Infinity,allowedAllIn=Math.min(allInByProfit,allInByRoi);
    const premiumRate=Number(input.buyerPremiumRate),taxRate=known(input.taxRate)?Number(input.taxRate):0,paymentRate=known(input.acquisitionPaymentFeeRate)?Number(input.acquisitionPaymentFeeRate):0,rate=1+premiumRate+taxRate+paymentRate;
    const hammer=Math.max(0,(allowedAllIn-(other||0))/Math.max(.0001,rate));
    if(!(hammer>0))return {status:'NOT YET PROVEN',reason:'Required profit/ROI leaves no responsible bid room.',comp};
    return {status:'PROVEN',maxHammerBid:round2(hammer),estimatedResale:round2(resale),expectedSellingCosts:round2((sellFee||0)+(paymentSell||0)+(shipping||0)),travelCost:round2(travel||0),riskBuffer:round2(risk||0),requiredProfit:round2(requiredProfit),buyerPremiumRate:premiumRate,taxRate,minimumROI:minRoi,comp};
  }
  function classifyGlitch(input={}){const current=n(input.currentPrice),reference=n(input.referencePrice);if(current===null||reference===null||reference<=0||current>=reference)return null;const drop=(reference-current)/reference;if(drop<.4)return null;return {label:'GLITCH CANDIDATE',dropPct:Math.round(drop*100),currentPrice:round2(current),referencePrice:round2(reference),verified:false,message:'Unusual drop detected; retailer error is not established.'};}
  root.H38_SCOUT_V220_PROFIT_ENGINE=true;
  root.H38Profit=Object.freeze({known,compSummary,evaluateOpportunity,maxBid,classifyGlitch});
})(typeof window!=='undefined'?window:globalThis);
