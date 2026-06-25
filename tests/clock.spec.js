import { test, expect } from './harness.js';
import { inPage } from './citybuild.js';

// The fix for the "everything's on a different tickrate" feel: agents AND disasters
// scale off the day-clock (speedMul), not the raw integer speed index, so the link
// between "how fast things move" and "how fast a game-day passes" is IDENTICAL at
// every speed. The load-bearing invariant: a vehicle covers the SAME ground per
// game-day at every speed — so a fire (counted down in game-days) is equally
// fightable at relaxed or fast-forward. Before the fix this held for speeds 1→2 but
// broke at speed 3, where the sim sped up 2.15x while agents only sped up 1.5x.
// If anyone reverts agents to the integer S.speed, or unbalances TICK_MS, the ratio
// below diverges and this fails.

test('agent reach per game-day is constant across all speeds', async ({ game }) => {
  const res = await game.eval(() => {
    const rows = [];
    for (let s = 1; s < TICK_MS.length; s++) {
      S.speed = s;
      // speedMul() is the agent's advance rate per real second (dt sums to 1s);
      // 1000/TICK_MS[s] is game-days per real second. Their ratio is tiles/game-day.
      const tilesPerDay = speedMul() * TICK_MS[s] / 1000;
      rows.push({ s, speedMul: speedMul(), tickMs: TICK_MS[s], tilesPerDay });
    }
    S.speed = 0;
    return { rows, pausedMul: speedMul() };
  });

  expect(res.pausedMul).toBe(0);                       // paused → no motion at all
  expect(res.rows.length).toBeGreaterThan(1);

  const ref = res.rows[0].tilesPerDay;
  for (const r of res.rows) {
    expect(r.speedMul).toBeGreaterThan(0);             // every play speed actually moves
    expect(Math.abs(r.tilesPerDay - ref)).toBeLessThan(1e-9);   // …and covers identical ground per game-day
  }
});

// A disaster is seeded off the game-clock (disClk), not wall-time, and its sub-timers
// are all elapsed-relative — so it advances in game-days and freezes when paused.
// Asserting the consequence: stepping by a game-clock delta runs the disaster, and a
// delta past its duration ends it (hands control back), with no wall-clock dependency.
test('a disaster runs and ends on the game-clock', async ({ game }) => {
  const res = await game.eval(inPage(`
    resetGrid();
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) { const c = set(x, y, 'res'); c.lv = 1; c.dev = 200; }
    S.started = true;
    triggerDisaster('monster');
    const t0 = DIS.t0, dur = DIS.dur;
    stepDisaster(t0 + dur * 0.5);          // halfway, in game-clock units
    const mid = { running: !!DIS, bld: DIS && DIS.stats.bld };
    stepDisaster(t0 + dur + 200);          // past the end
    return { t0, dur, mid, cleared: DIS === null };
  `));

  expect(res.dur).toBeGreaterThan(0);
  expect(res.mid.running).toBe(true);
  expect(res.mid.bld).toBeGreaterThan(0);   // it flattened buildings as it advanced
  expect(res.cleared).toBe(true);           // and released control once its game-time elapsed
});
