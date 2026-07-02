import { test, expect } from './harness.js';
import { inPage } from './citybuild.js';

// Milestones: population thresholds pay a one-off reward (scaled by difficulty grant)
// and unlock prestige buildings. Assert the money actually lands, ranks can't be
// skipped-then-recounted, and a locked tool really refuses to place.

test('crossing a population threshold pays the reward and advances the rank', async ({ game }) => {
  const r = await game.eval(inPage(`
    resetGrid(); S.started = true;
    S.milestone = 0; S.diff = 1; S.money = 1000;
    S.pop = MILESTONES[1].pop + 10;          // just past the first threshold
    checkMilestones();
    const oneStep = { ms: S.milestone, money: S.money };
    // a boomtown that blows past SEVERAL thresholds in one tick banks each reward
    S.milestone = 0; S.money = 1000;
    S.pop = MILESTONES[3].pop + 10;
    checkMilestones();
    return { oneStep, multi: { ms: S.milestone, money: S.money },
             expected1: 1000 + Math.round((MILESTONES[1].reward||0) * DIFF[1].grant),
             expected3: 1000 + [1,2,3].reduce((s,i)=>s+Math.round((MILESTONES[i].reward||0)*DIFF[1].grant), 0) };
  `));
  expect(r.oneStep.ms).toBe(1);
  expect(r.oneStep.money).toBe(r.expected1);
  expect(r.multi.ms).toBe(3);
  expect(r.multi.money).toBe(r.expected3);   // every skipped rank still pays
});

test('population shrinking back below a threshold never demotes the rank', async ({ game }) => {
  const r = await game.eval(inPage(`
    resetGrid(); S.started = true;
    S.milestone = 0; S.pop = MILESTONES[2].pop + 5; checkMilestones();
    const up = S.milestone;
    S.pop = 10; checkMilestones();
    return { up, after: S.milestone };
  `));
  expect(r.up).toBe(2);
  expect(r.after).toBe(2);   // ranks are earned, not revoked
});

test('a milestone-locked landmark refuses to place until its rank is reached', async ({ game }) => {
  const r = await game.eval(inPage(`
    resetGrid(); S.started = true; S.money = 1e6;
    const lockAt = TOOLDEF.cityhall.lockAt;
    S.tool = 'cityhall';
    S.milestone = lockAt - 1;
    const denied = place(20, 20, true);
    const stillGrass = map[20][20].t === 'grass';
    S.milestone = lockAt;
    const allowed = place(20, 20, true);
    return { lockAt, denied, stillGrass, allowed, t: map[20][20].t };
  `));
  expect(r.lockAt).toBeGreaterThan(0);
  expect(r.denied).toBe(false);      // locked: placement refused
  expect(r.stillGrass).toBe(true);   // and nothing landed
  expect(r.allowed).toBe(true);      // at rank: it builds
  expect(r.t).toBe('cityhall');
});

test('the milestone rank survives a save round-trip', async ({ game }) => {
  const r = await game.eval(inPage(`
    resetGrid(); S.started = true;
    S.milestone = 4;
    const code = makeSave();
    S.milestone = 0;
    loadSave(code);
    return S.milestone;
  `));
  expect(r).toBe(4);
});
