import { test, expect } from './harness.js';
import { inPage } from './citybuild.js';

// Sanitation: garbage floods from facilities over the road net (recomputeWaste),
// landfills fill up over time (tickLandfills) and a full landfill stops collecting.
// Assert the consequences: lots really flip ws true/false, capacity really caps,
// and a full landfill drops out of the network.

const TOWN = `
  resetGrid();
  hroad(20, 8, 30); set(8, 21, 'power'); set(9, 21, 'pump');
  for (let x=12; x<=26; x++){ const c = set(x, 19, 'res'); c.lv = 3; c.dev = 250; }
`;

test('a connected landfill collects the streets; severing the network strands them', async ({ game }) => {
  const r = await game.eval(inPage(`
    ${TOWN}
    set(30, 21, 'landfill');
    recomputeNets();
    const westServed = map[19][12].ws, eastServed = map[19][26].ws;
    const useServed = S.wasteUse;
    // sever the network: waste conducts through roads AND buildings, so the cut must
    // break both the road row and the contiguous lot row
    set(20, 20, 'grass'); set(19, 19, 'grass'); set(20, 19, 'grass'); set(21, 19, 'grass');
    recomputeNets();
    return { westServed, eastServed, useServed,
             westCut: map[19][12].ws,     // west of the cut: no route to the tip at x=30
             eastCut: map[19][26].ws };   // east side: still wired to it
  `));
  expect(r.westServed).toBe(true);
  expect(r.eastServed).toBe(true);
  expect(r.useServed).toBeGreaterThan(0);
  expect(r.westCut).toBe(false);   // the network is physical — no route, no collection
  expect(r.eastCut).toBe(true);    // the tip's own side keeps service
});

test('an over-capacity network drops the farthest lots first, never exceeding capacity', async ({ game }) => {
  const r = await game.eval(inPage(`
    resetGrid();
    hroad(20, 4, 60); set(4, 21, 'power'); set(5, 21, 'pump');
    set(6, 21, 'landfill');                                  // one tip: 1600 capacity
    // 51 towers × wasteGen(lv6) = 51 × 35 = 1785 garbage — well past the tip's 1600
    for (let x=8; x<=58; x++){ const c = set(x, 19, 'res'); c.lv = 6; c.dev = 660; }
    recomputeNets();
    let servedNear = map[19][8].ws, servedFar = map[19][58].ws;
    return { cap: S.wasteCap, use: S.wasteUse, servedNear, servedFar };
  `));
  expect(r.cap).toBe(1600);
  expect(r.use).toBeLessThanOrEqual(r.cap);   // collection never exceeds what the tip can take
  expect(r.servedNear).toBe(true);            // lots near the facility keep service
  expect(r.servedFar).toBe(false);            // the far corner's bins overflow first
});

test('a landfill fills up over time and a full one stops collecting', async ({ game }) => {
  const r = await game.eval(inPage(`
    ${TOWN}
    set(30, 21, 'landfill');
    recomputeNets();
    const tip = map[21][30];
    const before = tip.dev || 0;
    // months of steady rubbish — accelerate by ticking the fill logic directly
    for (let i = 0; i < 50; i++) tickLandfills();
    const rising = (tip.dev || 0) > before;
    tip.dev = 100;                             // decades later: the tip is full
    recomputeNets();
    return { rising, capWhenFull: S.wasteCap, collected: map[19][20].ws };
  `));
  expect(r.rising).toBe(true);         // garbage really accumulates in the tip
  expect(r.capWhenFull).toBe(0);       // a full landfill contributes no capacity
  expect(r.collected).toBe(false);     // so the streets go uncollected
});

test('uncollected streets slow growth and drag the mood breakdown', async ({ game }) => {
  const r = await game.eval(inPage(`
    ${TOWN}
    recomputeNets(); recomputeFields();
    __seedRng(11);
    S.started = true; S.pop = 400;             // waste pressure only bites past a village
    simTick();
    __unseedRng();
    return { wastePart: S.happyParts.waste, short: S.wasteShort };
  `));
  expect(r.short).toBeGreaterThan(0);          // no facility at all: every lot uncollected
  expect(r.wastePart).toBeLessThan(0);         // and the breakdown shows the drag
});
