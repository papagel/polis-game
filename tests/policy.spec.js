import { test, expect } from './harness.js';
import { inPage } from './citybuild.js';

// Ordinances (POLICIES): free toggles with a monthly budget line and field/demand/mood
// effects. These assert the consequences — the budget really moves, the fields really
// change — not just that the toggle flips.

test('a costed ordinance shows up as a negative budget line, tolls as a positive one', async ({ game }) => {
  const r = await game.eval(inPage(`
    resetGrid(); S.started = true;
    S.pop = 10000; S.jobs = 5000; S.policy = {};
    const off = polBudget();
    S.policy = { festival: 1 };                    // §0.05/head running cost, no income
    const fest = polBudget();
    S.policy = { toll: 1 };                        // income 0.05/head − cost 0.012/head
    const toll = polBudget();
    S.policy = {};
    return { off, fest, toll };
  `));
  expect(r.off).toBe(0);
  expect(r.fest).toBeLessThan(0);       // festivals cost money every month
  expect(r.toll).toBeGreaterThan(0);    // tolls net income
});

test('ordinance budget rides into computeBudget and the net identity', async ({ game }) => {
  const r = await game.eval(inPage(`
    resetGrid(); S.started = true;
    S.pop = 8000; S.jobs = 4000;
    S.policy = {};             const b0 = computeBudget();
    S.policy = { festival:1 }; const b1 = computeBudget();
    S.policy = {};
    return { p0: b0.polNet, p1: b1.polNet };
  `));
  expect(r.p0).toBe(0);
  expect(r.p1).toBeLessThan(0);
});

test('Neighborhood Watch really suppresses the crime field', async ({ game }) => {
  const r = await game.eval(inPage(`
    resetGrid();
    hroad(20, 8, 24); set(8, 21, 'power'); set(9, 21, 'pump');
    for (let x=10; x<=22; x++){ const c = set(x, 19, 'res'); c.lv = 4; c.dev = 400; }
    const total = () => { let s=0; for (let i=0;i<crime.length;i++) s+=crime[i]; return s; };
    S.policy = {};            recomputeNets(); recomputeFields(); const base = total();
    S.policy = { watch: 1 };  recomputeFields();                  const watched = total();
    S.policy = {};
    return { base, watched };
  `));
  expect(r.base).toBeGreaterThan(0);            // dense lots breed crime
  expect(r.watched).toBeLessThan(r.base);       // the ordinance genuinely cuts it
  expect(r.watched).toBeGreaterThan(0);         // suppressed, not erased
});

test('Public Festivals lift the mood term the happiness breakdown reports', async ({ game }) => {
  const r = await game.eval(inPage(`
    resetGrid(); S.started = true;
    hroad(20, 10, 16); set(10, 21, 'power'); set(11, 21, 'pump');
    for (let x=12; x<=15; x++){ const c = set(x, 19, 'res'); c.lv = 2; c.dev = 150; }
    recomputeNets(); recomputeFields();
    __seedRng(7);
    S.policy = {};              simTick(); const off = S.happyParts.policy;
    S.policy = { festival: 1 }; simTick(); const on  = S.happyParts.policy;
    __unseedRng(); S.policy = {};
    return { off, on };
  `));
  expect(r.off).toBe(0);
  expect(r.on).toBeGreaterThan(0);   // the +5 mood effect lands in the breakdown
});

test('active ordinances survive a save round-trip', async ({ game }) => {
  const r = await game.eval(inPage(`
    resetGrid(); S.started = true;
    S.policy = { watch: 1, toll: 1 };
    const code = makeSave();
    S.policy = {};
    loadSave(code);
    return { watch: !!S.policy.watch, toll: !!S.policy.toll, curfew: !!S.policy.curfew };
  `));
  expect(r.watch).toBe(true);
  expect(r.toll).toBe(true);
  expect(r.curfew).toBe(false);
});
