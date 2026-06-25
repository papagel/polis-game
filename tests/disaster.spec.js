import { test, expect } from './harness.js';
import { inPage } from './citybuild.js';

// The two scripted disasters (kaiju + UFO) are wired across trigger/step like the
// natural ones. We assert the *consequence* — buildings actually fall — rather
// than the animation, and that the disaster releases control when it's done.
// A city carpeted in res guarantees the random path / beam targets hit something.
const fillCity = `
  resetGrid();
  for (let y=0;y<G;y++) for (let x=0;x<G;x++){ const c=set(x,y,'res'); c.lv=1; c.dev=200; }
  S.started = true;
`;

test('the Gozilla crushes buildings along its path', async ({ game }) => {
  const res = await game.eval(inPage(`
    ${fillCity}
    const ok = triggerDisaster('monster');
    const type = DIS && DIS.type, t0 = DIS.t0, dur = DIS.dur, plen = DIS.path.length;
    stepDisaster(t0 + dur*0.55);                 // walk it halfway across town
    const mid = { bld: DIS && DIS.stats.bld, prog: DIS && DIS.prog };
    stepDisaster(t0 + dur + 200);                // let it lumber off
    return { ok, type, plen, mid, cleared: DIS===null };
  `));
  expect(res.ok).toBe(true);
  expect(res.type).toBe('monster');
  expect(res.plen).toBeGreaterThan(1);          // it has a path to walk
  expect(res.mid.prog).toBeGreaterThan(0);      // it advanced along it
  expect(res.mid.bld).toBeGreaterThan(0);       // and flattened real structures
  expect(res.cleared).toBe(true);               // disaster ends and hands back control
});

test('the UFO vaporises buildings with its beams', async ({ game }) => {
  const res = await game.eval(inPage(`
    ${fillCity}
    const ok = triggerDisaster('ufo');
    const type = DIS && DIS.type, t0 = DIS.t0, dur = DIS.dur;
    let sawBeam = false;
    for (let t=60; t < dur*0.7; t += 140){       // step like real play so beams charge & strike
      stepDisaster(t0 + t);
      if (DIS && DIS.beams.length) sawBeam = true;
    }
    const bld = DIS && DIS.stats.bld;
    stepDisaster(t0 + dur + 200);
    return { ok, type, sawBeam, bld, cleared: DIS===null };
  `));
  expect(res.ok).toBe(true);
  expect(res.type).toBe('ufo');
  expect(res.sawBeam).toBe(true);               // it actually emitted beams
  expect(res.bld).toBeGreaterThan(0);           // which destroyed buildings on impact
  expect(res.cleared).toBe(true);
});

test('the dragon strafes fire from the air', async ({ game }) => {
  const res = await game.eval(inPage(`
    ${fillCity}
    const ok = triggerDisaster('dragon');
    const type = DIS && DIS.type, t0 = DIS.t0, dur = DIS.dur;
    let sawBreath = false, moved = false;
    const x0 = DIS.x, y0 = DIS.y;
    for (let t=60; t < dur*0.7; t += 140){         // step like real play so it flies & breathes
      stepDisaster(t0 + t);
      if (DIS && DIS.breaths.length) sawBreath = true;
      if (DIS && (DIS.x!==x0 || DIS.y!==y0)) moved = true;
    }
    const fires = DIS && DIS.stats.fires;
    stepDisaster(t0 + dur + 200);
    return { ok, type, sawBreath, moved, fires, cleared: DIS===null };
  `));
  expect(res.ok).toBe(true);
  expect(res.type).toBe('dragon');
  expect(res.moved).toBe(true);                   // it flies across the city
  expect(res.sawBreath).toBe(true);               // it emits fire breaths
  expect(res.fires).toBeGreaterThan(0);           // which set buildings ablaze
  expect(res.cleared).toBe(true);
});

test('only one disaster runs at a time', async ({ game }) => {
  const res = await game.eval(inPage(`
    ${fillCity}
    const first = triggerDisaster('monster');
    const second = triggerDisaster('ufo');       // should be refused while one is active
    return { first, second, type: DIS && DIS.type };
  `));
  expect(res.first).toBe(true);
  expect(res.second).toBe(false);
  expect(res.type).toBe('monster');
});
