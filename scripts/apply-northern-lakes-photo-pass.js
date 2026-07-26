'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const site = path.join(root, 'businesses', 'northern-lakes');
const version = 'rendered-photo-pass-20260726';
const photoNames = 'hero|snow|lawn|landscaping|excavation|equipment|materials|lake|about';

function read(name) {
  return fs.readFileSync(path.join(site, name), 'utf8');
}

function write(name, content) {
  fs.writeFileSync(path.join(site, name), content);
}

function versionPhotos(content) {
  return content.replace(
    new RegExp(`assets\/(${photoNames})\\.svg(?:\\?[^"'\\s>]*)?`, 'g'),
    (_match, name) => `assets/${name}.svg?v=${version}`
  );
}

function replaceAll(content, from, to) {
  return content.split(from).join(to);
}

const shellPath = path.join(site, 'site-shell.js');
let shell = fs.readFileSync(shellPath, 'utf8');
shell = shell.replace(/const V='[^']+';/, `const V='${version}';`);
shell = shell.replace("landscape:asset('lawn.svg')", "landscape:asset('landscaping.svg')");
shell = shell.replace("about:asset('hero.svg')", "about:asset('about.svg')");
fs.writeFileSync(shellPath, shell);

for (const file of fs.readdirSync(site).filter(name => name.endsWith('.html'))) {
  let html = read(file);
  html = html.replace(/https:\/\/raw\.githubusercontent\.com\/rkrueth-maker\/highway-38-solutions\/[a-f0-9]+\/businesses\/northern-lakes\/assets\/hero\.svg/g, `assets/hero.svg?v=${version}`);
  html = versionPhotos(html);
  html = html.replace(/site-shell\.js(?:\?[^"']*)?/g, `site-shell.js?v=${version}`);

  if (file === 'landscaping.html') {
    html = replaceAll(html, `assets/lawn.svg?v=${version}`, `assets/landscaping.svg?v=${version}`);
    html = html.replace(
      /(<h3>Landscape Maintenance<\/h3>)/,
      '$1'
    );
  }

  if (file === 'about.html') {
    html = replaceAll(html, `assets/hero.svg?v=${version}`, `assets/about.svg?v=${version}`);
  }

  if (file === 'contact.html') {
    html = html.replace(`assets/lawn.svg?v=${version}`, `assets/lake.svg?v=${version}`);
  }

  if (file === 'reviews.html') {
    html = html.replace(`assets/lawn.svg?v=${version}`, `assets/about.svg?v=${version}`);
  }

  if (file === 'service-areas.html') {
    html = html.replace(`assets/lawn.svg?v=${version}`, `assets/lake.svg?v=${version}`);
  }

  if (file === 'gallery.html') {
    html = html.replace(`assets/lawn.svg?v=${version}`, `assets/landscaping.svg?v=${version}`);
    html = html.replace(/assets\/hero\.svg\?v=rendered-photo-pass-20260726(?=" alt="Northern Lakes Duramax work truck")/, `assets/about.svg?v=${version}`);
  }

  if (file === 'lawn.html') {
    let seen = 0;
    html = html.replace(new RegExp(`assets/lawn\\.svg\\?v=${version}`, 'g'), match => {
      seen += 1;
      return [4, 5].includes(seen) ? `assets/landscaping.svg?v=${version}` : match;
    });
  }

  if (file === 'index.html') {
    html = html.replace(/<link rel="preload" as="image" href="assets\/hero\.svg\?v=[^"]+"[^>]*>/, `<link rel="preload" as="image" href="assets/hero.svg?v=${version}" fetchpriority="high">`);
    html = html.replace(/<meta property="og:image" content="[^"]+">/, `<meta property="og:image" content="https://rkrueth-maker.github.io/highway-38-solutions/businesses/northern-lakes/assets/hero.svg?v=${version}">`);
    html = html.replace(/"image":"[^"]+"/, `"image":"https://rkrueth-maker.github.io/highway-38-solutions/businesses/northern-lakes/assets/hero.svg?v=${version}"`);
    html = html.replace(/<img src="assets\/hero\.svg\?v=[^"]+" alt="Northern Lakes Chevrolet Duramax work truck with BOSS plow">/, `<img src="assets/about.svg?v=${version}" alt="Northern Lakes work truck and equipment trailer">`);
    html = html.replace(/ onerror="[^"]*"/g, '');
    html = html.replace(/ referrerpolicy="no-referrer"/g, '');
  }

  write(file, html);
}

console.log(`Applied Northern Lakes rendered photo pass ${version}.`);
