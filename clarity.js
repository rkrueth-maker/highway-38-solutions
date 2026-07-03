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
    if (action) card.insertBefore(bestFor, action); else card.appendChild(bestFor);
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
    replacements.forEach(([pattern, value]) => { text = text.replace(pattern, value); });
    node.nodeValue = text;
  });
  replacements.forEach(([pattern, value]) => { document.title = document.title.replace(pattern, value); });
  document.querySelectorAll('meta[content]').forEach((meta) => {
    let content = meta.getAttribute('content');
    replacements.forEach(([pattern, value]) => { content = content.replace(pattern, value); });
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

function addLaunchNavigation() {
  const navLinks = document.querySelector(".navlinks");
  if (!navLinks) return;
  const beforeCta = navLinks.querySelector(".nav-cta")?.closest("li");
  const links = [
    ["packages.html#packages", "Packages"],
    ["shop-automation.html#main", "Shop / CNC"],
    ["examples.html#examples", "Examples"],
    ["test-plan.html#main", "Test Plan"],
    ["launch-plan.html#main", "Launch Plan"]
  ];
  links.forEach(([href, label]) => {
    if (!navLinks.querySelector(`a[href*="${href.split('#')[0]}"]`)) {
      const li = document.createElement("li");
      li.innerHTML = `<a href="${href}">${label}</a>`;
      navLinks.insertBefore(li, beforeCta || null);
    }
  });
}

function addMobileNavSupport() {
  const nav = document.querySelector("nav");
  const navLinks = document.querySelector(".navlinks");
  if (!nav || !navLinks || document.querySelector(".nav-toggle")) return;
  navLinks.id = navLinks.id || "site-menu";
  const button = document.createElement("button");
  button.className = "nav-toggle";
  button.type = "button";
  button.setAttribute("aria-controls", navLinks.id);
  button.setAttribute("aria-expanded", "false");
  button.innerHTML = '<span class="hamburger" aria-hidden="true"><span></span></span>Menu';
  nav.insertBefore(button, navLinks);
  button.addEventListener("click", () => {
    const open = navLinks.classList.toggle("is-open");
    button.setAttribute("aria-expanded", String(open));
  });
  navLinks.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
    navLinks.classList.remove("is-open");
    button.setAttribute("aria-expanded", "false");
  }));
}

function addLaunchFooterLinks() {
  const footer = document.querySelector("footer");
  if (!footer || footer.querySelector('a[href="privacy.html"]')) return;
  const span = document.createElement("span");
  span.innerHTML = '<a href="privacy.html">Privacy</a> · <a href="terms.html">Terms</a> · <a href="launch-plan.html#main">Launch Plan</a> · <a href="test-plan.html#main">Test Plan</a>';
  footer.appendChild(span);
}

function addGlobalPolishStyles() {
  if (document.querySelector("#highway38-launch-polish")) return;
  const style = document.createElement("style");
  style.id = "highway38-launch-polish";
  style.textContent = `
    .skip{position:absolute;left:-999px;top:0;background:#fff;color:#0f172a;padding:.75rem 1rem;z-index:9999;border-radius:0 0 .5rem 0}.skip:focus{left:0}
    a:focus-visible,button:focus-visible,.btn:focus-visible,.nav-cta:focus-visible,.tertiary-link:focus-visible{outline:3px solid #fbbf24;outline-offset:4px;border-radius:10px}
    .nav-toggle{display:none;border:1px solid rgba(255,255,255,.22);border-radius:12px;background:rgba(255,255,255,.08);color:inherit;padding:.65rem .8rem;font-weight:800}
    .hamburger{display:inline-block;width:1.15rem;height:.85rem;position:relative;margin-right:.35rem;vertical-align:-.1rem}.hamburger:before,.hamburger:after,.hamburger span{content:"";position:absolute;left:0;right:0;height:2px;background:currentColor;border-radius:2px}.hamburger:before{top:0}.hamburger span{top:50%;transform:translateY(-50%)}.hamburger:after{bottom:0}
    footer a{color:inherit;text-decoration:underline;text-underline-offset:3px}
    @media(max-width:820px){nav{align-items:center}.nav-toggle{display:inline-flex;align-items:center}.navlinks{display:none;position:absolute;top:100%;left:1rem;right:1rem;z-index:30;background:rgba(15,23,42,.98);border:1px solid rgba(255,255,255,.18);border-radius:18px;padding:1rem;box-shadow:0 18px 55px rgba(0,0,0,.35)}.navlinks.is-open{display:grid;gap:.5rem}.navlinks li{width:100%}.navlinks a{display:block;padding:.75rem .85rem;border-radius:12px}.navlinks .nav-cta{display:block;text-align:center}.buttons a{width:100%;text-align:center}}
  `;
  document.head.appendChild(style);
}

function addLaunchReadinessBanner() {
  if (document.querySelector(".launch-readiness-banner")) return;
  const main = document.querySelector("main");
  if (!main || location.pathname.includes("launch-plan") || location.pathname.includes("test-plan")) return;
  const banner = document.createElement("section");
  banner.className = "section launch-readiness-banner";
  banner.innerHTML = `<div class="container"><div class="section-title"><span class="badge">Launch-ready path</span><h2>Ready to test before public launch.</h2><p>Use the launch checklist and test plan to run one normal package and one Shop / CNC concept request end-to-end before sharing the final URL.</p></div><div class="buttons"><a class="btn btn-outline" href="test-plan.html#main">Open Test Plan</a><a class="btn btn-outline" href="launch-plan.html#main">Open Launch Checklist</a></div></div>`;
  const firstSection = main.querySelector("section");
  main.insertBefore(banner, firstSection ? firstSection.nextSibling : null);
}

function bootClarity() {
  addGlobalPolishStyles();
  applyHighway38Brand();
  repairRequestLinks();
  addLaunchNavigation();
  addMobileNavSupport();
  addLaunchFooterLinks();
  addLaunchReadinessBanner();
  addCardClarity();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootClarity); else bootClarity();