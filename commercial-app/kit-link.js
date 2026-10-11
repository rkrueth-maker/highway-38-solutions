(function () {
  'use strict';
  // Ask Kit: routes to the in-app AI assistant (tenant-aware).
  // The in-app AI page has access to state.businessId and business data,
  // so it knows which business the owner is asking about.
  // This replaces the old hardcoded https://muse.ai/ external link which
  // had no tenant/business context for customers.
  var BUILD = '20261011-kit-link-tenant-aware-1';

  function injectStyle() {
    if (document.getElementById('h38KitLinkStyle')) return;
    var style = document.createElement('style');
    style.id = 'h38KitLinkStyle';
    style.textContent = [
      '#askKitButton{text-decoration:none;cursor:pointer;}',
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
    var button = document.createElement('button');
    button.id = 'askKitButton';
    button.type = 'button';
    button.className = 'ai-launcher';
    button.setAttribute('aria-label', 'Ask Hank — your business assistant');
    button.title = 'Ask Hank about your business';
    button.innerHTML = '<span aria-hidden="true">🤖</span><span class="ai-launcher-label">Ask Hank</span>';
    button.onclick = function() {
      // Tenant-aware: open the in-app AI page which has business context
      if (typeof window.openPage === 'function') {
        window.openPage('ai');
      }
    };
    var aiButton = document.getElementById('globalAiButton');
    if (aiButton && aiButton.parentNode === actions) {
      aiButton.insertAdjacentElement('afterend', button);
    } else {
      actions.appendChild(button);
    }
  }

  if (document.body) {
    inject();
  } else {
    document.addEventListener('DOMContentLoaded', inject, { once: true });
  }
  window.H38_KIT_LINK = Object.freeze({ build: BUILD, tenantAware: true });
})();
