# Highway 38 Public Website Change Rules

These rules govern every public Highway 38 website page, redirect, shared component, image, stylesheet, script, form, example, and GitHub Pages deployment.

They apply to every chat, agent, branch, pull request, direct commit, and automation in this repository.

They operate under `docs/architecture/WEBSITE_AND_WEB_APP_CHANGE_GOVERNANCE.md`. Complete the combined change intake and run `node scripts/verify-change-governance.js` before applying these website-specific rules.

## 1. Public website architecture

1. The customer-facing website is project-first. Visitors begin with project examples, what Highway 38 does, pricing, or a request—not a retired product catalog.
2. Shared navigation, footer, logo reference, accessibility behavior, owner-link routing, and image loading behavior are owned by:
   - `assets/js/h38-site-v2.js`
   - `assets/css/h38-site-v2.css`
3. Public page routes and retired-route destinations are declared in `scripts/config/public-website-routes.json` and verified by `scripts/verify-public-website-architecture.js`.
4. `assets/js/project-intelligence.js` and `brand-global.js` are compatibility loaders only. They may not own navigation, footer markup, image placement, image fallbacks, or page-specific representative imagery.
5. Page-specific content remains in the page that owns it. Shared elements may not be copied into individual pages after they are centralized.
6. A retired page must redirect to a current customer-facing page. It may not keep a second navigation system, catalog, proof gallery, tool center, or product architecture.
7. There is one image-placement manifest: `scripts/config/approved-public-image-placements.json`. Do not create an alternate or compatibility image manifest.

## 2. Exact image rules

1. The exact approved image files and approved placements are controlled by:
   - `scripts/config/approved-public-assets.json`
   - `scripts/config/approved-public-image-placements.json`
2. Do not replace, regenerate, redraw, restyle, recolor, crop, recompress, rename, move, reorder, or substitute an approved image without Rick’s explicit approval.
3. An approved image may move without a new visual approval only when its current placement is objectively broken, duplicated by mistake, inaccessible, or clearly unrelated to the surrounding section.
4. A placement correction must preserve the exact same binary and record:
   - page;
   - section/role;
   - old placement;
   - new placement;
   - exact reason.
5. Runtime JavaScript may add `loading`, `decoding`, `fetchpriority`, dimensions, or accessibility attributes. It may not change `src`, `srcset`, or insert additional representative images.
6. Image error handling may hide a broken approved logo. It may not load a substitute logo or content image.
7. Before changing public imagery, run:

```bash
python3 scripts/verify-public-images.py
node scripts/verify-public-image-placements.js
```

## 3. Adding a page

A new public page must:

1. be listed in `scripts/config/public-website-routes.json`;
2. use the canonical site shell directly or through an approved compatibility loader;
3. use the approved logo cache key;
4. declare one title, description, canonical URL where appropriate, and one main landmark;
5. use shared layout and component classes before adding page-specific CSS;
6. add page-specific CSS/JavaScript only when shared files cannot correctly own the behavior;
7. register every approved content image and its placement;
8. lazy-load below-fold images and preserve stable image geometry;
9. include mobile and keyboard behavior;
10. keep private owner/customer applications separated from public content;
11. pass governance, architecture, link, image, accessibility, performance, and deployment verification.

## 4. Changing a page

1. Change shared navigation or footer only in the canonical site registry.
2. Change shared shell styling only in `assets/css/h38-site-v2.css`.
3. Change shared shell behavior only in `assets/js/h38-site-v2.js`.
4. Change page content in the page that owns it.
5. Do not add another global branding, navigation, footer, visual cleanup, or image-placement script.
6. Do not add runtime DOM mutation layers when the source page can be changed directly.
7. Do not reintroduce product catalogs, focused-app menus, retired tools, or proof catalogs as primary public navigation.
8. Preserve approved images exactly unless the approved placement policy permits correction.
9. Preserve request security, no-charge language, owner review, customer isolation, and private portal routes.
10. Keep cache keys versioned only when the underlying controlled file changes.
11. Update source, registry/manifest, verifier, staging checks, and live checks together when the change creates a new customer-visible contract.

## 5. Deleting or retiring a page

1. Confirm the page is not the current canonical route for a required customer workflow.
2. Preserve inbound links with a lightweight redirect to the current route.
3. Remove the old page shell, scripts, styles, and duplicate content system.
4. Update the route registry, link verifier, sitemap, and any navigation references in the same change.
5. Do not delete approved image files merely because a page is retired; first confirm they are unused and obtain approval for binary deletion.
6. Keep owner and customer portal URLs intact unless a separately approved migration changes them.

## 6. Performance rules

1. The public shell loads one canonical JavaScript file and one canonical shell stylesheet.
2. Compatibility loaders must be tiny and load the same canonical file at most once.
3. No public shell script may use a page-wide `MutationObserver`.
4. No public shell script may insert or swap content images.
5. Below-fold images are lazy loaded; the primary hero image may be eager and high priority.
6. Images use stable dimensions, aspect-ratio containers, or both to prevent layout shift.
7. Do not load catalog, business-system, tool, or page-specific data scripts on pages that do not use them.
8. Retired pages use minimal redirects rather than loading the full site.
9. Shared CSS and JavaScript changes replace duplicate code instead of adding another layer.
10. A new library or dependency requires documented size and performance justification.

## 7. Current primary public routes

The current project-first public structure is:

- `/` — homepage
- `sample-library-now.html` — eight complete project examples
- `solutions.html` — what Highway 38 does
- `pricing.html` — project-first pricing
- `about.html` — experience and approach
- `contact.html` — contact choices
- `start-request.html` — secure project request
- `portal.html` — private owner gateway
- `cabin-project-complete.html` and `contractor-quote-complete.html` — detailed demonstrations

Other active specialist pages may remain linked from Solutions, but they must use the same shared shell and may not create another top-level site architecture.

## 8. Required verification

Before merge or direct-main acceptance:

```bash
node scripts/verify-change-governance.js
python3 scripts/verify-public-images.py
node scripts/verify-public-image-placements.js
node scripts/verify-public-website-architecture.js
node scripts/verify-public-ecosystem-tools.js
```

Before claiming the website is live:

1. confirm exact `origin/main` commit;
2. observe the GitHub Pages deployment run;
3. confirm the deployed source SHA;
4. make cache-busted checks against the primary pages;
5. record `LOCAL`, `ORIGIN_MAIN`, and `LIVE_PAGES` separately;
6. do not claim live based only on a merged commit.

## 9. Definition of done

A public website change is complete only when:

- the combined governance intake is complete;
- the shared shell remains singular;
- the page registry and redirects are correct;
- exact image paths and placements match the single canonical manifest;
- no image source is changed at runtime;
- navigation and footer are controlled centrally;
- below-fold imagery is lazy loaded;
- mobile and keyboard navigation work;
- retired routes do not load duplicate systems;
- request and portal boundaries remain intact;
- all required verifiers pass;
- the exact commit is verified on GitHub Pages;
- the approved logo and approved content images are unchanged.


## 10. Rendered visual acceptance

1. Visual changes use a branch and pull request; direct-main visual changes are prohibited.
2. Project photographs use direct PNG, JPEG, or WebP files. SVG photo wrappers are prohibited.
3. Verification inspects rendered pixels, not only paths, signatures, HTTP responses, or screenshot-file existence.
4. Full-page desktop/mobile and per-image evidence are required before merge and after deployment.
5. Automation records technical verification only. Rick explicit review is required before visual acceptance is claimed.
