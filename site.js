const FORM = "https://docs.google.com/forms/d/e/1FAIpQLScTWaK40mNNaf1ek3w4gC3VYwvpNT9fnXlHodKeOZl7lPfCyQ/viewform";

const products = [
  {
    cat: "Starter",
    tag: "Problem Snapshot",
    title: "Problem Snapshot",
    id: "project-cleanup-snapshot",
    price: "$79 intro / $99 normal",
    summary: "Small problem review from messy photos, notes, screenshots, or rough ideas.",
    best: "Customers who need the first clear next step.",
    problem: "The details are scattered and the customer does not know what to do first.",
    sends: "Photos, notes, screenshots, measurements, links, or a rough description.",
    builds: ["Plain-English summary", "Missing-info checklist", "Watch-out notes", "Next actions"],
    steps: [["Review", "Read and group the messy details."], ["Sort", "Separate known facts from missing information."], ["Plan", "Pick the first useful move."], ["Deliver", "Send the written snapshot."]],
    out: [["Area", "Problem", "Next"], ["Project", "Unclear first step", "Send snapshot"], ["Info", "Missing measurements", "Request details"]],
    done: "The customer knows what to do next.",
    scale: "Project Packet, Shop Flow Review, or custom work."
  },
  {
    cat: "Project",
    tag: "Project Packet",
    title: "Project Packet",
    id: "project-plan-material-list",
    price: "$150-$300",
    summary: "Full project plan with layout ideas, material list, build order, notes, and next steps.",
    best: "Garage, shop, yard, repair, and small build projects.",
    problem: "The customer knows the goal but needs the work organized into a build path.",
    sends: "Photos, dimensions, rough sketch, product links, goal, budget range, and constraints.",
    builds: ["Phase-by-phase build order", "Grouped material list", "Missing measurements", "Owner checklist"],
    steps: [["Scope", "Define the finish line."], ["Break down", "Split work into phases."], ["List", "Group materials and decisions."], ["Deliver", "Send project packet."]],
    out: [["Phase", "Task", "Decision"], ["1", "Measure", "Final size"], ["2", "Buy", "Budget"], ["3", "Build", "Location"]],
    done: "The customer can buy materials and start in the right order.",
    scale: "Shop Flow Review or custom work."
  },
  {
    cat: "Shop",
    tag: "Shop Flow Review",
    title: "Shop Flow Review",
    id: "garage-shop-layout-review",
    price: "$75-$150+",
    summary: "Garage/shop/workspace improvement review for layout, tool flow, storage, and access.",
    best: "Garages, repair areas, small shops, and future welding-shop planning.",
    problem: "The space works, but flow, storage, tools, or access are costing time.",
    sends: "Photos, dimensions, tools, vehicles, storage needs, and goals.",
    builds: ["Zone concept", "Tool placement notes", "Storage priorities", "Safety/access notes"],
    steps: [["Survey", "Review the space."], ["Zone", "Separate work areas."], ["Improve", "Prioritize fixes."], ["Deliver", "Send layout notes."]],
    out: [["Zone", "Concern", "Next"], ["Work bay", "Clearance", "Measure"], ["Storage", "Access", "Pick wall"]],
    done: "The customer sees the layout problems and next improvements.",
    scale: "Project Packet or Shop Process Improvement Review."
  },
  {
    cat: "Business",
    tag: "Business Cleanup Packet",
    title: "Business Cleanup Packet",
    id: "google-form-tracker",
    price: "$150-$400+",
    summary: "Service menu, quote sheet, intake form, tracker, and follow-up system.",
    best: "Small businesses with customer/job information scattered across texts, notes, screenshots, and memory.",
    problem: "The business has no clean way to capture requests, quote, track, and follow up.",
    sends: "Service list, customer examples, quote notes, current messages, and workflow pain points.",
    builds: ["Service menu", "Request form", "Lead tracker", "Follow-up messages"],
    steps: [["Offer", "Clarify services."], ["Intake", "Build form questions."], ["Track", "Create statuses."], ["Reply", "Deliver templates."]],
    out: [["Piece", "Use", "Next"], ["Form", "Capture requests", "Review"], ["Tracker", "See status", "Follow up"]],
    done: "The owner can take requests and see what needs attention.",
    scale: "Local Service Operating System or custom work."
  },
  {
    cat: "Digital",
    tag: "digital setup packet",
    title: "digital setup packet",
    id: "website-landing-page",
    price: "$250-$750",
    summary: "Website outline, page copy, AI prompts, form layout, and basic automation plan.",
    best: "Local businesses needing a cleaner online setup.",
    problem: "The business needs a simple public page or digital process that makes requests easier.",
    sends: "Services, photos, location, contact method, examples, and existing wording.",
    builds: ["Website outline", "Page copy", "AI prompt pack", "Form layout", "Basic automation map"],
    steps: [["Clarify", "Pick the offer."], ["Structure", "Build page sections."], ["Write", "Draft copy."], ["Connect", "Add request path."]],
    out: [["Section", "Purpose", "Action"], ["Hero", "Explain offer", "Start request"], ["Services", "Show choices", "Pick package"]],
    done: "The customer has a clear online setup path.",
    scale: "Business Cleanup Packet or custom work."
  },
  {
    cat: "Custom",
    tag: "custom work",
    title: "custom work",
    id: "custom-work-build",
    price: "Quoted / $250+ minimum",
    summary: "Scoped custom tracker, dashboard, packet, form, page, layout, calculator, checklist, or simple system.",
    best: "Problems that do not fit a standard package exactly.",
    problem: "The catalog is close, but the needed output is custom.",
    sends: "Notes, screenshots, photos, messy files, old trackers, repeated problems, or a rough idea.",
    builds: ["Scope note", "Recommended format", "Price range", "Boundary check", "Custom output"],
    steps: [["Review", "Understand the mess."], ["Scope", "Define output."], ["Quote", "Set price and boundaries."], ["Build", "Deliver custom work."]],
    out: [["Need", "Format", "Next"], ["Tracker", "Sheet", "Build"], ["Layout", "Packet", "Review"]],
    done: "The customer gets the useful custom output without forcing the wrong package.",
    scale: "Monthly System Tune-Up or Local Service Operating System."
  }
];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, match => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[match]));
}

