import { test, expect } from './harness.js';
import { inPage } from './citybuild.js';

// Fire spread is weighted by the NEIGHBOUR's flammability (its FIRE_RISK), so an
// industrial block catches far faster than a home, while a residential one crawls.
// Asserts the consequence on the exact function the sim rolls against
// (fireSpreadChance), including that non-lots can never catch.
test('fire spread chance scales with the neighbour zone type', async ({ game }) => {
  const res = await game.eval(inPage(`
    resetGrid();
    const mk=(t)=>{ const c=set(0,0,t); c.lv=2; c.dev=200; c.fire=0; return fireSpreadChance(c); };
    const r=mk('res'), c=mk('com'), i=mk('ind');
    // a road, an undeveloped lot, an already-burning lot, and a null all cannot catch
    const road=fireSpreadChance(set(0,0,'road'));
    const empty=(()=>{ const e=set(0,0,'res'); e.lv=0; return fireSpreadChance(e); })();
    const lit=(()=>{ const e=set(0,0,'ind'); e.lv=3; e.fire=10; return fireSpreadChance(e); })();
    const nul=fireSpreadChance(null);
    return { r, c, i, road, empty, lit, nul, spread:FIRE_SPREAD, ratioIR:i/r, ratioCR:c/r };
  `));

  // commercial is the baseline; residential crawls, industrial races
  expect(res.c).toBeCloseTo(res.spread, 10);
  expect(res.r).toBeLessThan(res.c);
  expect(res.i).toBeGreaterThan(res.c);
  // ratios mirror FIRE_RISK (res : com : ind = 1 : 2 : 4.875)
  expect(res.ratioCR).toBeCloseTo(2, 6);
  expect(res.ratioIR).toBeCloseTo(4.875, 6);
  // things that must never catch fire from a neighbour
  expect(res.road).toBe(0);
  expect(res.empty).toBe(0);
  expect(res.lit).toBe(0);
  expect(res.nul).toBe(0);
});
