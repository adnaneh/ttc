#!/usr/bin/env node
/*
  Watches the compiled shared package and syncs it into apps/functions/lib/_shared
  so that the emulator sees file changes inside the functions directory and reloads.

  Runs alongside:
    - npm -w packages/shared run dev   (builds shared to packages/shared/lib)
    - npm run dev                      (builds functions to apps/functions/lib)
*/

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

function log(...args) { console.log('[watch-shared]', ...args); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const functionsDir = path.resolve(__dirname, '..');
const destDir = path.resolve(functionsDir, 'lib/_shared');
const srcDir = path.resolve(functionsDir, '../../packages/shared/lib');

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true }).catch(() => {});
}

async function copyRecursive(src, dest) {
  // Use fs.cp when available (Node >=16.7)
  if (typeof fsp.cp === 'function') {
    await fsp.cp(src, dest, { recursive: true, force: true });
    return;
  }
  // Fallback: simple manual copy (files only)
  const entries = await fsp.readdir(src, { withFileTypes: true });
  await ensureDir(dest);
  for (const e of entries) {
    const sp = path.join(src, e.name);
    const dp = path.join(dest, e.name);
    if (e.isDirectory()) {
      await copyRecursive(sp, dp);
    } else if (e.isFile()) {
      await fsp.copyFile(sp, dp);
    }
  }
}

async function syncOnce() {
  await ensureDir(destDir);
  await copyRecursive(srcDir, destDir);
  // Touch a stamp file to ensure the emulator notices a change
  const stamp = path.join(destDir, '.stamp');
  await fsp.writeFile(stamp, String(Date.now())).catch(() => {});
}

async function waitForSource() {
  for (;;) {
    try {
      const s = await fsp.stat(srcDir);
      if (s.isDirectory()) return;
    } catch {}
    log('waiting for shared build at', srcDir);
    await sleep(1000);
  }
}

async function main() {
  await waitForSource();
  await syncOnce();

  // Prefer fs.watch recursive when available (macOS/Windows). If not, poll.
  const supportsRecursive = process.platform !== 'linux';
  if (supportsRecursive) {
    let timer = null;
    fs.watch(srcDir, { recursive: true }, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        syncOnce().catch(e => log('sync error', e.message));
      }, 100);
    });
    log('watching (recursive) for changes in', srcDir);
  } else {
    // Linux fallback: shallow watch + periodic resync
    setInterval(() => {
      syncOnce().catch(() => {});
    }, 1000);
    log('watching (interval) for changes in', srcDir);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
