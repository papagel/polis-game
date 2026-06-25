import { test, expect } from './harness.js';
import { inPage } from './citybuild.js';

// Background: avenues are the widest road (cap 120 vs a road's 40) and the
// network has no tier above them. A dense, fully built-out city therefore
// generates more trips than even all-avenues can carry, so the gridlock nag
// used to (a) fire forever in any large city (flat ">6 congested lots") and
// (b) keep telling players to "build more avenues" when their streets were
// already avenues. These specs lock in the two fixes:
//   1. when the jammed streets are mostly avenues, the advice re-points to
//      transit (bus / rail) instead of "build avenues";
//   2. the trigger scales with city size, so a mostly-healthy metropolis with
//      a small hotspot is no longer nagged every 19 days.

const SETUP = `
  S.commuteRoute = true;
  // capture every ticker message a tick emits (msg is a reassignable global fn)
  const _seen = []; const _msg = msg; msg = (t) => { _seen.push(t); };
  function settle(iters){
    for (let k=0;k<iters;k++){
      for (let i=0;i<traffic.length;i++) traffic[i]*=0.80;
      recomputeCommute();
      for (let y=0;y<G;y++) for (let x=0;x<G;x++){ const c=map[y][x]; if (c.lv>0) emitTraffic(x,y,c.lv,c.t); }
    }
  }
  // a dense downtown on a street lattice: homes left, jobs right, every lot lv4
  function denseGrid(roadType, x0, y0, span){
    for (let y=y0; y<y0+span; y++) for (let x=x0; x<x0+span; x++){
      if (((x-x0)%3===0) || ((y-y0)%3===0)) map[y][x].t = roadType;
    }
    for (let y=y0; y<y0+span; y++) for (let x=x0; x<x0+span; x++){
      const c=map[y][x]; if (ROADTYPE[c.t]) continue;
      const lot=set(x,y, x < x0+span/2 ? 'res' : 'ind'); lot.lv=4; lot.dev=400;
    }
  }
  // fire the day-gated gridlock check exactly once (day 19: 19%19===0, and no
  // other utility/budget nag shares that day) and return what landed on the ticker
  function tickOnce(){ _seen.length=0; S.day=18; simTick(); return _seen.filter(t=>/Gridlock/.test(t)); }
`;

test('a gridlocked city of avenues is told to add transit, not more avenues', async ({ game }) => {
  const res = await game.eval(inPage(`
    ${SETUP}
    resetGrid();
    set(0,0,'power'); set(1,0,'pump');
    denseGrid('avenue', 4, 4, 36);
    recomputeNets(); recomputeFields();
    settle(40);
    const gridlockMsgs = tickOnce();
    const advice = adviseCity().find(a => /gridlocked/.test(a[1]));
    return {
      congested: S.congested, jamRoad: S.jamRoad, jamAve: S.jamAve,
      msg: gridlockMsgs[0] || '',
      adviceDetail: advice ? advice[2] : '',
    };
  `));

  // the jammed streets really are avenues (the premise of the re-point)
  expect(res.jamRoad).toBeGreaterThan(0);
  expect(res.jamAve / res.jamRoad).toBeGreaterThan(0.5);
  // …so the ticker points at transit, NOT at building more avenues
  expect(res.msg).toMatch(/Gridlock/);
  expect(res.msg).toMatch(/bus stops|rail/);
  expect(res.msg).not.toMatch(/upgrade busy streets to avenues/);
  // …and the Advisor agrees
  expect(res.adviceDetail).toMatch(/bus stops|rail/);
  expect(res.adviceDetail).not.toMatch(/Upgrade busy stretches to avenues/);
});

test('a gridlocked city of plain roads is still told to upgrade to avenues', async ({ game }) => {
  const res = await game.eval(inPage(`
    ${SETUP}
    resetGrid();
    set(0,0,'power'); set(1,0,'pump');
    denseGrid('road', 4, 4, 36);
    recomputeNets(); recomputeFields();
    settle(40);
    const gridlockMsgs = tickOnce();
    return { jamRoad: S.jamRoad, jamAve: S.jamAve, msg: gridlockMsgs[0] || '' };
  `));

  // hardly any of the jammed streets are avenues here
  expect(res.jamAve / Math.max(1, res.jamRoad)).toBeLessThan(0.5);
  // so the advice is the original one: widen the roads
  expect(res.msg).toMatch(/Gridlock/);
  expect(res.msg).toMatch(/upgrade busy streets to avenues/);
});

test('a mostly-healthy large city with a small hotspot is not nagged', async ({ game }) => {
  const res = await game.eval(inPage(`
    ${SETUP}
    resetGrid();
    set(0,0,'power'); set(1,0,'pump');
    // a big, calm avenue district: sparse lv1 lots so avenues stay well under cap
    for (let y=4; y<=44; y++) map[y][6].t='avenue';
    for (let x=6; x<=44; x++) map[4][x].t='avenue';
    for (let y=4; y<=44; y+=2) for (let x=8; x<=44; x+=3){ const c=set(x,y,'res'); c.lv=1; c.dev=60; }
    for (let y=5; y<=43; y+=2) for (let x=8; x<=44; x+=3){ const c=set(x,y,'ind'); c.lv=1; c.dev=60; }
    // a tiny dense all-road cul-de-sac elsewhere → a handful of congested lots
    denseGrid('road', 50, 4, 9);
    recomputeNets(); recomputeFields();
    settle(40);
    const gridlockMsgs = tickOnce();
    return { congested: S.congested, msg: gridlockMsgs[0] || '' };
  `));

  // the old flat ">6" trigger WOULD have fired (proving this is a real test of the scaling)…
  expect(res.congested).toBeGreaterThan(6);
  // …but the size-scaled trigger keeps the ticker quiet for a mostly-healthy city
  expect(res.msg).toBe('');
});