function renderTable(rows) {
  return `<div class="mock-table">${rows.map((row, index) => `<div class="mock-row ${index ? "" : "head"}">${row.map(cell => `<div>${escapeHtml(cell)}</div>`).join("")}</div>`).join("")}</div>`;
}

function renderProduct(product, index) {
  return `<article class="product" id="${escapeHtml(product.id)}"><div class="product-head"><div><span class="product-number">Package ${String(index + 1).padStart(2, "0")} · worked example</span><h3>${escapeHtml(product.title)}</h3><p>${escapeHtml(product.summary)}</p></div><span class="price">${escapeHtml(product.price)}</span></div><div class="product-grid"><div class="product-info"><div class="detail important-detail"><h4>Best for</h4><p>${escapeHtml(product.best)}</p></div><div class="detail"><h4>Customer problem</h4><p>${escapeHtml(product.problem)}</p></div><div class="detail"><h4>What customer sends</h4><p>${escapeHtml(product.sends)}</p></div><div class="detail"><h4>What Highway 38 builds</h4><ul>${product.builds.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div><div class="process"><h4>4-step process</h4><div class="steps">${product.steps.map((step, stepIndex) => `<div class="step"><b>${stepIndex + 1}. ${escapeHtml(step[0])}</b><p>${escapeHtml(step[1])}</p></div>`).join("")}</div></div></div><div class="preview"><div class="preview-title"><strong>Finished-output example</strong><span>Walkthrough preview</span></div>${renderTable(product.out)}<div class="done-grid"><div><strong>Definition of done</strong><span>${escapeHtml(product.done)}</span></div><div><strong>Scale path</strong><span>${escapeHtml(product.scale)}</span></div></div><a class="request-link" href="https://docs.google.com/forms/d/e/1FAIpQLScTWaK40mNNaf1ek3w4gC3VYwvpNT9fnXlHodKeOZl7lPfCyQ/viewform" target="_blank" rel="noopener">Start this request</a></div></div></article>`;
}

function renderCatalog() {
  const catalog = document.getElementById("catalogGrid");
  const sections = document.getElementById("sections");
  if (!catalog || !sections) return;
  catalog.innerHTML = products.map(product => `<a class="product-card" href="#${escapeHtml(product.id)}"><div class="card-top"><small>${escapeHtml(product.tag)}</small><span class="card-price">${escapeHtml(product.price)}</span></div><strong>${escapeHtml(product.title)}</strong><span>${escapeHtml(product.summary)}</span><em>View worked example</em></a>`).join("");
  sections.innerHTML = `<section class="section section-alt" id="current-packages"><div class="container"><div class="section-title"><span class="badge">Current Packages</span><h2>Highway 38 Solutions package examples.</h2><p>Each package shows what the customer sends, what gets built, and how the request turns into a usable output.</p></div>${products.map((product, index) => renderProduct(product, index)).join("")}</div></section>`;
}

renderCatalog();
