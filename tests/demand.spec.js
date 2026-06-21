import { test, expect } from './harness.js';
import { inPage } from './citybuild.js';

// Demand is recomputed each tick from the jobs<->pop<->commerce<->industry
// balance (S.demand.{r,c,i}). We assert *direction*, not magnitude: a city full
// of homes wants jobs; a city full of jobs wants residents. Durable against
// balance tuning, and catches a sign error in the demand formulas.

// Lays a served block, fills it with `type` lots forced to level 3 so the city
// has real population/jobs, ticks a few days, and returns the settled demand.
const demandFor = (type) => inPage(`
  resetGrid();
  hroad(20, 8, 20);
  set(8, 21, 'power');
  set(9, 21, 'pump');
  const lots = [];
  for (let x=10; x<=18; x++){ const c = set(x, 19, '${type}'); c.lv = 3; c.dev = 300; lots.push([x,19]); }
  recomputeNets();
  recomputeFields();
  __seedRng(42);
  for (let i=0;i<5;i++) simTick();
  __unseedRng();
  return { r: S.demand.r, c: S.demand.c, i: S.demand.i, pop: S.pop, jobs: S.jobs };
`);

test('a residents-only city demands jobs (commerce & industry up)', async ({ game }) => {
  const d = await game.eval(demandFor('res'));
  expect(d.pop).toBeGreaterThan(0);
  expect(d.jobs).toBe(0);
  expect(d.c).toBeGreaterThan(0);   // homes with no shops -> commercial demand
  expect(d.i).toBeGreaterThan(0);   // homes with no industry -> industrial demand
});

test('a jobs-only city demands residents', async ({ game }) => {
  const d = await game.eval(demandFor('com'));
  expect(d.jobs).toBeGreaterThan(0);
  expect(d.r).toBeGreaterThan(0);   // jobs with no homes -> residential demand
});

test('residential demand flips sign between the two cities', async ({ game }) => {
  const homes = await game.eval(demandFor('res'));
  const jobs = await game.eval(demandFor('com'));
  // residents are wanted far more where the jobs are than where the homes are.
  expect(jobs.r).toBeGreaterThan(homes.r);
});
