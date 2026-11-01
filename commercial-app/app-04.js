function equipmentOptions(selected){const eq=records('equipment').filter(e=>v(e,'Status')!=='Retired'&&v(e,'Owner Type')!=='Customer');if(!eq.length)return '<option value="" disabled>No equipment yet \u2014 add it below</option>';return eq.map(e=>{const name=v(e,'Equipment Name');return '<option value="'+esc(name)+'"'+(name===selected?' selected':'')+'>'+esc(name)+'</option>';}).join('');}
/* ---- Flow redesign (2026-10-10): customer onboarding rebuild ----
 * Dedupe uses the exact import scorer (M2, customer-import-intelligence.js)
 * against local records — best effort offline, no server round-trip needed. */
function findPossibleDuplicate(name,email,phone){
  try{
    const intel=window.H38_CUSTOMER_IMPORT_INTELLIGENCE;
    if(!intel||typeof intel.matchCustomerLocal!=='function')return null;
    const mapped={'Customer Name':String(name||''),'Email':String(email||''),'Phone':String(phone||'')};
    const list=(records('customers')||[]).map(r=>({record_key:rowId(r,'Customer ID','customerId'),payload:r}));
    const match=intel.matchCustomerLocal(mapped,list);
    return(match&&Number(match.score)>=70)?match:null;
  }catch(_){return null;}
}
function findCustomerRecord(id){
  return(records('customers')||[]).find(r=>rowId(r,'Customer ID','customerId')===String(id))||null;
}
/* Pattern 1 post-save panel for customer saves: what happened + what's next +
 * one-tap actions. First 3 customers get the expanded checklist (M8 model). */
