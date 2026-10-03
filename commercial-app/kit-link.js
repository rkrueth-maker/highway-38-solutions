(function () {
  'use strict';
  // Ask Kit: deep link from the Business Office to the owner's Muse assistant.
  // Tenant-neutral by design (Kit serves both H38 and Northern Lakes).
  var BUILD = '20261002-kit-link-1';
  var KIT_URL = 'https://muse.ai/';

  function injectStyle() {
    if (document.getElementById('h38KitLinkStyle')) return;
    var style = document.createElement('style');
    style.id = 'h38KitLinkStyle';
    style.textContent = [
      '#askKitButton{text-decoration:none;}',
      '@media(max-width:760px){',
      '  #askKitButton .ai-launcher-label{display:none;}',
      '  #askKitButton{padding-left:10px;padding-right:10px;}',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function inject() {
    var actions = document.querySelector('.top-actions');
    if (!actions || document.getElementById('askKitButton')) return;
    injectStyle();
    var anchor = document.createElement('a');
    anchor.id = 'askKitButton';
    anchor.className = 'ai-launcher';
    anchor.href = KIT_URL;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    anchor.setAttribute('aria-label', 'Open Muse (Kit is your assistant there)');
    anchor.title = 'Open Muse in a new tab — Kit is your assistant';
    anchor.innerHTML = '<span aria-hidden="true">🤖</span><span class="ai-launcher-label">Ask Kit</span>';
    var aiButton = document.getElementById('globalAiButton');
    if (aiButton && aiButton.parentNode === actions) {
      aiButton.insertAdjacentElement('afterend', anchor);
    } else {
      actions.appendChild(anchor);
    }
  }

  if (document.body) {
    inject();
  } else {
    document.addEventListener('DOMContentLoaded', inject, { once: true });
  }
  window.H38_KIT_LINK = Object.freeze({ build: BUILD, url: KIT_URL });
})();
