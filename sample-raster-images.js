(function () {
  'use strict';

  const VERSION = '20260711-real-sample-proof-v2';
  const scriptUrl = document.currentScript && document.currentScript.src
    ? document.currentScript.src
    : new URL('sample-raster-images.js', document.baseURI).href;
  const assetRoot = new URL('assets/', scriptUrl);
  const reviewMode = /raster-proof-review\.html$/.test(window.location.pathname);

  const proofByProduct = {
    'H38-P001': { src: 'rick-review-problem-snapshot-v1.png', alt: 'Problem Snapshot finished deliverable preview', caption: 'Finished hypothetical Problem Snapshot showing the organized issue, missing information, risks, and first actions.' },
    'H38-P002': { src: 'rick-review-basic-layout-v1.png', alt: 'Basic Layout Snapshot finished deliverable preview', caption: 'Finished hypothetical layout proof showing a bounded space, recommended zones, movement, and setup priorities.' },
    'H38-P003': { src: 'rick-review-project-packet-v1.png', alt: 'Project Planning Packet finished deliverable preview', caption: 'Finished hypothetical project packet showing scope, phases, decisions, material groups, and owner actions.' },
    'H38-P004': { src: 'rick-review-shop-flow-v1.png', alt: 'Shop Flow Review finished deliverable preview', caption: 'Finished hypothetical shop-flow proof showing current movement, proposed zones, staging, and first fixes.' },
    'H38-P005': { src: 'rick-review-business-cleanup-v1.png', alt: 'Business Workflow Starter finished deliverable preview', caption: 'Finished hypothetical business-workflow proof showing lead status, quote control, next actions, and follow-up structure.' },
    'H38-P006': { src: 'rick-review-cleanup-rescue-v1.png', alt: 'Cleanup Rescue Plan finished deliverable preview', caption: 'Finished hypothetical cleanup plan showing folder structure, naming rules, review holds, and cleanup sequence.' },
    'H38-P007': { src: 'rick-review-workflow-opportunity-v1.png', alt: 'Workflow Opportunity Snapshot finished deliverable preview', caption: 'Finished hypothetical workflow snapshot showing repeated tasks, tracking fields, approval gates, and the first safe test.' },
    'H38-P008': { src: 'product-proof/digital-workflow-build.png', alt: 'Digital Workflow Build dashboard and test-record preview', caption: 'Product-specific raster preview of the working form, tracker, dashboard, test records, owner review, SOP, and recovery handoff.' },
    'H38-P009': { src: 'product-proof/cleanup-implementation.png', alt: 'Cleanup Implementation folder structure and cleanup-index preview', caption: 'Product-specific raster preview of the completed folder structure, cleanup index, hold rules, and maintenance controls.' },
    'H38-P010': { src: 'product-proof/automation-opportunity-snapshot.png', alt: 'Automation Opportunity Snapshot process and decision preview', caption: 'Product-specific raster preview of current process evidence, timing assumptions, opportunity window, risks, and first data test.' },
    'H38-P011': { src: 'product-proof/shop-bottleneck-roi-audit.png', alt: 'Shop Bottleneck and ROI Audit worksheet preview', caption: 'Product-specific raster preview of cycle-loss categories, bottleneck evidence, investment range, payback assumptions, and next data step.' },
    'H38-P012': { src: 'product-proof/automation-vendor-quote-pack.png', alt: 'Automation Vendor Quote Pack RFQ and comparison preview', caption: 'Product-specific raster preview of the RFQ scope, vendor comparison, exclusions, and acceptance-test checklist.' },
    'H38-P013': { src: 'product-proof/fixture-jig-concept-review.png', alt: 'Fixture and Jig Concept Review layout preview', caption: 'Product-specific raster preview of the locating, clamping, loading, datum, tolerance, and operator-access concept.' },
    'H38-P014': { src: 'product-proof/vision-inspection-concept-review.png', alt: 'Vision and Inspection Concept Review preview', caption: 'Product-specific raster preview of good/bad samples, lighting approach, measurable criteria, test plan, and capability boundary.' },
    'H38-P015': { src: 'product-proof/robot-tending-concept-pack.png', alt: 'Robot Tending Concept Pack cell and sequence preview', caption: 'Product-specific raster preview of cell blocks, robot sequence, part presentation, recovery points, and unresolved safety boundaries.' }
  };

  function productIdFor(card) {
    const idLabel = card.querySelector('.sample-labels span:last-child');
    return idLabel ? idLabel.textContent.trim() : '';
  }

  function assetUrl(path) {
    const url = new URL(path, assetRoot);
    url.searchParams.set('v', VERSION);
    return url.href;
  }

  function proofMarkup(proof, productId) {
    return `
      <figure class="proof-raster proof-raster--image" data-product-proof="${productId}">
        <div class="proof-raster-frame proof-raster-frame--image">
          <img src="${assetUrl(proof.src)}" alt="${proof.alt}" width="1600" height="1000" loading="${reviewMode ? 'eager' : 'lazy'}" decoding="async">
        </div>
        <figcaption>${proof.caption}</figcaption>
      </figure>`;
  }

  function replacePlaceholderVisuals() {
    document.querySelectorAll('.sample-card').forEach((card) => {
      const productId = productIdFor(card);
      const proof = proofByProduct[productId];
      const visual = card.querySelector('.sample-visual');
      if (!proof || !visual) return;

      visual.innerHTML = proofMarkup(proof, productId);
      visual.dataset.proofAsset = 'raster';
      card.dataset.proofAsset = 'raster';
    });
  }

  function run() {
    window.requestAnimationFrame(replacePlaceholderVisuals);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
}());
