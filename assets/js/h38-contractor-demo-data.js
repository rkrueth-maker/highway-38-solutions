window.H38ContractorDemo = Object.freeze({
  version: "2026.07.22.2",
  updated: "July 22, 2026",
  region: "Deer River / Grand Rapids, Minnesota",
  notice: "Hypothetical contractor demonstration — not a real customer, accepted contract, or completed project. Regional benchmark pricing requires field and supplier verification.",
  imageUrl(id) {
    const images = {
      "1QqR5oj3Nw8sjykCnu7Vp5hh6VDIJ6GS9": "assets/approved-website-images/01-landscape-before.jpg",
      "1BIXaFXIVK9FUEyWRSzQgM7CiH_tgk405": "assets/approved-website-images/03-yard-improvement-after.jpg",
      "1MkSHG4k734T7dmhOmy5JsKFUJyoXW8Dz": "assets/approved-website-images/02-landscape-construction.jpg",
      "11fGOY_PJxwvgQm_uMwISvF98XrSXfJK0": "assets/approved-website-images/11-exterior-shop-building.jpg",
      "12YDZ4GVNUnF0gRWuBqVxTAgzG8tiY6z3": "assets/approved-website-images/01-landscape-before.jpg",
      "18d2FE5VGjM_q62KKTq12w6rsQ0otdUfk": "assets/approved-website-images/03-yard-improvement-after.jpg",
      "1DZ55aulS2fzUrJsy1BsibrzzwaiZ_lv5": "assets/approved-website-images/01-landscape-before.jpg",
      "1JU1RbFotwLziQJ5SJsEWgwE2lterUSh9": "assets/approved-website-images/02-landscape-construction.jpg"
    };
    return images[id] || "assets/approved-website-images/10-project-planning-documents.jpg";
  },
  quotes: {
    flower: {
      number: "Q-DEMO-001", title: "Flower Garden Installation", base: 3250,
      scope: "Install approximately 240 sq ft of flower garden with layout, sod removal, soil amendment, edging, mid-range cold-hardy perennials and shrubs, mulch, cleanup, and edge restoration.",
      measurements: ["Garden area: approximately 240 sq ft","Average bed depth: approximately 3 ft","Topsoil and amendment allowance: 4.5 cu yd","Mulch allowance: approximately 240 sq ft","Plant selection: 25–30 mid-range plants"],
      includes: ["Layout and mark bed edges","Remove sod and unwanted vegetation","Prepare and level the planting bed","Install topsoil and soil amendment","Install cold-hardy plants","Apply dark-brown mulch","Finish grading and cleanup"],
      assumptions: "Normal residential access; no major drainage correction; plant selections are subject to seasonal availability.",
      before: "1QqR5oj3Nw8sjykCnu7Vp5hh6VDIJ6GS9", after: "1BIXaFXIVK9FUEyWRSzQgM7CiH_tgk405",
      beforeCaption: "Same house and camera angle before the foundation-side flower garden is installed.",
      afterCaption: "The same house and camera angle with the proposed curved bed, stone edging, mulch, shrubs, and flowers.",
      items: [["Layout and bed marking","Site layout and bed shaping",1,"LS",200],["Sod removal and disposal","Remove sod and haul off site",240,"sq ft",2],["Soil amendment","Topsoil and organic amendment",4.5,"cu yd",80],["Edging","Steel or composite edging",60,"linear ft",6],["Plants","Mid-range cold-hardy perennials and shrubs",1,"allowance",1150],["Mulch","Premium shredded hardwood mulch",1,"allowance",320],["Cleanup and final grading","Edge restoration and jobsite cleanup",1,"LS",380]],
      upgrades: [["Basic drip irrigation zone","One drip irrigation zone for new plants",850],["Natural-stone edging","Install natural-stone edging, approximately 60 linear ft",1100],["Premium planting package","Higher-end perennials, shrubs, and accent plants",1450]],
      jobInstructions: [
        "Confirm the approved garden outline, utility locations, access route, and final plant selections with the owner.",
        "Protect the house, lawn, driveway, and existing landscape features before work begins.",
        "Lay out and mark the approximately 240 sq ft bed and verify finished elevations and drainage direction.",
        "Remove sod and unwanted vegetation, then prepare and level the planting bed.",
        "Place and blend the topsoil and amendment allowance; fine-grade the bed for planting.",
        "Install edging, plants, and mulch to the approved layout and spacing.",
        "Water in the installation, restore disturbed edges, remove debris, photograph the finished work, and complete owner walkthrough."
      ]
    },
    drive: {
      number: "Q-DEMO-002", title: "Class 5 Driveway — Laying Down and Leveling", base: 3250,
      scope: "Supply, place, crown, grade, and compact Class 5 aggregate on an approximately 12 ft × 80 ft driveway at an average compacted depth of 4 inches.",
      measurements: ["Length: 80 linear ft","Average width: 12 ft","Surface area: 960 sq ft","Compacted depth: 4 in","Class 5 quantity: approximately 11.9 cu yd before handling allowance"],
      includes: ["Clear and shape the driveway path","Establish crown and drainage","Supply and spread Class 5 aggregate","Compact and level the surface","Shape edges and complete final grading","Clean up excess material"],
      assumptions: "Serviceable subgrade and normal truck access; excludes undercutting, frost excavation, and unsuitable-soil removal.",
      before: "1MkSHG4k734T7dmhOmy5JsKFUJyoXW8Dz", after: "11fGOY_PJxwvgQm_uMwISvF98XrSXfJK0",
      beforeCaption: "Example dirt and uneven access before Class 5 placement and grading.", afterCaption: "Example completed Class 5 driveway after spreading, crowning, leveling, and compaction.",
      items: [["Mobilization and site setup","Equipment delivery and project setup",1,"LS",350],["Shape existing subgrade","Prepare approximately 960 sq ft",960,"sq ft",0.5],["Class 5 aggregate","Delivered material allowance",11.9,"cu yd",120],["Spread, crown, and grade","Machine spreading and drainage shaping",1,"LS",550],["Compaction and finish","Compact and final-level the surface",1,"LS",342],["Edge cleanup","Shape edges and remove excess material",1,"LS",100]],
      upgrades: [["Geotextile separation fabric","Install separation fabric below aggregate",1050],["Increase depth from 4 to 6 inches","Additional aggregate, grading, and compaction",975],["Residential culvert allowance","Typical culvert material and installation allowance",1850]],
      jobInstructions: [
        "Confirm the 12 ft × 80 ft limits, drainage outlet, utility markings, truck route, and approved aggregate source.",
        "Document existing elevations and soft areas; stop for owner review if unsuitable subgrade or frost conditions are found.",
        "Mobilize equipment, protect adjacent lawn and structures, and establish a safe delivery and work zone.",
        "Clear and shape the existing path, establish the crown, and prepare the subgrade.",
        "Place the approved Class 5 aggregate in controlled lifts to the selected compacted depth.",
        "Grade, crown, water as needed, compact, and verify drainage and finished width.",
        "Shape edges, remove excess material, take completion photos, and record final quantities and site exceptions."
      ]
    },
    pond: {
      number: "Q-DEMO-003", title: "Premium Small Backyard Pond", base: 12500,
      scope: "Construct an approximately 10 ft × 14 ft pond, up to 30 inches deep, with excavation, underlayment, EPDM liner, pump, filtration, natural-stone edge, limited aquatic planting, filling, testing, and startup.",
      measurements: ["Pond size: approximately 10 ft × 14 ft","Maximum depth: up to 30 in","Surface area: approximately 140 sq ft","Excavation: variable by shelves and access","Pump and filtration sized to final volume"],
      includes: ["Excavate and shape the pond basin","Install underlayment and EPDM liner","Install pump, filtration, and plumbing","Set the natural-stone perimeter","Add decorative rock and limited aquatic plants","Fill, test, balance, and provide startup walkthrough"],
      assumptions: "Normal access, a nearby electrical source, excavated material remaining onsite, and no bedrock or high groundwater.",
      before: "12YDZ4GVNUnF0gRWuBqVxTAgzG8tiY6z3", after: "18d2FE5VGjM_q62KKTq12w6rsQ0otdUfk",
      beforeCaption: "Example open backyard area before pond excavation and installation.", afterCaption: "Example completed backyard pond with natural stone, planting, circulation, and waterfall.",
      items: [["Layout and site protection","Mark pond area and protect access route",1,"LS",500],["Excavation and shaping","Excavate shelves, basin, and edge profile",1,"LS",2800],["Underlayment and EPDM liner","Premium liner system allowance",1,"system",2100],["Pump, filtration, and plumbing","Circulation and filtration package",1,"system",2450],["Natural stone and edge finishing","Stone perimeter and decorative rock",1,"LS",2150],["Aquatic plants and startup","Limited planting, fill, test, and startup",1,"LS",1000],["Cleanup and final grading","Restore disturbed area and remove debris",1,"LS",1500]],
      upgrades: [["Compact stone waterfall","Add a compact natural-stone waterfall",1800],["Premium biological filtration","Upgrade filtration capacity and media",1250],["Low-voltage pond lighting","Add low-voltage underwater and edge lighting",700]],
      jobInstructions: [
        "Confirm final pond location, 10 ft × 14 ft footprint, maximum depth, utility clearances, electrical source, access, and spoil location.",
        "Protect the access path and adjacent lawn, mark the basin and shelves, and establish safe excavation controls.",
        "Excavate and shape the basin; stop for owner review if groundwater, bedrock, utilities, or unstable soils are encountered.",
        "Install and inspect underlayment and EPDM liner before covering any concealed work.",
        "Install pump, filtration, plumbing, and any selected waterfall or lighting components according to manufacturer requirements.",
        "Set natural stone, edge finish, decorative rock, and approved aquatic plants while preventing liner damage.",
        "Fill, leak-test, balance circulation, verify electrical protection, restore disturbed areas, document startup readings, and complete owner walkthrough."
      ]
    },
    clear: {
      number: "Q-DEMO-004", title: "Residential Lot Clearing and House-Site Preparation", base: 16500,
      scope: "Clear and rough-prepare approximately one acre for a residence with light-to-moderate tree and brush cover, selected tree removal, grubbing in house and driveway zones, onsite material consolidation, rough grading, and cleanup.",
      measurements: ["Lot area: approximately 1 acre","Tree cover: light to moderate","House and driveway zones: targeted grubbing","Rough grading area: building and access zones","Debris handling: consolidated onsite where lawful"],
      includes: ["Clear selected trees and brush","Remove vegetation in building zones","Grub stumps in house and driveway zones","Rough-grade the building site","Establish equipment access","Consolidate debris and clean up"],
      assumptions: "No wetlands, demolition, hazardous materials, utility conflicts, rock excavation, or unsuitable-soil export in the base price.",
      before: "1DZ55aulS2fzUrJsy1BsibrzzwaiZ_lv5", after: "1JU1RbFotwLziQJ5SJsEWgwE2lterUSh9",
      beforeCaption: "Example wooded residential lot before clearing and site preparation.", afterCaption: "Example cleared and rough-graded residential building area after site preparation.",
      items: [["Mobilization and equipment delivery","Move equipment to the site and establish access",1,"LS",1500],["Tree and brush clearing","Light-to-moderate clearing over approximately one acre",1,"acre",6000],["Targeted stump grubbing","House and driveway zones",1,"LS",3500],["Rough grading","House-site and access-zone rough grading",1,"LS",4000],["Debris consolidation and cleanup","Consolidate onsite material where lawful",1,"LS",1500]],
      upgrades: [["Expanded full-acre stump grubbing","Grub remaining stumps throughout the acre",4500],["House-pad excavation and fill allowance","Structural pad excavation and imported fill allowance",9500],["Offsite hauling and disposal allowance","Load, haul, and dispose of cleared material",6000]],
      jobInstructions: [
        "Confirm surveyed limits, approved clearing boundaries, protected trees, wetland and utility markings, access route, debris plan, and permit requirements.",
        "Conduct a site safety briefing, establish exclusion zones, and verify equipment access and emergency procedures.",
        "Clear selected trees and brush in the approved sequence while protecting retained trees, adjacent property, and marked utilities.",
        "Grub stumps only in the approved house and driveway zones unless expanded grubbing is selected.",
        "Consolidate, chip, burn, or haul material only by the approved lawful method; record loads or disposal evidence when applicable.",
        "Rough-grade the house and access zones, control erosion, maintain drainage, and stop for owner review if rock or unsuitable soil is encountered.",
        "Complete cleanup, photograph limits and final grades, record exceptions and quantities, and obtain owner acceptance before demobilization."
      ]
    }
  },
  advertising: {
    headline: "Clear plans. Fair pricing. Professional results.",
    summary: "Highway 38 Solutions helps homeowners, contractors, and property owners turn rough ideas, photos, and field information into organized plans, detailed quotes, project guides, and connected business records.",
    capabilities: ["Photo and voice-based project capture","Measurements, takeoffs, and quantity calculations","Before-and-after concept visuals","Detailed base scopes and optional upgrades","Regional material and cost estimating","Branded printable and PDF quote packages","Quote-to-job and Job Guide handoff","Business Office records, approvals, proof, and reporting"],
    pricingRanges: [["Flower garden","$2,500–$4,500"],["Class 5 driveway","$2,750–$4,500"],["Premium small pond","$10,000–$16,000"],["One-acre lot clearing","$12,000–$20,000"]],
    pricingNote: "Sample regional planning ranges only. Final dimensions, access, materials, site conditions, supplier pricing, permits, hauling, disposal, and approved scope control the final quote.",
    platformPricing: "Quote Builder, Job Guide, Business Office, and integrated-system pricing is scoped after a needs review. No automatic purchase or installation.",
    cta: "Request a scoped plan and pricing review"
  }
});

