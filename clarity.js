const HIGHWAY38_FORM_LINK = "https://docs.google.com/forms/d/e/1FAIpQLScTWaK40mNNaf1ek3w4gC3VYwvpNT9fnXlHodKeOZl7lPfCyQ/viewform";
const HIGHWAY38_BACKEND_LINK = "backend-system.html#backend";

function addCardClarity() {
  if (typeof products === "undefined") return;

  const cards = document.querySelectorAll(".product-card");
  cards.forEach((card, index) => {
    const product = products[index];
    if (!product || card.querySelector(".card-best")) return;

    const bestFor = document.createElement("div");
    bestFor.className = "card-best";
    bestFor.innerHTML = `<b>Best for:</b> ${product.best || "messy details that need a clear finished output"}`;

    const action = card.querySelector("em");
    if (action) {
      card.insertBefore(bestFor, action);
    } else {
      card.appendChild(bestFor);
    }
  });
}

function applyHighway38Brand() {
  const replacements = [
    [/ForgeIQ by Northwoods Problem Solvers/g, "Highway 38 Solutions"],
    [/ForgeIQ by Northwoods/g, "Highway 38 Solutions"],
    [/Northwoods Problem Solvers/g, "Highway 38 Solutions"],
    [/Northwoods Workbench/g, "Highway 38 Solutions"],
    [/Northwoods Project Desk/g, "Highway 38 Project Desk"],
    [/Northwoods Shop Desk/g, "Highway 38 Shop Desk"],
    [/Northwoods Business Desk/g, "Highway 38 Business Desk"],
    [/Northwoods Digital Desk/g, "Highway 38 Digital Desk"],
    [/Northwoods Cleanup Desk/g, "Highway 38 Cleanup Desk"],
    [/ForgeIQ Product Ladder/g, "Highway 38 Solutions Product Ladder"],
    [/ForgeIQ 36-product ladder/g, "Highway 38 Solutions 36-product ladder"],
    [/ForgeIQ proof/g, "Highway 38 proof"],
    [/ForgeIQ keeps/g, "Highway 38 Solutions keeps"],
    [/ForgeIQ sorts/g, "Highway 38 Solutions sorts"],
    [/ForgeIQ returns/g, "Highway 38 Solutions returns"],
    [/ForgeIQ product card/g, "Highway 38 Solutions product card"],
    [/ForgeIQ/g, "Highway 38 Solutions"],
    [/Industrial Logic Solutions/g, "Highway 38 Solutions"],
    [/GarageOS/g, "Highway 38 Solutions"],
    [/WrenchIQ/g, "Highway 38 Solutions"]
  ];

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach((node) => {
    let text = node.nodeValue;
    replacements.forEach(([pattern, value]) => {
      text = text.replace(pattern, value);
    });
    node.nodeValue = text;
  });

  replacements.forEach(([pattern, value]) => {
    document.title = document.title.replace(pattern, value);
  });

  document.querySelectorAll('meta[content]').forEach((meta) => {
    let content = meta.getAttribute('content');
    replacements.forEach(([pattern, value]) => {
      content = content.replace(pattern, value);
    });
    meta.setAttribute('content', content);
  });
}

function repairRequestLinks() {
  document.querySelectorAll('a[href*="docs.google.com/forms"]').forEach((link) => {
    link.href = HIGHWAY38_FORM_LINK;
    link.target = "_blank";
    link.rel = "noopener";
  });
}

function addProofBuildLinks() {
  const navLinks = document.querySelector(".navlinks");
  if (navLinks && !navLinks.querySelector('a[href*="proof-builds.html"]')) {
    const li = document.createElement("li");
    li.innerHTML = '<a href="proof-builds.html#proof-builds">Proof Builds</a>';
    const cta = navLinks.querySelector(".nav-cta")?.closest("li");
    navLinks.insertBefore(li, cta || null);
  }

  if (navLinks && !navLinks.querySelector('a[href*="backend-system.html"]')) {
    const li = document.createElement("li");
    li.innerHTML = '<a href="backend-system.html#backend">Backend</a>';
    const cta = navLinks.querySelector(".nav-cta")?.closest("li");
    navLinks.insertBefore(li, cta || null);
  }

  const heroButtons = document.querySelector(".hero .buttons");
  if (heroButtons && !heroButtons.querySelector('a[href*="proof-builds.html"]')) {
    const proof = document.createElement("a");
    proof.className = "btn btn-outline";
    proof.href = "proof-builds.html#proof-builds";
    proof.textContent = "See Full Proof Builds";
    const secondary = heroButtons.querySelector(".tertiary-link");
    heroButtons.insertBefore(proof, secondary || null);
  }

  if (heroButtons && !heroButtons.querySelector('a[href*="backend-system.html"]')) {
    const backend = document.createElement("a");
    backend.className = "tertiary-link";
    backend.href = HIGHWAY38_BACKEND_LINK;
    backend.textContent = "See the Backend System";
    heroButtons.appendChild(backend);
  }
}

function addVisualSweepBanner() {
  if (document.querySelector(".proof-sweep-banner")) return;

  const main = document.querySelector("main");
  if (!main) return;

  const banner = document.createElement("section");
  banner.className = "section proof-sweep-banner";
  banner.innerHTML = `
    <div class="container">
      <div class="section-title">
        <span class="badge">Proof builds and backend added</span>
        <h2>Complete beginning-to-end example projects plus prepared fulfillment sheets.</h2>
        <p>Every core product now has a proof build and the backend has a lead tracker, basic layout builder, product build sheets, tool library, QA handoff, and SOPs.</p>
      </div>
      <div class="case-grid">
        <a class="case-card" href="proof-builds.html#project-packet"><small>Project Packet</small><h3>Garage idea to build packet.</h3><p>See the sketch, layout proof, material phases, build order, and owner checklist.</p></a>
        <a class="case-card" href="proof-builds.html#business-cleanup"><small>Business Cleanup</small><h3>Texts to quote/deposit system.</h3><p>See customer messages become statuses, quote sheet, deposit path, and follow-up routine.</p></a>
        <a class="case-card" href="backend-system.html#sheet-preview"><small>Backend Sheet</small><h3>Basic Layout Builder is ready.</h3><p>See the prepared worksheet for photos, dimensions, zones, deliverables, and QA.</p></a>
        <a class="case-card" href="backend-system.html#comparison"><small>Comparison</small><h3>Borrow the trust pieces.</h3><p>Visual proof, structured intake, prepared templates, status tracking, and clear handoff.</p></a>
      </div>
    </div>`;

  const firstSection = main.querySelector("section");
  main.insertBefore(banner, firstSection ? firstSection.nextSibling : null);
}

function bootClarity() {
  applyHighway38Brand();
  repairRequestLinks();
  addProofBuildLinks();
  addVisualSweepBanner();
  addCardClarity();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootClarity);
} else {
  bootClarity();
}