function afterCustomerSaved(id,name,beforeCount,usedExisting,wasEdit){
  const flow=window.H38Flow;
  const record=findCustomerRecord(id);
  const hasContact=!!(String((record&&(record.Email||record.email))||'').trim()||String((record&&(record.Phone||record.phone))||'').trim());
  const hasProperty=(records('properties')||[]).some(p=>String(p['Customer ID']||p.customerId||'')===String(id));
  const hasQuote=(records('quotes')||[]).some(q=>String(q['Customer ID']||q.customerId||'')===String(id));
  const offline=!navigator.onLine;
  const firstTime=!wasEdit&&beforeCount<3;
  const displayName=String(name||'Customer');
  const onDevice=offline&&!usedExisting?' on this device':'';
  const title=usedExisting?`Customer "${displayName}" is already in the system.`:wasEdit?`Customer "${displayName}" updated${onDevice}.`:`Customer "${displayName}" saved${onDevice}.`;
  const warning=hasContact?'':'Saved without contact info — you will not be able to text or email until you add one.';
  const checklist=firstTime?[
    {done:hasContact,label:'Add contact info',detail:'A phone or email so you can text or email them.'},
    {done:hasProperty,label:'Add a property',detail:'The address where the work happens.'},
    {done:hasQuote,label:'Start a quote',detail:'Build the quote from the customer record. Nothing sends on its own.'}
  ]:null;
  const actions=[
    {label:'Start a quote',primary:true,handler:()=>flow?flow.startQuoteForCustomer(id):toast('The quote action is unavailable right now.',true)},
    {label:'Add property',handler:()=>flow?flow.openCustomerSetup('property',id):toast('The property form is unavailable right now.',true)}
  ];
  if(!hasContact)actions.push({label:'Add contact info',handler:()=>flow?flow.openCustomerSetup('customer',id):toast('The customer form is unavailable right now.',true)});
  if(flow&&typeof flow.showNextStep==='function'){
    flow.showNextStep({
      id:'h38CustomerNextStep',
      signature:['customer',id,offline?'offline':'online',firstTime?'first':'later',usedExisting?'existing':'new'].join('|'),
      title,next:'add a property or start a quote.',offline,checklist,warning,actions,
      heading:firstTime?'Your first customers — step by step. Nothing here blocks you; every step works by hand.':'',
      dismissLabel:'Done'
    });
  }else{
    toast(title+(offline?' Saved on this device.':''),false);
  }
}
function renderCustomers(){
  const customers=records('customers'),properties=records('properties');
  $('mainContent').innerHTML=pageHead('Customers','Find a customer, add a new one, and start their quote, job, or visit.')+`<div class="grid h38-wide-split">
    <section class="card span4"><h2>Add customer</h2><form id="customerForm"><input name="customerId" type="hidden"><label>Name</label><input name="customerName" required placeholder="Customer or company"><label>Email</label><input name="email" type="email"><label>Phone</label><input name="phone" type="tel">
<details class="snow-fields"><summary>Snow service options</summary>
<label><input type="checkbox" name="snowService" value="yes"> Snow removal customer</label>
<label>Equipment</label><select name="snowEquipment"><option value="">Select equipment…</option>${equipmentOptions()}</select>
<label>Time constraint</label><input name="snowTimeConstraint" placeholder="e.g. Done by 7am, before school bus">
<label>Snow notes</label><input name="snowNotes" placeholder="Gate code, where to pile snow…">
</details>
<div class="actions"><button type="submit">Add customer</button></div></form></section>
    <section class="card span8"><h2>Customers</h2><div class="list">${customers.length?customers.map(row=>`<button type="button" class="row" data-customer-card="${esc(rowId(row,'Customer ID','customerId'))}"><div class="row-top"><strong>${esc(v(row,'Customer Name','name'))}</strong>${pill(v(row,'Status')||'Active')}${v(row,'Snow Service')==='Yes'?'<span class="pill snow">Snow</span>':''}</div><small>${esc(v(row,'Email')||'No email')} · ${esc(v(row,'Phone')||'No phone')}</small></button>`).join(''):empty('No customers yet.')}</div></section>
    <section class="card span4"><h2>Start work</h2><p class="muted">Create a request, job or quote from the selected customer without rebuilding the customer record.</p><div class="quick-grid"><button data-open-page="work">New request</button><button data-open-page="quotes">Start quote</button><button data-open-page="messages">Message</button><button data-open-page="memberships">Enroll in plan</button></div></section>
    <section class="card span4"><h2>Snow equipment</h2><p class="muted small">Owner-managed list. Assign equipment to snow customers above.</p><form id="equipmentForm"><label>Equipment name</label><input name="equipmentName" required placeholder="Plow truck 1"><label>Type</label><select name="equipmentType"><option>Plow truck</option><option>Snow blower</option><option>Walk-behind blower</option><option>Skid steer</option><option>Shovel / hand crew</option><option>Sidewalk crew</option><option>Other</option></select><div class="actions"><button>Add equipment</button></div></form><div class="list">${records('equipment').filter(e=>v(e,'Owner Type')!=='Customer').map(e=>'<div class="row"><div class="row-top"><strong>'+esc(v(e,'Equipment Name'))+'</strong>'+pill(v(e,'Status')||'Active')+'</div><small>'+esc(v(e,'Equipment Type')||'')+'</small></div>').join('')||empty('No equipment yet.')}</div></section>
    <section class="card span4"><h2>Properties</h2><div class="list">${properties.length?properties.map(row=>`<div class="row"><strong>${esc(v(row,'Property Name'))}</strong><small>${esc(v(row,'Address'))} · ${esc(customerName(v(row,'Customer ID')))}</small></div>`).join(''):empty('No properties yet.')}</div></section><section class="card span4"><h2>Add property</h2><form id="propertyForm"><label>Customer</label><select name="customerId">${optionRows(customers,['Customer ID','customerId'],row=>v(row,'Customer Name','name'),'Select customer')}</select><label>Property name</label><input name="propertyName" placeholder="Home, cabin, shop…"><label>Address</label><input name="address"><div class="actions"><button>Save property</button></div></form></section>
    
  </div>`;
  document.querySelectorAll('[data-open-page]').forEach(button=>button.onclick=()=>openPage(button.dataset.openPage));
  document.querySelectorAll('[data-customer-card]').forEach(button=>button.onclick=()=>{if(window.H38_CUSTOMER_360){window.H38_CUSTOMER_360.selectedCustomerId=button.dataset.customerCard;renderCustomers();}});
  bindForm('customerForm',async(data,form)=>{
    const existingId=String(data.customerId||'').trim(),existing=existingId?customers.find(row=>rowId(row,'Customer ID','customerId')===existingId):null;
    /* Edit path: unchanged semantics, then the standard post-save panel. */
    if(existing){
      const record={...(existing||{}),'Customer ID':existingId,'Business ID':state.businessId,'Customer Name':requireValue(data.customerName,'Customer name is required.'),'Email':data.email,'Phone':data.phone,'Snow Service':data.snowService==='yes'?'Yes':'','Snow Equipment':data.snowEquipment||'','Snow Time Constraint':data.snowTimeConstraint||'','Snow Notes':data.snowNotes||'','Status':v(existing,'Status')||'Active','Created Time':v(existing,'Created Time','createdAt')||now(),'Updated Time':now(),'Record Version':Math.max(1,num(v(existing,'Record Version','recordVersion'))+1)};
      await queueOperation('SAVE_ENTITY','Customer',existingId,{entity:'customers',record},{collection:'customers',record,idKeys:['Customer ID']});
      form.reset();if(window.H38_CUSTOMER_360)window.H38_CUSTOMER_360.selectedCustomerId=existingId;
      renderCustomers();afterCustomerSaved(existingId,record['Customer Name'],customers.length,false,true);
      return;
    }
    /* New customer: dedupe (M2) before saving. Non-blocking by design. */
    const customerName=requireValue(data.customerName,'Customer name is required.');
    const email=String(data.email||'').trim(),phone=String(data.phone||'').trim();
    const beforeCount=customers.length;
    const saveNewCustomer=async()=>{
      const id=newId('CUSTOMER');
      const record={'Customer ID':id,'Business ID':state.businessId,'Customer Name':customerName,'Email':email,'Phone':phone,'Snow Service':data.snowService==='yes'?'Yes':'','Snow Equipment':data.snowEquipment||'','Snow Time Constraint':data.snowTimeConstraint||'','Snow Notes':data.snowNotes||'','Status':'Active','Created Time':now(),'Updated Time':now(),'Record Version':1};
      await queueOperation('SAVE_CUSTOMER','Customer',id,{customerId:id,customerName,email,phone},{collection:'customers',record,idKeys:['Customer ID']});
      form.reset();if(window.H38_CUSTOMER_360)window.H38_CUSTOMER_360.selectedCustomerId=id;
      renderCustomers();afterCustomerSaved(id,customerName,beforeCount,false,false);
    };
    const match=findPossibleDuplicate(customerName,email,phone);
    const flow=window.H38Flow;
    if(match&&flow&&typeof flow.ask==='function'){
      const existingName=String((match.payload||{})['Customer Name']||'this customer');
      const existingKey=String(match.recordKey||match.record_key||'');
      flow.ask({
        id:'h38CustomerDedupe',
        signature:['dedupe',customerName.toLowerCase(),email.toLowerCase(),phone.replace(/\D/g,'')].join('|'),
        title:`Is this the same as "${existingName}"?`,
        detail:`Matched by ${(match.why||[]).join(', ')||'similar details'}. Nothing is saved yet — pick one to continue.`,
        actions:[
          {label:'Use existing',primary:true,handler:()=>{
            document.getElementById('h38CustomerDedupe')?.remove();
            form.reset();flow.selectCustomer(existingKey);
            afterCustomerSaved(existingKey,existingName,beforeCount,true,false);
          }},
          {label:'Create anyway',handler:async()=>{
            document.getElementById('h38CustomerDedupe')?.remove();
            await saveNewCustomer();
          }}
        ]
      });
      return;
    }
    /* Dedupe unavailable or no match: save proceeds. Never block. */
    await saveNewCustomer();
  });
  bindForm('equipmentForm',async(data,form)=>{const id=newId('EQUIP'),record={'Equipment ID':id,'Business ID':state.businessId,'Equipment Name':requireValue(data.equipmentName,'Equipment name is required.'),'Equipment Type':data.equipmentType,'Status':'Active','Created Time':now(),'Updated Time':now(),'Record Version':1};await queueOperation('SAVE_EQUIPMENT','Equipment',id,{collection:'equipment',record,idKeys:['Equipment ID']});form.reset();toast('Equipment added.');renderCustomers();});
  bindForm('propertyForm',async(data,form)=>{const customerId=requireValue(data.customerId,'Select the customer for this property.');const id=newId('PROPERTY'),record={'Property ID':id,'Business ID':state.businessId,'Customer ID':customerId,'Property Name':requireValue(data.propertyName||data.address,'Property name or address is required.'),'Address':data.address,'Status':'Active','Created Time':now(),'Updated Time':now(),'Record Version':1};await queueOperation('SAVE_PROPERTY','Property',id,{propertyId:id,customerId,...data},{collection:'properties',record,idKeys:['Property ID']});form.reset();toast('Property saved.');renderCustomers();});
}

(function loadCustomerWorkspaceDocuments(){
  if(window.H38_CUSTOMER_WORKSPACE_DOCUMENTS||window.H38_CUSTOMER_WORKSPACE_DOCUMENTS_LOADING)return;
  window.H38_CUSTOMER_WORKSPACE_DOCUMENTS_LOADING=true;
  const script=document.createElement('script');script.src='./customer-workspace-documents.js?build=20261101-wave3-1';script.dataset.h38CustomerWorkspace='1';script.onload=()=>{window.H38_CUSTOMER_WORKSPACE_DOCUMENTS_LOADING=false;};script.onerror=()=>{window.H38_CUSTOMER_WORKSPACE_DOCUMENTS_LOADING=false;console.warn('[H38 Customer Workspace] runtime could not load.');};document.head.appendChild(script);
})();
