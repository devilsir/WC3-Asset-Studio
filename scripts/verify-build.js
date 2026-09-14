'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const required = [
  'main.js',
  'preload.js',
  'package.json',
  'app/index.html',
  'app/js/app.js',
  'app/js/editor.js',
  'app/js/model-lab.js',
  'app/js/war3-model-core.js',
  'app/js/model-lab-geometry.js',
  'app/js/buttons-studio.js',
  'app/js/sanity.js',
  'app/css/app.css',
  'app/css/model-lab.css',
  'app/THIRD_PARTY_LICENSES.md',
  'assets/icon.ico',
  'tools/casc-reader.ps1'
];

const missing = required.filter(rel => !fs.existsSync(path.join(root, rel)));
if (missing.length) {
  console.error('Build verification failed. Missing required files:');
  for (const rel of missing) console.error(`  - ${rel}`);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.version !== '1.1.0') {
  console.error(`Build verification failed. package.json version is ${pkg.version}, expected 1.1.0.`);
  process.exit(1);
}

const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
if (!main.includes("const PRODUCT = 'WC3 Asset Studio v1.1'")) {
  console.error('Build verification failed. main.js product version is not v1.1.');
  process.exit(1);
}

const icon = fs.statSync(path.join(root, 'assets/icon.ico'));
if (icon.size < 1024) {
  console.error('Build verification failed. assets/icon.ico looks invalid.');
  process.exit(1);
}

console.log('WC3 Asset Studio v1.1 build verification passed.');
