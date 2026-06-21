import { test, expect } from './harness.js';
import { inPage } from './citybuild.js';

// Power and water are flood-filled along the road grid (recomputePower /
// recomputeWater). These tests check the backbone directly: utilities reach a
// distant lot only through a connected road chain, a cut severs them, and an
// over-subscribed plant browns out rather than exceeding capacity.

test('power reaches a distant lot through the road chain, and a cut severs it', async ({ game }) => {
  // Plant at the far-left; the test lot sits >5 tiles away (beyond the plant's
  // direct radius) so it can only be powered via the road conduction chain.
  const res = await game.eval(inPage(`
    resetGrid();
    hroad(20, 5, 35);
    set(5, 21, 'power');
    const lot = set(35, 19, 'res');   // 30+ tiles from the plant
    recomputeNets();
    const reached = map[19][35].pw;
    set(20, 20, 'grass');             // cut the road mid-chain
    recomputeNets();
    const afterCut = map[19][35].pw;
    return { reached, afterCut };
  `));
  expect(res.reached).toBe(true);
  expect(res.afterCut).toBe(false);
});

test('water reaches a distant lot through the road chain', async ({ game }) => {
  const res = await game.eval(inPage(`
    resetGrid();
    hroad(20, 5, 35);
    set(5, 21, 'pump');
    set(35, 19, 'res');
    recomputeNets();
    return { wt: map[19][35].wt };
  `));
  expect(res.wt).toBe(true);
});

test('an over-subscribed plant browns out instead of exceeding capacity', async ({ game }) => {
  // A tiny solar plant (cap 120) against lots whose combined demand exceeds it:
  // powerNeed for a level-4 lot is 30, so 8 of them need 240 > 120.
  const res = await game.eval(inPage(`
    resetGrid();
    hroad(20, 4, 16);
    set(4, 21, 'solar');
    const lots = [];
    for (let x=6; x<=13; x++){ const c = set(x, 19, 'res'); c.lv = 4; c.dev = 400; lots.push([x,19]); }
    recomputeNets();
    return {
      cap: S.powerCap,
      use: S.powerUse,
      poweredCount: lots.filter(([x,y]) => map[y][x].pw).length,
      total: lots.length,
    };
  `));
  expect(res.cap).toBe(120);
  expect(res.use).toBeLessThanOrEqual(res.cap);   // never draw more than the plant makes
  expect(res.poweredCount).toBeLessThan(res.total); // some lots are browned out
  expect(res.poweredCount).toBeGreaterThan(0);      // but the near grid stays lit
});
