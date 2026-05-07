#!/usr/bin/env node
// sw.js の CACHE バージョンを bgm-vN → bgm-v(N+1) に自動更新
// package.json の prebuild / predev から呼ぶか、手動で: node scripts/bump-sw-version.js

const fs = require('fs');
const path = require('path');

const swPath = path.join(__dirname, '..', 'sw.js');
let src = fs.readFileSync(swPath, 'utf8');

const match = src.match(/const CACHE = 'bgm-v(\d+)'/);
if (!match) { console.error('CACHE version not found in sw.js'); process.exit(1); }

const next = parseInt(match[1], 10) + 1;
src = src.replace(/const CACHE = 'bgm-v\d+'/, `const CACHE = 'bgm-v${next}'`);
fs.writeFileSync(swPath, src);
console.log(`sw.js: bgm-v${match[1]} → bgm-v${next}`);
