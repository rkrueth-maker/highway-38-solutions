#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const publicDomain = 'https://highway38solutions.com/';
const legacyDomain = 'https://rkrueth-maker.github.io/highway-38-solutions/';
const homepage = read('index.html');
const config = read('commercial-app/supabase-config.js');
const social = read('commercial-app/app-15.js');
const serviceWorker = read('commercial-app/service-worker.js');
const routes = JSON.parse(read('scripts/config/public-website-routes.json'));
const homepageRoute = routes.primary.find(route => route.path === 'index.html');

assert(homepage.includes(`<link rel="canonical" href="${publicDomain}">`), 'Homepage canonical URL must use highway38solutions.com.');
assert(homepage.includes(`<meta property="og:url" content="${publicDomain}">`), 'Facebook Open Graph URL must use highway38solutions.com.');
assert(homepage.includes('property="og:image" content="https://highway38solutions.com/'), 'Facebook preview image must use the custom domain.');
assert(!homepage.includes(legacyDomain), 'Homepage metadata must not expose the GitHub Pages hostname.');
assert(homepageRoute?.canonical === publicDomain, 'Public website route authority must recognize highway38solutions.com as the homepage canonical URL.');

assert(config.includes(`authRedirectUrl: '${publicDomain}commercial-app/'`), 'Supabase Auth must return to the custom-domain Business Office.');
assert(!config.includes(legacyDomain), 'Production Supabase configuration must not use the GitHub Pages hostname.');

assert(social.includes(`const H38_PUBLIC_SITE_URL='${publicDomain}'`), 'Social Control must default to the public custom domain.');
assert(social.includes(`const H38_LEGACY_PUBLIC_SITE_URL='${legacyDomain}'`), 'Social Control must recognize the retired GitHub Pages URL for normalization.');
assert(social.includes('normalizeSocialLinkUrl(data.linkUrl)'), 'Social drafts must normalize retired Highway 38 links before saving.');
assert(social.includes('value="${esc(H38_PUBLIC_SITE_URL)}"'), 'The Social Control link field must visibly default to highway38solutions.com.');

assert(serviceWorker.includes("'supabase-config.js'"), 'Supabase configuration must be network-first.');
assert(serviceWorker.includes("'app-15.js'"), 'Social Control must be network-first.');
assert(serviceWorker.includes("CACHE_NAME='h38-business-office-20260805-2200'"), 'Business Office cache version must be refreshed.');

console.log(JSON.stringify({
  status: 'PASS',
  canonicalUrl: publicDomain,
  routeAuthorityCanonicalUrl: homepageRoute.canonical,
  facebookOpenGraphUrl: publicDomain,
  businessOfficeAuthRedirect: `${publicDomain}commercial-app/`,
  socialDraftDefault: publicDomain,
  legacyDomainNormalized: true,
  automaticPublishingEnabled: false
}, null, 2));
