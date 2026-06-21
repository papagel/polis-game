import { test, expect } from './harness.js';

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
