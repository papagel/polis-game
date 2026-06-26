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

// Dispatch: a truck that has finished one blaze and is rolling home must NOT abandon a
// still-burning lot next door — it should be re-tasked to the nearby fire (it's already on
// the streets, closer than a fresh truck crawling out of the station). Asserts the engine's
// state/target flip, not its appearance.
test('a fire engine rolling home is re-tasked to a nearby blaze instead of abandoning it', async ({ game }) => {
  const res = await game.eval(inPage(`
    resetGrid();
    S.fund.fire = 100;
    const ry = 20;
    hroad(ry, 8, 20);
    set(9, ry+1, 'fire');                          // station feeding the road
    const c = set(12, ry+1, 'res'); c.lv = 2; c.dev = 200;
    recomputeNets(); recomputeFields();
    map[ry+1][12].fire = 30;                        // the blaze
    const covered = fireCovered(12, ry+1);
    svc.length = 0;
    // an engine that just put out a different fire and is rolling home, on the road by the blaze
    const home = [9, ry];
    const v = { svc:'fire', kind:'firetruck', home, tgt:[18, ry],
      field: svcField(svcRoadsAround(home[0], home[1])),
      state:'return', x:13, y:ry, px:13, py:ry, t:0, sp:1.5, lx:undefined, _oid:1 };
    svc.push(v);
    svcScan = 9;                                    // make the next scan actually run
    svcSpawnTick();
    return { covered, state:v.state, tgt:v.tgt, fleet:svc.length };
  `));
  expect(res.covered).toBe(true);
  // the returning engine turned around for the close fire rather than driving home...
  expect(res.state).toBe('go');
  expect(res.tgt.join(',')).toBe('12,21');
  // ...and no extra truck was spawned to do a job the on-scene engine could
  expect(res.fleet).toBe(1);
});

// On-scene chase: when an engine finishes its blaze and the only remaining fire in reach is
// already "owned" by another (distant) engine, the engine standing right next to it should
// still put it out rather than roll home and leave it burning.
test('an on-scene engine grabs an adjacent blaze even if a distant engine nominally owns it', async ({ game }) => {
  const res = await game.eval(inPage(`
    resetGrid();
    S.fund.fire = 100;
    const ry = 20;
    hroad(ry, 0, 20);
    set(9, ry+1, 'fire');
    const c = set(12, ry+1, 'res'); c.lv = 2; c.dev = 200;
    recomputeNets(); recomputeFields();
    map[ry+1][12].fire = 30;
    svc.length = 0;
    // a far engine already targets this blaze but is nowhere near it
    svc.push({ svc:'fire', tgt:[12, ry+1], state:'go', x:0, y:ry, _oid:2 });
    // the on-scene engine that just finished an adjacent fire
    const v = { svc:'fire', kind:'firetruck', home:[9, ry], tgt:[18, ry],
      state:'work', x:13, y:ry, px:13, py:ry, t:0, sp:1.5, lx:undefined, _oid:3 };
    svc.push(v);
    const got = fireRetarget(v);
    return { got, state:v.state, tgt:v.tgt };
  `));
  expect(res.got).toBe(true);
  expect(res.state).toBe('go');
  expect(res.tgt.join(',')).toBe('12,21');
});

// Reachability: a lot can develop without a road directly beside it (hasFrontage allows a road
// within ~2 tiles, e.g. the interior of a road-ringed block). Such a blaze must still be
// dispatchable AND sprayable — otherwise it burns forever. Asserts the engine is sent (finite
// road distance from a station) and that a truck parked on the fronting road extinguishes it.
test('a blaze a tile back from the road is still reachable and gets put out', async ({ game }) => {
  const res = await game.eval(inPage(`
    resetGrid();
    S.speed = 1;                          // spray rate scales with speed; un-pause for this drive
    S.fund.fire = 100;
    const ry = 20;
    hroad(ry, 8, 20);
    set(9, ry+1, 'fire');
    // interior lot two rows back from the road — no road orthogonally adjacent to it
    const c = set(12, ry+2, 'res'); c.lv = 2; c.dev = 200;
    recomputeNets(); recomputeFields();
    map[ry+2][12].fire = 30;

    // dispatch must seed a finite road-distance field (the old svcRoadsAround would be empty)
    const seeds = fireRoadsNear(12, ry+2);
    const field = svcField(seeds);
    const stReachable = svcRoadsAround(9, ry+1).some(([rx,rr]) => field[idx(rx,rr)] !== Infinity);
    const covered = fireCovered(12, ry+2);

    // a truck parked on the fronting road (one tile from the blaze) sprays it down
    svc.length = 0;
    const v = { svc:'fire', kind:'firetruck', home:[9,ry], tgt:[12,ry+2], field,
      state:'work', x:12, y:ry, px:12, py:ry, t:0, sp:1.5, lx:undefined, _oid:1 };
    svc.push(v);
    let sprayedTicks = 0;
    for (let k=0;k<400 && map[ry+2][12].fire>0;k++){ stepSvc(0.05); if (v.spray) sprayedTicks++; }
    return { seeds: seeds.length, stReachable, covered, fireLeft: map[ry+2][12].fire, sprayedTicks };
  `));
  expect(res.covered).toBe(true);
  expect(res.seeds).toBeGreaterThan(0);   // a road within reach was found
  expect(res.stReachable).toBe(true);     // the station can drive to it
  expect(res.sprayedTicks).toBeGreaterThan(0);
  expect(res.fireLeft).toBe(0);           // and the blaze is actually out
});
