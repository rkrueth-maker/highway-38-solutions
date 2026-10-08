/* inventory-checker.js — low-stock detection + alerts (build 20261004-inventory-low-stock-1)
   Toggle: inventory_low_stock (Owner Controls, default ON — internal feature).
   Reuses the exact on-hand math from renderInventory in app-11.js. */
(function(){
'use strict';

/* Register the toggle with Owner Controls WITHOUT editing owner-controls.js */
try{
  var oc=window.H38OwnerControls,
      T={id:'inventory_low_stock',title:'Low-stock checker',
         desc:'Automatically flag inventory items at or below their reorder point and raise alerts.',
         icon:'📦',default:true,category:'Inventory'};
  if(oc&&oc.FEATURES&&!oc.FEATURES.some(function(f){return f&&f.id===T.id;}))oc.FEATURES.push(T);
}catch(e){}

function enabled(){
  try{var oc=window.H38OwnerControls;return !!(oc&&oc.isEnabled&&oc.isEnabled('inventory_low_stock'));}
  catch(e){return false;}
}

/* Map of Item ID -> on-hand, using the exact math from renderInventory() */
function computeStock(){
  var stock=new Map();
  (records('inventoryTransactions')||[]).forEach(row=>{
    const id=v(row,'Item ID'),qty=Math.abs(num(v(row,'Quantity'))),dir=String(v(row,'Direction')).toUpperCase();
    stock.set(id,(stock.get(id)||0)+(dir==='OUT'?-qty:qty));
  });
  return stock;
}

/* Items with a reorder point set and on-hand at or below it, most urgent first */
function lowStockItems(){
  var stock=computeStock();
  return (records('priceBook')||[])
    .map(item=>({item:item,onHand:stock.get(v(item,'Item ID'))||0,reorderPoint:num(v(item,'Reorder Point'))}))
    .filter(x=>x.reorderPoint>0&&x.onHand<=x.reorderPoint)
    .sort((a,b)=>(a.onHand/a.reorderPoint)-(b.onHand/b.reorderPoint));
}

/* Create one Open inventoryAlerts row per low item (deduped), forward to deal alerts */
async function checkLowStock(){
  var low=lowStockItems(),created=0;
  for(const x of low){
    const itemId=v(x.item,'Item ID');
    const open=(records('inventoryAlerts')||[])
      .some(r=>v(r,'Item ID')===itemId&&String(v(r,'Status')).toUpperCase()==='OPEN');
    if(open)continue;
    const id=newId('ALERT');
    const record={'Alert ID':id,'Business ID':state.businessId,'Item ID':itemId,
      'SKU':v(x.item,'SKU'),'Description':v(x.item,'Description'),
      'On Hand':x.onHand,'Reorder Point':x.reorderPoint,
      'Status':'Open','Created Time':now(),'Created By':state.snapshot.user.userId,'Record Version':1};
    await queueOperation('RECORD_LOW_STOCK','Inventory Alert',id,
      {entity:'inventoryAlerts',record:record},
      {collection:'inventoryAlerts',record:record,idKeys:['Alert ID']});
    created++;
    try{
      if(window.H38DealAlerts&&window.H38DealAlerts.recordAlert)
        window.H38DealAlerts.recordAlert({type:'low_stock',
          title:'Low stock: '+v(x.item,'Description'),
          detail:x.onHand+' on hand / reorder at '+x.reorderPoint,
          severity:x.onHand<=0?'urgent':'warn'});
    }catch(e){}
  }
  toast('Low-stock check: '+low.length+' item'+(low.length===1?'':'s')+' at or below reorder point'+
        (created?', '+created+' new alert'+(created===1?'':'s'):' — no new alerts')+'.');
  if(typeof renderInventory==='function')renderInventory();
  return low;
}

/* Mark the newest Open alert for an item as Ordered */
async function markOrdered(itemId){
  var openAlerts=(records('inventoryAlerts')||[])
    .filter(r=>v(r,'Item ID')===itemId&&String(v(r,'Status')).toUpperCase()==='OPEN')
    .sort((a,b)=>String(v(b,'Created Time')).localeCompare(String(v(a,'Created Time'))));
  if(!openAlerts.length){toast('No open alert for that item.',true);return;}
  var alert=openAlerts[0],record=Object.assign({},alert,{'Status':'Ordered'});
  await queueOperation('SAVE_ENTITY','Inventory Alert',v(alert,'Alert ID'),
    {entity:'inventoryAlerts',record:record},
    {collection:'inventoryAlerts',record:record,idKeys:['Alert ID']});
  toast('Alert marked as ordered.');
  if(typeof renderInventory==='function')renderInventory();
}

/* Low-stock card for the Inventory page */
function lowStockCard(){
  var low=lowStockItems();
  var rows=low.length?low.map(x=>{
    const itemId=esc(v(x.item,'Item ID'));
    return `<div class="row"><div class="row-top"><strong>${esc(v(x.item,'Description'))}</strong>`+
      `${pill(x.onHand+' / reorder '+x.reorderPoint,x.onHand<=0?'bad':'warn')}</div>`+
      `<small>${esc(v(x.item,'SKU'))} · ${x.onHand} ${esc(v(x.item,'Unit of Measure')||'')} on hand</small>`+
      `<div class="actions"><button onclick="H38Inventory.markOrdered('${itemId}')">Mark ordered</button></div></div>`;
  }).join(''):empty('No low-stock items. Everything is above its reorder point.');
  return `<section class="card span7"><h2>Low stock — reorder list (${low.length} item${low.length===1?'':'s'})</h2>`+
    `<div class="actions"><button onclick="H38Inventory.checkLowStock()">Check stock now</button></div>`+
    `<div class="list">${rows}</div></section>`;
}

window.lowStockCard=lowStockCard;
window.H38Inventory={
  computeStock:computeStock,
  lowStockItems:lowStockItems,
  checkLowStock:checkLowStock,
  markOrdered:markOrdered,
  lowStockCard:lowStockCard,
  enabled:enabled,
  BUILD:'20261004-inventory-low-stock-1'
};
})();
