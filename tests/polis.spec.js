import { test, expect } from './harness.js';
import { inPage } from './citybuild.js';

// Phase 1: deterministic, invariant-based tests. They assert *relationships*
// (round-trips, monotonicity, accounting identities, finiteness) rather than
// golden numbers, so legitimate balance tuning won't break them.

test('save format round-trips (TYPE_IDS / payload stability)', async ({ game }) => {
  await game.loadExample();
  // EXAMPLE_CITY is an older TLV3 string; makeSave() emits the current TLV5.
  // The durable invariant is idempotence of the current format: any silent
  // serialization drift (e.g. a reordered TYPE_IDS) makes the two diverge.
  const [a, b] = await game.eval(() => {
    const first = makeSave();
    loadSave(first);
    return [first, makeSave()];
  });
  expect(a.startsWith('TLV5.')).toBe(true);
  expect(b).toBe(a);
});

test('save round-trips a tower + stacked road overlays (bitmask payload)', async ({ game }) => {
  // EXAMPLE_CITY doesn't exercise the fragile parts of the save format: the
  // grp/part tower markers and the 4th-value overlay bitmask. Build a city that
  // does, then assert the format is idempotent AND the structure actually
  // survives the load (so stability can't be vacuous data-dropping).
  const res = await game.eval(inPage(`
    resetGrid();
    hroad(20, 8, 16);
    // a hand-built 2x2 residential tower (root + three part cells)
    const bx=10, by=18, root=set(bx,by,'res');
    root.grp=[bx,by]; root.part=false; root.lv=4; root.dev=400; root.fw=2; root.fh=2;
    for (const [x,y] of [[bx+1,by],[bx,by+1],[bx+1,by+1]]){
      const c=set(x,y,'res'); c.grp=[bx,by]; c.part=true;
    }
    // stacked overlays on distinct road tiles
    map[20][9].bus=true;
    map[20][11].rail=true;
    map[20][13].bridge=true;
    map[20][15].tunnel=true;
    const s1=makeSave();
    loadSave(s1);
    const s2=makeSave();
    return {
      s1, s2,
      part: map[18][11].part,            // a tower part cell rebuilt
      grouped: !!map[18][11].grp,
      bus: map[20][9].bus,
      rail: map[20][11].rail,
      bridge: map[20][13].bridge,
      tunnel: map[20][15].tunnel,
    };
  `));
  expect(res.s2).toBe(res.s1);           // idempotent: no serialization drift
  expect(res.grouped).toBe(true);        // the 2x2 tower came back
  expect(res.part).toBe(true);
  expect(res.bus).toBe(true);            // each overlay bit survived
  expect(res.rail).toBe(true);
  expect(res.bridge).toBe(true);
  expect(res.tunnel).toBe(true);
});

test('budget accounting identity holds', async ({ game }) => {
  await game.loadExample();
  const ok = await game.eval(() => {
    const B = computeBudget();
    const loanPay = S.loan ? S.loan.pay : 0;
    const net = B.income - B.roadCost - B.svcCost - B.emitCost + B.polNet - loanPay;
    projectBudget();
    return Math.abs(net - S.net) < 1e-6;
  });
  expect(ok).toBe(true);
});

test('difficulty is monotonic: harder => less income, more upkeep', async ({ game }) => {
  await game.loadExample();
  // indices 0..3 = Easy, Normal, Hard, Very hard. 4 (Kobayashi Maru) is
  // time-ramped and excluded here.
  const rows = await game.eval(() => [0, 1, 2, 3].map((d) => {
    S.diff = d;
    const B = computeBudget();
    return { inc: B.income, up: B.roadCost + B.svcCost };
  }));
  for (let i = 1; i < rows.length; i++) {
    expect(rows[i].inc).toBeLessThanOrEqual(rows[i - 1].inc);
    expect(rows[i].up).toBeGreaterThanOrEqual(rows[i - 1].up);
  }
});

test('Kobayashi Maru ramp escalates over time', async ({ game }) => {
  await game.loadExample();
  const rows = await game.eval(() => {
    S.diff = 4; S.kmCheat = false;
    return [0, 365, 1825].map((day) => { S.day = day; return kmRamp(); });
  });
  for (let i = 1; i < rows.length; i++) {
    expect(rows[i].up).toBeGreaterThan(rows[i - 1].up);        // upkeep compounds
    expect(rows[i].inc).toBeLessThanOrEqual(rows[i - 1].inc);  // revenue bleeds to a floor
    expect(rows[i].dis).toBeGreaterThan(rows[i - 1].dis);      // disasters intensify
  }
});

test('stability: 10 years of ticks produce no NaN/Infinity or thrown errors', async ({ game }) => {
  await game.loadExample();
  const stats = await game.eval(() => {
    S.diff = 1;
    for (let i = 0; i < 3650; i++) simTick();
    const { money, pop, jobs, happy } = S;
    return { money, pop, jobs, happy };
  });
  for (const v of Object.values(stats)) expect(Number.isFinite(v)).toBe(true);
  expect(stats.pop).toBeGreaterThanOrEqual(0);
  expect(stats.happy).toBeGreaterThanOrEqual(0);
  expect(game.errors()).toEqual([]);
});
