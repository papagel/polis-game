import { test, expect } from './harness.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Accessibility + offline-shell wiring. These assert the consequence (focus
// really moves, the SW really caches the shell), not just attribute presence.

const MODALS = ['demoModal','aboutModal','disModal','setSheet','renameModal','confirmModal','scenModal',
                'saveModal','helpModal','mapModal','statsModal','catModal','advModal','budgetModal'];

test('every modal exposes dialog semantics with an accessible name', async ({ game }) => {
  const res = await game.eval((ids) => ids.map(id => {
    const wrap = document.getElementById(id);
    const dlg = wrap && (wrap.querySelector('.modal, .inner') || wrap);
    const lbl = dlg && dlg.getAttribute('aria-labelledby');
    return {
      id,
      role: dlg ? dlg.getAttribute('role') : null,
      modal: dlg ? dlg.getAttribute('aria-modal') : null,
      labelled: !!(lbl && document.getElementById(lbl) && document.getElementById(lbl).textContent !== undefined),
    };
  }), MODALS);
  for (const m of res) {
    expect(m.role, m.id).toBe('dialog');
    expect(m.modal, m.id).toBe('true');
    expect(m.labelled, m.id).toBe(true);
  }
});

test('icon-only buttons have accessible names', async ({ game }) => {
  const res = await game.eval(() => {
    const named = (el) => !!(el.getAttribute('aria-label') || el.textContent.trim());
    const iconBtns = ['spdTgl','statXp','statsBtn','advBtn','catBtn','sndBtn','moreBtn','undoBtn','redoBtn','zin','zout','rotL','viewsBtn'];
    return {
      unnamed: iconBtns.filter(id => { const el = document.getElementById(id); return el && !named(el); }),
      unnamedX: [...document.querySelectorAll('.modalX')].filter(el => !el.getAttribute('aria-label')).length,
      canvasFallback: document.getElementById('c').textContent.trim().length > 0,
    };
  });
  expect(res.unnamed).toEqual([]);
  expect(res.unnamedX).toBe(0);
  expect(res.canvasFallback).toBe(true);
});

test('opening a modal moves focus into it; closing restores it', async ({ game }) => {
  const res = await game.eval(() => new Promise(resolve => {
    const btn = document.getElementById('moreBtn');
    btn.focus();
    const modal = document.getElementById('helpModal');
    modal.classList.add('open');
    setTimeout(() => {
      const insideAfterOpen = modal.contains(document.activeElement);
      modal.classList.remove('open');
      setTimeout(() => {
        resolve({ insideAfterOpen, restored: document.activeElement === btn });
      }, 30);
    }, 30);
  }));
  expect(res.insideAfterOpen).toBe(true);
  expect(res.restored).toBe(true);
});

test('clickable stat chips are keyboard-operable buttons', async ({ game }) => {
  const res = await game.eval(() => {
    const funds = document.getElementById('funds');
    const before = document.getElementById('budget').classList.contains('open');
    funds.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const after = document.getElementById('budget').classList.contains('open');
    return { role: funds.getAttribute('role'), tab: funds.tabIndex, toggled: before !== after };
  });
  expect(res.role).toBe('button');
  expect(res.tab).toBe(0);
  expect(res.toggled).toBe(true);
});

test('file:// keeps working — the SW guard skips registration without throwing', async ({ game }) => {
  expect(await game.eval(() => typeof S === 'object' && typeof simTick === 'function')).toBe(true);
  expect(game.errors()).toEqual([]);
});

// ---- offline shell: over real http, the SW must register and cache index.html ----
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };

test('service worker registers on http and caches the shell for offline boot', async ({ page }) => {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    try {
      const body = fs.readFileSync(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  try {
    await page.goto(`http://127.0.0.1:${port}/index.html`);
    const state = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;           // resolves only once a SW is active
      // wait for the install-time shell pre-cache to land
      for (let i = 0; i < 100; i++) {
        const c = await caches.open('polis-v1');
        if (await c.match('./index.html')) break;
        await new Promise(r => setTimeout(r, 50));
      }
      const c = await caches.open('polis-v1');
      return { active: !!reg.active, shellCached: !!(await c.match('./index.html')) };
    });
    expect(state.active).toBe(true);
    expect(state.shellCached).toBe(true);
  } finally {
    server.close();
  }
});
