const MODULES = {
  dashboard: 'Dashboard', requests: 'Requests', customers: 'Customers', properties: 'Properties',
  quotes: 'Quotes & Estimates', workorders: 'Work Orders', jobs: 'Jobs & Projects', schedule: 'Schedule',
  equipment: 'Equipment', inventory: 'Inventory', materials: 'Materials', purchases: 'Purchases',
  documents: 'Documents', invoices: 'Invoices', payments: 'Payments', expenses: 'Expenses', reports: 'Reports',
  approvals: 'Approvals', users: 'Users & Roles', audit: 'Audit Log', backups: 'Backups'
};

const GROUPS = [
  ['Work', ['dashboard','requests','customers','properties','quotes','workorders','jobs','schedule']],
  ['Operations', ['equipment','inventory','materials','purchases','documents']],
  ['Money', ['invoices','payments','expenses','reports']],
  ['Control', ['approvals','users','audit','backups']]
];

const SAMPLE = {
  requests: [['NLR-000126','Sarah Anderson','Snow & Ice','Grand Rapids','New'],['NLR-000125','Northland Dental','Commercial Services','Grand Rapids','Review']],
  customers: [['NLC-000041','Sarah Anderson','sarah@example.com','(218) 555-0114','Active'],['NLC-000040','Northland Dental','office@example.com','(218) 555-0177','Active']],
  properties: [['NLP-000052','Anderson Residence','1220 Lakeview Dr','Residential','Seasonal'],['NLP-000051','Northland Dental','1401 Hwy 169','Commercial','Active']],
  quotes: [['NLQ-000244','Sarah Anderson','Seasonal snow service','$2,480','Draft'],['NLQ-000243','Northland Dental','Commercial snow contract','$8,900','Owner review']],
  workorders: [['NLW-000188','Anderson Residence','Driveway plowing','Nov 15','Scheduled'],['NLW-000187','Northland Dental','Parking lot service','Today','In progress']],
  jobs: [['NLJ-000116','Northland Dental','Commercial snow','In progress','Crew 1'],['NLJ-000115','Pine Ridge HOA','Material delivery','Scheduled','Delivery']],
  schedule: [['Today 7:00 AM','Northland Dental','Snow & Ice','Crew 1','Confirmed'],['Tomorrow 8:00 AM','Jensen Property','Equipment Drop','Office','Scheduled']],
  equipment: [['EQ-01','Chevrolet Duramax','Plow Truck','Ready','38,410 mi'],['EQ-02','Boss V-XT','Snow Plow','Ready','Inspected'],['EQ-03','Bobcat S650','Skid Steer','Rented','1,820 hr']],
  inventory: [['INV-001','Road Salt','Ton','18.5','8','Ready'],['INV-002','Gravel Class 5','Yard','42','15','Ready']],
  materials: [['MAT-001','Road Salt','$168 / ton','18.5 ton','Available'],['MAT-002','Class 5 Gravel','$42 / yard','42 yd','Available']],
  purchases: [['PO-00072','Northland Supply','Road Salt','$3,250','Owner review'],['PO-00071','Fleet Farm','Shop supplies','$286','Approved']],
  documents: [['DOC-00281','Snow Contract - Northland.pdf','Contract','Northland Dental','Approved'],['DOC-00280','Jensen Rental Inspection.pdf','Inspection','Mark Jensen','Draft']],
  invoices: [['NLI-000193','Northland Dental','$4,450','$4,450','Open'],['NLI-000192','Pine Ridge HOA','$3,460','$0','Paid']],
  payments: [['NLPAY-00091','Pine Ridge HOA','$3,460','Card','Posted'],['NLPAY-00090','Sarah Anderson','$620','Check','Posted']],
  expenses: [['EXP-00121','Diesel Fuel','Fuel','$486','Approved'],['EXP-00120','Boss Plow Parts','Repairs','$312','Approved']],
  approvals: [['APR-00039','Quote','NLQ-000243','Commercial snow contract','$8,900','Waiting'],['APR-00038','Purchase','PO-00072','Road salt order','$3,250','Waiting']],
  users: [['USR-01','Josh Lewins','Owner','Active','Today'],['USR-02','Crystal Lewins','Administrator','Active','Today'],['USR-03','Field Crew','Staff','Active','Yesterday']],
  audit: [['Today 10:42','Josh','Approved quote','NLQ-000242','Success'],['Today 9:24','Crystal','Created customer','NLC-000041','Success']],
  backups: [['BKP-00031','Today 2:00 AM','Full beta data','Success','Drive / Backups'],['BKP-00030','Yesterday 2:00 AM','Full beta data','Success','Drive / Backups']]
};

