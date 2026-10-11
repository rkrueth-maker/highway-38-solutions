/* H38 Script Lazy Loader (2026-10-11)
 * Loads page-specific scripts on demand instead of all upfront.
 * 
 * How it works:
 * - Core scripts (auth, db, shell) load upfront with defer
 * - Page scripts load when openPage() is called for that page
 * - Scripts are cached after first load (loaded Set)
 * - Concurrent requests for same script share one promise
 * 
 * Safety:
 * - If a script fails to load, openPage() shows an error (doesn't break silently)
 * - The PAGE_SCRIPTS map is conservative — when in doubt, keep script upfront
 */

(function() {
  'use strict';

  const loaded = new Set();
  const loading = new Map();

  // Map of page -> script URLs needed for that page.
  // URLs must match the ?build= params in index.html.
  // Only list scripts that are SAFE to lazy-load (page-specific, no startup dependencies).
  const PAGE_SCRIPTS = {
    // Quotes page needs quote-specific scripts
    'quotes': [
      // Note: app-06.js defines renderQuotes and is currently loaded upfront.
      // Add truly optional quote scripts here as they're identified.
    ],
    // Tax page needs tax packet and CPA package
    'tax': [],
    // AI page needs kits-workspace
    'ai': [],
    'assistant': [],
  };

  // Scripts that should preload in background after initial page load.
  // These are non-critical for first paint but will be needed soon.
  const PRELOAD_AFTER_IDLE = [
    // Add heavy but commonly-used scripts here
  ];

  function loadScript(url) {
    if (loaded.has(url)) return Promise.resolve();
    if (loading.has(url)) return loading.get(url);
    
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => {
        loaded.add(url);
        loading.delete(url);
        resolve();
      };
      script.onerror = (e) => {
        loading.delete(url);
        reject(new Error('Failed to load script: ' + url));
      };
      document.head.appendChild(script);
    });
    
    loading.set(url, promise);
    return promise;
  }

  function loadPageScripts(page) {
    const scripts = PAGE_SCRIPTS[page] || [];
    if (!scripts.length) return Promise.resolve();
    return Promise.all(scripts.map(loadScript));
  }

  function preloadInBackground() {
    // Use requestIdleCallback if available, otherwise setTimeout
    const schedule = window.requestIdleCallback || ((cb) => setTimeout(cb, 2000));
    schedule(() => {
      PRELOAD_AFTER_IDLE.forEach(url => {
        loadScript(url).catch(() => {}); // Silently fail background preloads
      });
    });
  }

  // Mark scripts already loaded via index.html as loaded
  // This prevents the loader from re-loading them
  function markExistingScripts() {
    document.querySelectorAll('script[src]').forEach(s => {
      const src = s.getAttribute('src');
      if (src) {
        // Store both full URL and pathname for matching
        loaded.add(src);
        try {
          const url = new URL(src, window.location.href);
          loaded.add(url.pathname);
        } catch (e) {}
      }
    });
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      markExistingScripts();
      preloadInBackground();
    });
  } else {
    markExistingScripts();
    preloadInBackground();
  }

  window.H38ScriptLoader = Object.freeze({
    load: loadScript,
    loadPageScripts: loadPageScripts,
    isLoaded: (url) => loaded.has(url),
    PAGE_SCRIPTS: PAGE_SCRIPTS,
  });
})();
