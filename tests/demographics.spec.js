import { test, expect } from './harness.js';
import { inPage } from './citybuild.js';

// Phase B: the age curve drives the workforce. S.labor is derived each tick from
// the eased working-age share and clamped to LABOR_BAND, then feeds the demand
// formula and the happiness jobs-balance. That closes a feedback loop
// (jobs -> demand -> opportunity -> work share -> S.labor -> demand), so the
// invariant that matters is: S.labor can NEVER escape its band, no matter how the
// city swings. We assert that over a long seeded run, plus that the age split
// always stays a valid distribution. Invariant-based, so balance tuning stays green.

// Build a served, growing city and tick `days`, sampling the demographic state
// every tick. Returns the extremes so we can assert the bounds held throughout.
const runDemographics = (days) => inPage(`
  const lots = build(true);
  // give it room to actually grow so demand/opportunity swing and exercise the loop
  __seedRng(20260626);
  let laborMin=Infinity, laborMax=-Infinity, shareMin=Infinity, shareMax=-Infinity;
  let sumErr=0, everUndefined=false, partMismatch=false;
  for (let i=0;i<${days};i++){
    simTick();
    if (S.labor==null){ everUndefined=true; continue; }
    laborMin=Math.min(laborMin,S.labor); laborMax=Math.max(laborMax,S.labor);
    const shares=[S.ageChild,S.ageWork,S.ageSenior];
    for (const s of shares){ shareMin=Math.min(shareMin,s); shareMax=Math.max(shareMax,s); }
    sumErr=Math.max(sumErr, Math.abs(shares[0]+shares[1]+shares[2]-1));
    // the age bins must always partition the population exactly (work absorbs rounding)
    const a=ageBreakdown(S.pop);
    if (a.child+a.work+a.senior !== S.pop) partMismatch=true;
  }
  __unseedRng();
  return { laborMin, laborMax, shareMin, shareMax, sumErr, everUndefined, partMismatch, pop:S.pop, labor:S.labor };
`);

test('S.labor stays inside LABOR_BAND across a long run', async ({ game }) => {
  const r = await game.eval(runDemographics(600));
  expect(r.everUndefined).toBe(false);         // defined from the first tick onward
  expect(r.laborMin).toBeGreaterThanOrEqual(0.42 - 1e-9);
  expect(r.laborMax).toBeLessThanOrEqual(0.58 + 1e-9);
  expect(r.pop).toBeGreaterThan(0);            // a real city grew, so the loop was actually exercised
});

test('the age split is always a valid distribution', async ({ game }) => {
  const r = await game.eval(runDemographics(600));
  expect(r.sumErr).toBeLessThan(1e-6);         // child + work + senior renormalize to 1 every tick
  expect(r.shareMin).toBeGreaterThan(0);       // no degenerate empty bin
  expect(r.shareMax).toBeLessThan(1);
  expect(r.partMismatch).toBe(false);          // headcounts partition S.pop exactly
});
