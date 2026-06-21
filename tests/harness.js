import { test as base } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The whole game lives in this one file; we load the real thing so every
// global (S, map, computeBudget, simTick, makeSave, EXAMPLE_CITY, ...) exists.
const INDEX = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'index.html'
);

// A `game` fixture: boots index.html headless, pauses the sim so simTick()
// never fires under our assertions, and hands back a tiny page-context API.
export const test = base.extend({
  game: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('file://' + INDEX);
    // speed 0 -> TICK_MS[0] = Infinity -> the accumulator never steps a day.
    await page.evaluate(() => { S.speed = 0; });

    const api = {
      // Run an arbitrary function inside the page (where the globals live).
      eval: (fn, ...args) => page.evaluate(fn, ...args),
      // Drop a known city into global state without the audio/DOM that
      // loadDemo() pulls in.
      loadExample: () =>
        page.evaluate(() => { loadSave(EXAMPLE_CITY); S.started = true; }),
      // Uncaught exceptions seen since page load (should stay empty).
      errors: () => errors,
    };

    await use(api);
  },
});

export { expect } from '@playwright/test';
