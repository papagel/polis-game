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

test('rail and ground paving stack either way (elevated track over road, road under track)', async ({ game }) => {
  // Elevated rail rides on pylons, so ground-level paving must coexist with it
  // regardless of placement order. The old asymmetry let you lay rail over a
  // road but refused a road under existing rail (buildClear vetoed c.rail).
  const res = await game.eval(inPage(`
    resetGrid();
    S.money = 1e6;
    // (a) rail laid over existing ground tiles it should span: a road and a park
    set(5, 5, 'road'); set(8, 8, 'park');
    S.tool = 'rail'; place(5, 5, true); place(8, 8, true);
    // (b) the mirror — those tiles laid back under existing rail (on open ground)
    const under = {};
    for (const [x, t] of [[7,'road'],[9,'park'],[11,'garden'],[13,'path'],[15,'pool']]){
      map[20][x].rail = true;            // rail sitting on open ground at (x, 20)
      S.tool = t; place(x, 20, true);
      under[t] = { rail: map[20][x].rail, t: map[20][x].t };
    }
    return {
      railOverRoad: { rail: map[5][5].rail, t: map[5][5].t },
      railOverPark: { rail: map[8][8].rail, t: map[8][8].t },
      under,
    };
  `));
  expect(res.railOverRoad).toEqual({ rail: true, t: 'road' });
  expect(res.railOverPark).toEqual({ rail: true, t: 'park' });
  // every spannable ground tile lays back under existing rail, keeping the track
  expect(res.under.road).toEqual({ rail: true, t: 'road' });
  expect(res.under.park).toEqual({ rail: true, t: 'park' });
  expect(res.under.garden).toEqual({ rail: true, t: 'garden' });
  expect(res.under.path).toEqual({ rail: true, t: 'path' });
  expect(res.under.pool).toEqual({ rail: true, t: 'pool' });
});

test('budget accounting identity holds', async ({ game }) => {
  await game.loadExample();
  const ok = await game.eval(() => {
    const B = computeBudget();
    const loanPay = S.loan ? S.loan.pay : 0;
    const net = B.income - B.roadCost - B.svcCost - B.emitCost - B.adminCost + B.polNet + B.tradeNet - loanPay;
    projectBudget();
    return Math.abs(net - S.net) < 1e-6;
  });
  expect(ok).toBe(true);
});

test('civic overhead supplies the late-game negative feedback', async ({ game }) => {
  await game.loadExample();
  // the runaway came from income being linear in pop while upkeep is flat per
  // footprint. assert the admin term (a) is zero for a town under the free
  // threshold, and (b) grows with population above it — the missing brake.
  const r = await game.eval(() => {
    const at = (pop) => { S.pop = pop; return computeBudget().adminCost; };
    return { town: at(ADMIN_FREE - 500), small: at(ADMIN_FREE + 1000), big: at(ADMIN_FREE + 50000) };
  });
  expect(r.town).toBe(0);                 // a town is governed "for free"
  expect(r.small).toBeGreaterThan(0);     // it switches on past the threshold
  expect(r.big).toBeGreaterThan(r.small * 10);  // and scales with city size
});

test('road maintenance scales with traffic, not headcount (wear brake)', async ({ game }) => {
  await game.loadExample();
  // part of the size brake now rides on USAGE: a congested network costs more to
  // maintain. assert an idle road carries no surcharge and saturating it raises the
  // road line — so the cost is actionable (transit/layout) rather than a flat tax.
  const r = await game.eval(inPage(`
    resetGrid();
    hroad(10, 10, 17);                                              // road at y=10, x=10..17
    for (let i=0;i<traffic.length;i++) traffic[i]=0;
    const idle = computeBudget();
    for (let x=10;x<=17;x++) traffic[idx(x,10)] = roadCapAt(x,10);  // saturate the tiles
    const busy = computeBudget();
    return { idleWear: idle.wearCost, busyWear: busy.wearCost,
             idleRoad: idle.roadCost, busyRoad: busy.roadCost };
  `));
  expect(r.idleWear).toBeCloseTo(0, 5);            // empty roads: no wear surcharge
  expect(r.busyWear).toBeGreaterThan(0);           // congestion costs money to maintain
  expect(r.busyRoad).toBeGreaterThan(r.idleRoad);  // and it lands in the road line
});

test('service upkeep scales with the population it must cover (load brake)', async ({ game }) => {
  await game.loadExample();
  // the sibling brake: each service covers a bigger caseload as the city grows, so the
  // load multiplier is 1 for a town and rises monotonically with population.
  const r = await game.eval(() => {
    const at = (pop) => { S.pop = pop; return computeBudget().svcLoad; };
    return { town: at(ADMIN_FREE - 100), small: at(ADMIN_FREE + 5000), big: at(ADMIN_FREE + 100000) };
  });
  expect(r.town).toBeCloseTo(1, 6);          // a town adds no caseload surcharge
  expect(r.small).toBeGreaterThan(1);        // it grows past the free floor
  expect(r.big).toBeGreaterThan(r.small);    // and keeps scaling with size
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

test('happiness breakdown is an accounting identity (parts sum to the score)', async ({ game }) => {
  await game.loadExample();
  // The HUD tooltip claims to break the happiness score into named parts. That's
  // only honest if those parts actually sum (clamped 0..100) to the total — so a
  // factor that's tuned but forgotten in either the sum or the tooltip is caught.
  // happyF eases toward the clamped sum each tick, so run to steady state first.
  const res = await game.eval(() => {
    S.diff = 1;
    for (let i = 0; i < 3650; i++) simTick();
    const h = S.happyParts;
    const sum = Object.values(h).reduce((a, v) => a + v, 0);
    return { clamped: Math.max(0, Math.min(100, sum)), happy: S.happy, edu: h.edu, eduStock: S.edu };
  });
  expect(Math.abs(res.clamped - res.happy)).toBeLessThanOrEqual(1.5);   // smoothing residual only
  // education is wired in with the intended sign: a schooled city lifts mood, a neglected one sags
  expect(Math.abs(res.edu - (res.eduStock - 0.5) * 12)).toBeLessThan(1e-6);
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
