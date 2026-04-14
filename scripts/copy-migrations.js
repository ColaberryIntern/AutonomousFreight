#!/usr/bin/env node
// Copies SQL migration files from each service's src/repo/migrations into the
// compiled dist/ tree so __dirname-based lookups still work at runtime.
const { copyFileSync, mkdirSync, readdirSync, statSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const SERVICES = ['user', 'carrier', 'notifications', 'compliance'];

function copyRecursive(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dest, entry);
    if (statSync(s).isDirectory()) copyRecursive(s, d);
    else copyFileSync(s, d);
  }
}

for (const svc of SERVICES) {
  const src = join('services', svc, 'src', 'repo', 'migrations');
  const dest = join('dist', 'services', svc, 'src', 'repo', 'migrations');
  if (!existsSync(src)) continue;
  copyRecursive(src, dest);
  console.log(`[copy-migrations] ${src} → ${dest}`);
}
