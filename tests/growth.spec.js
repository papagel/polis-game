import { test, expect } from './harness.js';
import { inPage } from './citybuild.js';

// Phase 2: growth-gating tests. These exercise the heart of the sim — a zoned
// lot only densifies when road + power + water + demand all line up — and rely
// on the seedable RNG (__seedRng) so the probabilistic growth rolls are
// reproducible. In normal play the RNG is Math.random, so this seam is test-only.

test('a fully-served residential lot densifies', async ({ game }) => {
  const maxLv = await game.eval(inPage(`
    const lots = build(true);
    __seedRng(20260621);
    for (let i=0;i<400;i++) simTick();
    __unseedRng();
    return Math.max(...lots.map(([x,y]) => map[y][x].lv));
  `));
  expect(maxLv).toBeGreaterThanOrEqual(1);
});

test('an unpowered residential lot never densifies (hard gate)', async ({ game }) => {
  const maxLv = await game.eval(inPage(`
    const lots = build(false);
    if (lots.some(([x,y]) => map[y][x].pw)) throw new Error('test setup: lots unexpectedly powered');
    __seedRng(20260621);
    for (let i=0;i<400;i++) simTick();
    __unseedRng();
    return Math.max(...lots.map(([x,y]) => map[y][x].lv));
  `));
  expect(maxLv).toBe(0);
});

test('the seeded sim is deterministic (same seed => identical outcome)', async ({ game }) => {
  const run = () => game.eval(inPage(`
    const lots = build(true);
    __seedRng(777);
    for (let i=0;i<300;i++) simTick();
    __unseedRng();
    return { pop: S.pop, dev: lots.reduce((s,[x,y]) => s + map[y][x].dev, 0) };
  `));
  const a = await run();
  const b = await run();
  expect(b).toEqual(a);
  // a non-trivial city actually grew, so the determinism check has teeth
  expect(a.pop).toBeGreaterThan(0);
});
