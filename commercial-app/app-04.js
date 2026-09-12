function renderCustomers(){
  const customers=records('customers'),properties=records('properties');
  $('mainContent').innerHTML=pageHead('Customers','Customers, contacts and properties shared by every installed product shell.')+`<div class="grid">
    <section class="card span4"><h2>Add or update customer</h2><form id="customerForm"><input name="customerId" type="hidden"><label>Name</label><input name="customerName" required placeholder="Customer or company"><label>Email</label><input name="email" type="email"><label>Phone</label><input name="phone" type="tel"><div class="actions"><button type="submit">Add customer</button></div></form></section>
    <section class="card span4"><h2>Add property</h2><form id="propertyForm"><label>Customer</label><select name="customerId">${optionRows(customers,['Customer ID','customerId'],row=>v(row,'Customer Name','name'),'Select customer')}</select><label>Property name</label><input name="propertyName" placeholder="Home, cabin, shop…"><label>Address</label><input name="address"><div class="actions"><button>Save property</button></div></form></section>
    <section class="card span4"><h2>Start work</h2><p class="muted">Create a request, job or quote from the selected customer without rebuilding the customer record.</p><div class="quick-grid"><button data-open-page="work">New request</button><button data-open-page="quotes">Start quote</button><button data-open-page="messages">Message</button></div></section>
    <section class="card span8"><h2>Customers</h2><div class="list">${customers.length?customers.map(row=>`<button type="button" class="row" data-customer-card="${esc(rowId(row,'Customer ID','customerId'))}"><div class="row-top"><strong>${esc(v(row,'Customer Name','name'))}</strong>${pill(v(row,'Status')||'Active')}</div><small>${esc(v(row,'Email')||'No email')} · ${esc(v(row,'Phone')||'No phone')}</small></button>`).join(''):empty('No customers yet.')}</div></section>
    <section class="card span4"><h2>Properties</h2><div class="list">${properties.length?properties.map(row=>`<div class="row"><strong>${esc(v(row,'Property Name'))}</strong><small>${esc(v(row,'Address'))} · ${esc(customerName(v(row,'Customer ID')))}</small></div>`).join(''):empty('No properties yet.')}</div></section>
  </div>`;
  document.querySelectorAll('[data-open-page]').forEach(button=>button.onclick=()=>openPage(button.dataset.openPage));
  document.querySelectorAll('[data-customer-card]').forEach(button=>button.onclick=()=>{if(window.H38_CUSTOMER_360){window.H38_CUSTOMER_360.selectedCustomerId=button.dataset.customerCard;renderCustomers();}});
  bindForm('customerForm',async(data,form)=>{
    const existingId=String(data.customerId||'').trim(),existing=existingId?customers.find(row=>rowId(row,'Customer ID','customerId')===existingId):null,id=existingId||newId('CUSTOMER');
    const record={...(existing||{}),'Customer ID':id,'Business ID':state.businessId,'Customer Name':requireValue(data.customerName,'Customer name is required.'),'Email':data.email,'Phone':data.phone,'Status':v(existing,'Status')||'Active','Created Time':v(existing,'Created Time','createdAt')||now(),'Updated Time':now(),'Record Version':Math.max(1,num(v(existing,'Record Version','recordVersion'))+1)};
    const payload=existing?{entity:'customers',record}:{customerId:id,customerName:record['Customer Name'],email:data.email,phone:data.phone};
    await queueOperation(existing?'SAVE_ENTITY':'SAVE_CUSTOMER','Customer',id,payload,{collection:'customers',record,idKeys:['Customer ID']});
    form.reset();if(window.H38_CUSTOMER_360)window.H38_CUSTOMER_360.selectedCustomerId=id;toast(existing?'Customer changes saved on this device.':'Customer saved on this device.');renderCustomers();
  });
  bindForm('propertyForm',async(data,form)=>{const id=newId('PROPERTY'),record={'Property ID':id,'Business ID':state.businessId,'Customer ID':data.customerId,'Property Name':requireValue(data.propertyName||data.address,'Property name or address is required.'),'Address':data.address,'Status':'Active','Created Time':now(),'Updated Time':now(),'Record Version':1};await queueOperation('SAVE_PROPERTY','Property',id,{propertyId:id,...data},{collection:'properties',record,idKeys:['Property ID']});form.reset();toast('Property queued.');renderCustomers();});
}

(function loadCustomerWorkspaceDocuments(){
  if(window.H38_CUSTOMER_WORKSPACE_DOCUMENTS||window.H38_CUSTOMER_WORKSPACE_DOCUMENTS_LOADING)return;
  window.H38_CUSTOMER_WORKSPACE_DOCUMENTS_LOADING=true;
  const script=document.createElement('script');script.src='./customer-workspace-documents.js?build=20260912-customer-service-operations-1';script.dataset.h38CustomerWorkspace='1';script.onload=()=>{window.H38_CUSTOMER_WORKSPACE_DOCUMENTS_LOADING=false;};script.onerror=()=>{window.H38_CUSTOMER_WORKSPACE_DOCUMENTS_LOADING=false;console.warn('[H38 Customer Workspace] runtime could not load.');};document.head.appendChild(script);
})();