function pill(value){
  const s=String(value).toLowerCase();
  const cls=/approved|paid|ready|active|success|posted|available|confirmed/.test(s)?'good':/review|waiting|pending|due/.test(s)?'warn':/blocked|failed/.test(s)?'bad':'blue';
  return `<span class="pill ${cls}">${value}</span>`;
}

function renderNav(){
  const nav=document.getElementById('appNav');
  if(!nav) return;
  nav.innerHTML=GROUPS.map(([label,items])=>`<div class="nav-group"><div class="nav-label">${label}</div>${items.map(k=>`<button class="nav-item" data-module="${k}">${MODULES[k]}</button>`).join('')}</div>`).join('');
  nav.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>showModule(btn.dataset.module)));
}

function showModule(key){
  document.querySelector('.app')?.classList.remove('side-open');
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.module===key));
  location.hash=`module=${key}`;
  const view=document.getElementById('view');
  if(!view) return;
  if(key==='dashboard') return renderDashboard(view);
  if(key==='reports') return renderReports(view);
  renderTable(view,key);
}

function renderDashboard(view){
  view.innerHTML=`<div class="page-head"><div><div class="eyebrow">Full Business Office</div><h1>What needs attention now?</h1><div class="muted">Customers, work, money, equipment and approvals in one place.</div></div><button class="btn" onclick="showModule('approvals')">Review approvals</button></div>
  <div class="metrics"><button class="metric" onclick="showModule('requests')"><span>New requests</span><strong>4</strong><small>Needs review</small></button><button class="metric" onclick="showModule('jobs')"><span>Active jobs</span><strong>4</strong><small>In progress</small></button><button class="metric" onclick="showModule('quotes')"><span>Open quotes</span><strong>$12,355</strong><small>Draft and sent</small></button><button class="metric" onclick="showModule('invoices')"><span>Outstanding</span><strong>$5,425</strong><small>Invoice balance</small></button><button class="metric" onclick="showModule('equipment')"><span>Equipment</span><strong>3 / 4</strong><small>Ready assets</small></button><button class="metric" onclick="showModule('approvals')"><span>Approvals</span><strong>3</strong><small>Owner decisions</small></button></div>
  <div class="dashboard"><section class="card"><h2>Full office is on</h2><p>Use the left navigation to open every app and workspace.</p><div class="toolbar"><button class="btn" onclick="showModule('customers')">Customers</button><button class="btn" onclick="showModule('quotes')">Quotes</button><button class="btn" onclick="showModule('jobs')">Jobs</button><button class="btn" onclick="showModule('invoices')">Invoices</button></div></section><section class="card"><h2>Approval controls</h2><p>${pill('External actions locked')}</p><p class="muted">Customer sends, charges, payments and scheduling remain owner-approved during beta.</p></section></div>`;
}

function renderTable(view,key){
  const rows=SAMPLE[key]||[];
  const width=rows[0]?.length||5;
  const headers=Array.from({length:width},(_,i)=>['Record','Name / Customer','Type / Detail','Value / Date','Status'][i]||`Field ${i+1}`);
  view.innerHTML=`<div class="page-head"><div><div class="eyebrow">Northern Lakes Business Office</div><h1>${MODULES[key]||key}</h1><div class="muted">Full office preview. External actions remain approval gated.</div></div><button class="btn">+ New record</button></div><div class="toolbar"><button class="btn secondary">All records</button><button class="btn secondary">Needs attention</button><button class="btn secondary">Export</button></div><div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}<th>Action</th></tr></thead><tbody>${rows.map(r=>`<tr>${r.map((v,i)=>`<td>${i===r.length-1?pill(v):v}</td>`).join('')}<td><button class="btn secondary">Open</button></td></tr>`).join('')}</tbody></table></div>`;
}

function renderReports(view){
  view.innerHTML=`<div class="page-head"><div><div class="eyebrow">Performance and financial reporting</div><h1>Reports</h1><div class="muted">Owner-ready revenue, job, customer and equipment snapshots.</div></div><button class="btn">Export report</button></div><div class="metrics"><div class="metric"><span>Revenue MTD</span><strong>$23,845</strong><small>Up 12%</small></div><div class="metric"><span>Gross margin</span><strong>48%</strong><small>Target 45%</small></div><div class="metric"><span>Open work</span><strong>7</strong><small>Across stages</small></div><div class="metric"><span>Quote win rate</span><strong>64%</strong><small>Last 30 days</small></div></div>`;
}

window.showModule=showModule;
document.addEventListener('DOMContentLoaded',()=>{
  renderNav();
  document.querySelector('.menu')?.addEventListener('click',()=>document.querySelector('.app')?.classList.toggle('side-open'));
  const key=(location.hash.match(/module=([^&]+)/)||[])[1]||document.body.dataset.defaultModule||'dashboard';
  showModule(MODULES[key]?key:'dashboard');
});