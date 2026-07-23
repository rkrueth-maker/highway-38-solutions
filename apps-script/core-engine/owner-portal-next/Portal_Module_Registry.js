/**
 * Highway 38 unified application module registry.
 *
 * This is the single source of truth for visible navigation placement, labels,
 * icons, route types, feature gates, command keywords, and secondary-module
 * classification. Add, remove, rename, or move a module here only.
 */
function h38PortalModuleRegistry_(quoteCapabilityOwner) {
  var quoteLabel = quoteCapabilityOwner === 'quoteBuilder' ? 'Quote Builder' : 'Quotes';
  return [
    {
      id:'command', label:'Today', icon:'⌂',
      items:[
        {key:'today',label:'Overview',icon:'⌂',type:'native',module:'today',gate:'commandCenter',keywords:'dashboard brief priorities'},
        {key:'bo:assignedTasks',label:'My Work',icon:'✓',type:'business',module:'assignedTasks',gate:'assignedTasks',keywords:'tasks assignments field work'},
        {key:'approvalsCenter',label:'Approvals',icon:'◆',type:'native',module:'approvalsCenter',gate:'approvals',keywords:'decisions review approve'},
        {key:'calendarCenter',label:'Calendar',icon:'□',type:'native',module:'calendarCenter',gate:'calendar',keywords:'schedule dates due'}
      ]
    },
    {
      id:'sales', label:'Customers', icon:'◎',
      items:[
        {key:'bo:requests',label:'New Requests',icon:'＋',type:'business',module:'requests',gate:'requests',keywords:'leads intake estimate'},
        {key:'bo:customers',label:'Customers',icon:'◎',type:'business',module:'customers',gate:'customers',keywords:'contacts clients accounts'},
        {key:'bo:messaging',label:'Communications',icon:'✉',type:'business',module:'messaging',gate:'messaging',keywords:'messages email sms'},
        {key:'bo:smsConsent',label:'SMS Consent',icon:'✓',type:'business',module:'smsConsent',gate:'smsConsent',keywords:'text opt in permission',secondary:true}
      ]
    },
    {
      id:'work', label:'Work', icon:'◇',
      items:[
        {key:'bo:quotes',label:quoteLabel,icon:'▱',type:'business',module:'quotes',gate:'quotes',capability:'quotes',keywords:'estimate proposal price'},
        {key:'bo:workOrders',label:'Work Orders',icon:'☑',type:'business',module:'workOrders',gate:'workOrders',keywords:'scope execution'},
        {key:'bo:jobs',label:'Jobs',icon:'◇',type:'business',module:'jobs',gate:'jobs',keywords:'projects active field'},
        {key:'bo:time',label:'Time Tracking',icon:'◷',type:'business',module:'time',gate:'time',keywords:'hours labor clock'},
        {key:'bo:equipment',label:'Equipment',icon:'⚒',type:'business',module:'equipment',gate:'equipment',keywords:'assets tools maintenance',secondary:true}
      ]
    },
    {
      id:'money', label:'Money', icon:'$',
      items:[
        {key:'bo:invoices',label:'Invoices',icon:'▤',type:'business',module:'invoices',gate:'invoices',keywords:'billing receivable balance'},
        {key:'bo:payments',label:'Payments',icon:'$',type:'business',module:'payments',gate:'payments',keywords:'paid deposits receipts'},
        {key:'bo:expenses',label:'Expenses',icon:'−',type:'business',module:'expenses',gate:'expenses',keywords:'cost spending receipt'},
        {key:'bo:vendors',label:'Vendors',icon:'◎',type:'business',module:'vendors',gate:'vendors',keywords:'suppliers contractors purchasing',secondary:true},
        {key:'bo:purchaseOrders',label:'Purchase Orders',icon:'▧',type:'business',module:'purchaseOrders',gate:'purchaseOrders',keywords:'buy order purchasing',secondary:true},
        {key:'bo:vendorBills',label:'Vendor Bills',icon:'▤',type:'business',module:'vendorBills',gate:'vendorBills',keywords:'payable supplier bill',secondary:true},
        {key:'bo:receipts',label:'Receipts',icon:'▥',type:'business',module:'receipts',gate:'receipts',keywords:'proof purchase scan',secondary:true},
        {key:'bo:accounting',label:'Accounting Prep',icon:'∑',type:'business',module:'accounting',gate:'accounting',keywords:'journal entries books',secondary:true},
        {key:'bo:payroll',label:'Payroll Prep',icon:'≋',type:'business',module:'payroll',gate:'payroll',keywords:'wages employees export',secondary:true},
        {key:'bo:tax',label:'Tax Prep',icon:'%',type:'business',module:'tax',gate:'tax',keywords:'filing documents liability',secondary:true}
      ]
    },
    {
      id:'documents', label:'Documents', icon:'▤',
      items:[
        {key:'bo:documents',label:'Files & OCR',icon:'▤',type:'business',module:'documents',gate:'documents',keywords:'upload scan photos pdf'},
        {key:'bo:reports',label:'Reports',icon:'▥',type:'business',module:'reports',gate:'reports',keywords:'financial analysis summary'},
        {key:'bo:messageTemplates',label:'Templates',icon:'▧',type:'business',module:'messageTemplates',gate:'messageTemplates',keywords:'email sms reusable',secondary:true}
      ]
    },
    {
      id:'growth', label:'Growth', icon:'↗',
      items:[
        {key:'growth',label:'Growth Center',icon:'↗',type:'native',module:'growth',gate:'growth',keywords:'sales marketing opportunities'},
        {key:'websiteCenter',label:'Website',icon:'◇',type:'native',module:'websiteCenter',gate:'website',keywords:'site pages publishing'},
        {key:'social',label:'Social',icon:'◎',type:'native',module:'social',gate:'social',keywords:'posts channels content'},
        {key:'advertising',label:'Advertising',icon:'◉',type:'native',module:'advertising',gate:'advertising',keywords:'ads campaigns spend'}
      ]
    },
    {
      id:'office', label:'Office', icon:'⚙',
      items:[
        {key:'moduleManager',label:'Apps & Modules',icon:'▦',type:'native',module:'moduleManager',gate:'setup',keywords:'business apps enabled disabled modules features'},
        {key:'setupWizard',label:'Business Setup',icon:'⚙',type:'native',module:'setupWizard',gate:'setup',keywords:'configuration install pack'},
        {key:'userAccess',label:'Users & Roles',icon:'◎',type:'native',module:'userAccess',gate:'users',keywords:'access permissions invite'},
        {key:'bo:employees',label:'Employees',icon:'◎',type:'business',module:'employees',gate:'employees',keywords:'staff payroll',secondary:true},
        {key:'bo:contractors',label:'Contractors & W-9',icon:'◎',type:'business',module:'contractors',gate:'contractors',keywords:'vendor tax forms',secondary:true},
        {key:'backupCenter',label:'Backups',icon:'↺',type:'native',module:'backupCenter',gate:'backups',keywords:'restore recovery copies',secondary:true},
        {key:'proof',label:'Proof Log',icon:'✓',type:'native',module:'proof',gate:'proof',keywords:'audit evidence history',secondary:true},
        {key:'errors',label:'Error Log',icon:'!',type:'native',module:'errors',gate:'errors',keywords:'failures diagnostics',secondary:true},
        {key:'systemHealth',label:'System Health',icon:'◉',type:'native',module:'systemHealth',gate:'commandCenter',keywords:'status integrations checks',secondary:true},
        {key:'settings',label:'Settings',icon:'⚙',type:'native',module:'settings',gate:'settings',keywords:'preferences configuration',secondary:true},
        {key:'help',label:'Help & SOPs',icon:'?',type:'native',module:'help',gate:'commandCenter',keywords:'instructions support',secondary:true},
        {key:'bo:setup',label:'Product Controls',icon:'⚙',type:'business',module:'setup',gate:'setup',keywords:'catalog products configuration',secondary:true}
      ]
    }
  ];
}