(() => {
  function installJobFlow() {
    const shell = document.querySelector('[data-quote-shell]');
    if (!shell || document.querySelector('[data-job-flow]')) return;
    const source = window.H38ContractorDemo;
    const key = new URLSearchParams(location.search).get('example') || 'flower';
    const quote = source.quotes[key] || source.quotes.flower;
    const content = shell.querySelector('.quote-content');
    const anchor = content && content.querySelector('.package-options');
    if (!content || !anchor || !Array.isArray(quote.jobInstructions)) return;

    const style = document.createElement('style');
    style.textContent = `.job-flow{margin-top:26px;border:2px solid #123e2a;border-radius:16px;overflow:hidden;background:#fff}.job-flow-head{padding:18px 20px;background:#071f30;color:#fff}.job-flow-head h2{margin:0 0 6px;font-size:1.3rem}.job-flow-head p{margin:0;line-height:1.45;color:#dce8e1}.job-flow-grid{display:grid;grid-template-columns:1fr 1fr;gap:0}.job-flow-panel{padding:20px}.job-flow-panel+ .job-flow-panel{border-left:1px solid #d8e2dc;background:#f5f9f6}.job-flow-panel h3{margin:0 0 14px;color:#0c3b29}.instruction-list,.task-list{display:grid;gap:10px;list-style:none;margin:0;padding:0;counter-reset:jobstep}.instruction-list li{counter-increment:jobstep;display:grid;grid-template-columns:32px 1fr;gap:10px;line-height:1.45}.instruction-list li:before{content:counter(jobstep);display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#ff6b00;color:#fff;font-weight:900}.task-item{display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid #ccd8d1;border-radius:10px;background:#fff;line-height:1.4}.task-item input{margin-top:3px}.task-item.done span{text-decoration:line-through;color:#647168}.task-status{margin-top:14px;padding:10px 12px;border-radius:9px;background:#e6f3ea;color:#0f5734;font-weight:800}.job-flow-note{padding:12px 20px;background:#fff4cf;border-top:1px solid #dfc56a;font-size:.86rem;line-height:1.45}.flow-arrow{color:#ff6b00;font-weight:900}@media(max-width:760px){.job-flow-grid{grid-template-columns:1fr}.job-flow-panel+ .job-flow-panel{border-left:0;border-top:1px solid #d8e2dc}}@media print{.job-flow{break-before:page;page-break-before:always}.task-item input{appearance:none;width:12px;height:12px;border:1px solid #444}.job-flow-note{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
    document.head.appendChild(style);

    const section = document.createElement('section');
    section.className = 'job-flow';
    section.dataset.jobFlow = '';
    section.innerHTML = `<div class="job-flow-head"><h2>Quote approved <span class="flow-arrow">→</span> Job instructions <span class="flow-arrow">→</span> Tasks</h2><p>The approved scope is translated into an ordered Job Guide and then into trackable field tasks.</p></div><div class="job-flow-grid"><div class="job-flow-panel"><h3>Generated job instructions</h3><ol class="instruction-list">${quote.jobInstructions.map(item => `<li><span>${item}</span></li>`).join('')}</ol></div><div class="job-flow-panel"><h3>Tasks created from instructions</h3><div class="task-list" data-task-list></div><div class="task-status" data-task-status></div></div></div><div class="job-flow-note"><strong>Demo control:</strong> these checkboxes demonstrate the handoff. They do not assign employees, schedule work, authorize purchases, or create external actions.</div>`;
    anchor.parentNode.insertBefore(section, anchor);

    const taskList = section.querySelector('[data-task-list]');
    const status = section.querySelector('[data-task-status]');
    const render = () => {
      const selected = [...document.querySelectorAll('[data-upgrade]:checked')].map(check => quote.upgrades[Number(check.dataset.index)]);
      const tasks = quote.jobInstructions.map((instruction, index) => ({ id: `${quote.number}-T${String(index + 1).padStart(2,'0')}`, text: instruction }));
      selected.forEach((upgrade, index) => tasks.push({ id: `${quote.number}-U${String(index + 1).padStart(2,'0')}`, text: `Complete selected upgrade: ${upgrade[0]} — ${upgrade[1]}.` }));
      const completed = new Set([...taskList.querySelectorAll('input:checked')].map(input => input.value));
      taskList.innerHTML = tasks.map(task => `<label class="task-item${completed.has(task.id) ? ' done' : ''}"><input type="checkbox" value="${task.id}"${completed.has(task.id) ? ' checked' : ''}><span><b>${task.id}</b><br>${task.text}</span></label>`).join('');
      const update = () => {
        const boxes = [...taskList.querySelectorAll('input')];
        boxes.forEach(box => box.closest('.task-item').classList.toggle('done', box.checked));
        status.textContent = `${boxes.filter(box => box.checked).length} of ${boxes.length} tasks complete`;
      };
      taskList.querySelectorAll('input').forEach(box => box.addEventListener('change', update));
      update();
    };
    document.querySelectorAll('[data-upgrade]').forEach(box => box.addEventListener('change', render));
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(installJobFlow, 0));
  else setTimeout(installJobFlow, 0);
})();
