import { test, expect } from './harness.js';
import { inPage } from './citybuild.js';

// The inspect overlay highlights the actual ROADS a building's commuters drive, and every line
// must provably connect the CLICKED building to one of the destinations the card lists — the old
// bug was workplace/venue routes running between two other lots. routesFromBuilding() seeds a cost
// field from the clicked building and walks each counterpart back to it. Assert the consequence: a
// home wired to a distant job by a single road yields a 'work' route that is all road tiles with
// one end at the job's frontage and the other end at the clicked home's frontage.
test('inspecting a home traces the real road route to its job', async ({ game }) => {
  const res = await game.eval(inPage(`
    resetGrid();
    S.commuteRoute = true;
    const ry = 10;
    hroad(ry, 5, 15);                 // one straight road
    const home = set(6,  ry+1, 'res'); home.lv = 1; home.dev = 200;
    const job  = set(14, ry+1, 'ind'); job.lv  = 1; job.dev  = 200;
    recomputeNets(); recomputeFields(); recomputeCommute();

    const jobs = commuteSearch(6, ry+1, isJobCell, 4);
    const routes = routesFromBuilding(home, 6, ry+1, [{list:jobs, kind:'work'}]);
    const work = routes.find(r => r.kind === 'work');
    const tiles = work ? work.path.map(ti => ({ x: ti%G, y: (ti/G)|0 })) : [];
    const allRoad = tiles.length > 0 && tiles.every(t => !!ROADTYPE[map[t.y][t.x].t]);
    const adj = (t, want) => !!t && [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => {
      const nx=t.x+dx, ny=t.y+dy; return inB(nx,ny) && want(map[ny][nx]);
    });
    const closeTo = (t, bx, by) => !!t && Math.max(Math.abs(t.x-bx), Math.abs(t.y-by)) <= 2;
    const ends = [tiles[0], tiles[tiles.length-1]];
    const linksHome = ends.some(t => closeTo(t, 6, ry+1));  // one end sits within the clicked home's ±2 frontage window
    const linksJob  = ends.some(t => adj(t, isJobCell));    // the other fronts the job
    return { hasWork: !!work, len: tiles.length, allRoad, linksHome, linksJob };
  `));

  expect(res.hasWork).toBe(true);
  expect(res.len).toBeGreaterThan(1);       // a multi-tile road corridor, not a point
  expect(res.allRoad).toBe(true);           // every highlighted tile is a road
  expect(res.linksHome).toBe(true);         // a route end fronts the clicked home
  expect(res.linksJob).toBe(true);          // and the other end fronts its job
});

// The reported bug: inspecting a WORKPLACE drew lines that didn't touch the clicked building —
// they ran from homes to whatever job was *nearest*, which need not be this one. With two jobs on
// the same road, a route from a home walking down jobCost lands at the closer job. Anchoring to the
// clicked building must instead make EVERY route reach the building you clicked. Assert that with a
// nearer decoy factory present, inspecting the far factory still routes to the FAR factory.
test('inspecting a workplace anchors every route to that workplace', async ({ game }) => {
  const res = await game.eval(inPage(`
    resetGrid();
    S.commuteRoute = true;
    const ry = 10;
    hroad(ry, 3, 24);
    const home  = set(4,  ry+1, 'res'); home.lv  = 2; home.dev = 200;
    const near  = set(10, ry+1, 'ind'); near.lv  = 1; near.dev = 200;   // decoy: closer to the home
    const far   = set(22, ry+1, 'ind'); far.lv   = 1; far.dev  = 200;   // the one we click
    recomputeNets(); recomputeFields(); recomputeCommute();

    const homes  = commuteSearch(22, ry+1, isHomeCell, 4);
    const routes = routesFromBuilding(far, 22, ry+1, [{list:homes, kind:'home'}]);
    const okFar = routes.length > 0 && routes.every(r => {
      const t = { x: r.path[r.path.length-1]%G, y: (r.path[r.path.length-1]/G)|0 };
      const cheb=(bx,by)=>Math.max(Math.abs(t.x-bx), Math.abs(t.y-by));
      // the building-side end of every route must sit by the CLICKED far factory (22), not the decoy (10)
      return cheb(22, ry+1) <= 2 && cheb(10, ry+1) > 2;
    });
    return { n: routes.length, okFar };
  `));

  expect(res.n).toBeGreaterThan(0);   // a workplace with a reachable home has at least one route
  expect(res.okFar).toBe(true);       // and every route ends at the CLICKED factory, not a nearer one
});

// Touch model (no right button): a tap just SELECTS — it pins the lean card and is idempotent on the
// current element (no hidden "tap again to advance / tap again and it vanishes"). Depth and close come
// from the card's own ▸/▴ and ✕ controls; tapping empty ground dismisses. Drive the 'select' path
// (inspectClick) + setInspectLevel and assert each of those, plus that a stray hover never disturbs it.
test('touch: a tap selects the basic card and is idempotent; depth/close via card controls', async ({ game }) => {
  const res = await game.eval(inPage(`
    resetGrid();
    S.commuteRoute = true;
    S.tool = 'pan';
    if (S.zoom < TIP_MINZ) S.zoom = TIP_MINZ + 0.1;   // the panel hides when zoomed right out
    const ry = 10;
    hroad(ry, 4, 18);
    const home = set(5,  ry+1, 'res'); home.lv = 2; home.dev = 200;
    const job  = set(16, ry+1, 'ind'); job.lv  = 1; job.dev  = 200;
    recomputeNets(); recomputeFields(); recomputeCommute();

    inspectClick(16, ry+1);                            // tap → pin the factory at basic depth
    const pinned     = !!inspectSel && inspectSel[0]===16 && inspectSel[1]===(ry+1);
    const basicLevel = inspectLevel === 'basic';
    const docked     = tipEl.classList.contains('dock');
    const shown      = tipEl.style.display === 'block';
    const basicNoLines = !commuteViz;                  // basic draws no routes
    const hasClose   = !!tipEl.querySelector('.tipX');
    const hasToggle  = !!tipEl.querySelector('.tipToggle');   // the ▸ depth control is present

    inspectClick(16, ry+1);                            // tap the SAME again → idempotent: no escalate, no close
    const idempotent = !!inspectSel && inspectLevel==='basic' && tipEl.style.display==='block' && !commuteViz;

    setInspectLevel('full');                           // the card's ▸ control → advanced (touch's path to detail)
    const fullLevel  = inspectLevel === 'full';
    const hasLines   = !!commuteViz && commuteViz.routes.length > 0;
    const hasLegend  = tipEl.innerHTML.includes('Commute lines');

    inspectClick(16, ry+1);                            // tap same while advanced → still idempotent, stays advanced
    const stillAdvanced = inspectLevel==='full' && !!inspectSel;

    // a hover elsewhere must NOT disturb the pinned panel
    hideTip();
    const survives = !!inspectSel && tipEl.style.display === 'block';

    inspectClick(3, 3);                                // tap empty ground → clear
    const cleared  = inspectSel === null && commuteViz === null
                   && !tipEl.classList.contains('dock') && tipEl.style.display === 'none';

    return { pinned, basicLevel, docked, shown, basicNoLines, hasClose, hasToggle, idempotent, fullLevel, hasLines, hasLegend, stillAdvanced, survives, cleared };
  `));

  expect(res.pinned).toBe(true);
  expect(res.basicLevel).toBe(true);    // a tap is the lean readout…
  expect(res.docked).toBe(true);
  expect(res.shown).toBe(true);
  expect(res.basicNoLines).toBe(true);  // …with no commute overlay…
  expect(res.hasClose).toBe(true);
  expect(res.hasToggle).toBe(true);     // …and the ▸ control to reach detail
  expect(res.idempotent).toBe(true);    // tapping the same item again changes nothing
  expect(res.fullLevel).toBe(true);     // the in-card control deepens to the full inspect…
  expect(res.hasLines).toBe(true);      // …which draws the routes…
  expect(res.hasLegend).toBe(true);     // …and their legend
  expect(res.stillAdvanced).toBe(true); // tapping the item again doesn't drop back out of advanced
  expect(res.survives).toBe(true);      // pan/zoom/hover keep the pinned card alive
  expect(res.cleared).toBe(true);       // tapping empty ground tears everything down
});

// Pan view's two-button model: LEFT-click pins the basic card (no commute overlay), RIGHT-click pins the
// advanced one (commute lines + legend), switching button switches depth in place, and clicking the SAME
// depth again toggles it off. The in-card ▸/▴ control (setInspectLevel) changes depth without a map click —
// the path touch relies on, since it has no right button.
test('left=basic, right=advanced, in-card toggle switches depth, repeat-depth closes', async ({ game }) => {
  const res = await game.eval(inPage(`
    resetGrid();
    S.commuteRoute = true;
    S.tool = 'pan';
    if (S.zoom < TIP_MINZ) S.zoom = TIP_MINZ + 0.1;
    const ry = 10;
    hroad(ry, 4, 18);
    const home = set(5,  ry+1, 'res'); home.lv = 2; home.dev = 200;
    const job  = set(16, ry+1, 'ind'); job.lv  = 1; job.dev  = 200;
    recomputeNets(); recomputeFields(); recomputeCommute();

    inspectAt(16, ry+1, 'basic');                          // LEFT-click → basic, no lines
    const basicPinned = !!inspectSel && inspectLevel==='basic' && !commuteViz && tipEl.style.display==='block';

    inspectAt(16, ry+1, 'full');                           // RIGHT-click same → advanced in place
    const advanced = inspectLevel==='full' && !!commuteViz && commuteViz.routes.length>0
                   && tipEl.innerHTML.includes('Commute lines');

    setInspectLevel('basic');                              // in-card ▴ → back to basic (touch's path to depth)
    const backToBasic = inspectLevel==='basic' && !commuteViz;

    inspectAt(16, ry+1, 'full');                           // RIGHT again → advanced…
    const reAdvanced = inspectLevel==='full' && !!commuteViz;
    inspectAt(16, ry+1, 'full');                           // …RIGHT once more on the same depth → close
    const closedByRight = inspectSel===null && commuteViz===null && tipEl.style.display==='none';

    inspectAt(5, ry+1, 'basic');                           // LEFT a fresh item → basic
    const basic2 = !!inspectSel && inspectLevel==='basic' && inspectSel[0]===5;
    inspectAt(5, ry+1, 'basic');                           // LEFT same depth again → close
    const closedByLeft = inspectSel===null;

    return { basicPinned, advanced, backToBasic, reAdvanced, closedByRight, basic2, closedByLeft };
  `));

  expect(res.basicPinned).toBe(true);   // left-click is the lean card…
  expect(res.advanced).toBe(true);      // …right-click jumps straight to the full inspect…
  expect(res.backToBasic).toBe(true);   // …the in-card toggle drops back down…
  expect(res.reAdvanced).toBe(true);
  expect(res.closedByRight).toBe(true); // …repeating the same depth on the same element closes it…
  expect(res.basic2).toBe(true);
  expect(res.closedByLeft).toBe(true);  // …for either button
});

// Same engine for every building: a lot set BACK from the road (not directly fronting it, but within
// the ±2 frontage window the game grants road access on) must trace a real ROAD route, not the
// straight-line fallback that only kicks in for genuinely roadless lots. The fix seeds the overlay's
// cost field with reach 2, matching commuteSearch's window.
test('a building set back from the road still routes on roads, not a straight line', async ({ game }) => {
  const res = await game.eval(inPage(`
    resetGrid();
    S.commuteRoute = true;
    const ry = 10;
    hroad(ry, 4, 16);
    const job  = set(14, ry+1, 'ind'); job.lv  = 1; job.dev  = 200;   // fronts the road directly
    const home = set(6,  ry+2, 'res'); home.lv = 1; home.dev = 200;   // set BACK one tile from the road
    recomputeNets(); recomputeFields(); recomputeCommute();

    const directlyFronted = [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => {
      const nx=6+dx, ny=(ry+2)+dy; return inB(nx,ny) && !!ROADTYPE[map[ny][nx].t];
    });
    const jobs   = commuteSearch(6, ry+2, isJobCell, 4);              // the card finds it via the ±2 window
    const routes = routesFromBuilding(home, 6, ry+2, [{list:jobs, kind:'work'}]);
    const work   = routes.find(r => r.kind==='work');
    const tiles  = work ? work.path.map(ti=>({x:ti%G,y:(ti/G)|0})) : [];
    const allRoad= tiles.length>1 && tiles.every(t=>!!ROADTYPE[map[t.y][t.x].t]);
    return { directlyFronted, foundJob: jobs.length>0, hasRoute: !!work, allRoad };
  `));

  expect(res.directlyFronted).toBe(false);   // the home is genuinely set back, not touching a road
  expect(res.foundJob).toBe(true);           // yet the destination is discoverable…
  expect(res.hasRoute).toBe(true);           // …and now it routes on roads (no straight-line fallback)
  expect(res.allRoad).toBe(true);
});

// Inbound catchments are the REAL reverse trips, not the same nearest-homes list painted twice.
// Layout: a home whose nearest JOB is a close factory but whose nearest (only) SHOP is a farther
// commerce lot. So the shop must draw that home as a SHOPPER (blue) — never a worker (it works at the
// factory) — and the factory must draw it as a WORKER (amber), never a shopper. This is the property
// that made the previous overlapping work+shop lines wrong.
test('a shop shows real shoppers, a factory real workers — distinct catchments', async ({ game }) => {
  const res = await game.eval(inPage(`
    resetGrid();
    S.commuteRoute = true;
    S.tool = 'pan';
    if (S.zoom < TIP_MINZ) S.zoom = TIP_MINZ + 0.1;
    const full = (x,y)=>inspectAt(x,y,'full');    // pin the advanced card directly (routes only appear at full depth)
    const ry = 10;
    hroad(ry, 3, 16);
    const home = set(5,  ry+1, 'res'); home.lv = 2; home.dev = 200;
    const fac  = set(7,  ry+1, 'ind'); fac.lv  = 1; fac.dev  = 200;   // the home's NEAREST job
    const shop = set(12, ry+1, 'com'); shop.lv  = 1; shop.dev  = 200; // the home's NEAREST (only) shop
    recomputeNets(); recomputeFields(); recomputeCommute();

    full(12, ry+1);                                                   // the shop
    const shopKinds = (commuteViz.routes||[]).map(r=>r.kind);
    const shopDotsHome = (commuteViz.routes||[]).some(r=>r.kind==='shop' && r.dest[0]===5 && r.dest[1]===ry+1);
    closeInspect();

    full(7, ry+1);                                                    // the factory
    const facKinds = (commuteViz.routes||[]).map(r=>r.kind);
    closeInspect();

    return {
      shopHasShop: shopKinds.includes('shop'), shopHasWork: shopKinds.includes('work'), shopDotsHome,
      facHasWork: facKinds.includes('work'),   facHasShop: facKinds.includes('shop'),
    };
  `));

  expect(res.shopHasShop).toBe(true);   // the shop draws the home as a SHOPPER…
  expect(res.shopDotsHome).toBe(true);  // …pointing at that exact home (reverse of its shop-trip)
  expect(res.shopHasWork).toBe(false);  // …but NOT as a worker — it works at the nearer factory
  expect(res.facHasWork).toBe(true);    // the factory draws the home as a WORKER…
  expect(res.facHasShop).toBe(false);   // …and a factory never has shoppers
});

// "No single point of truth": clicking a road carrying commute traffic must trace the CATCHMENT — the
// real source buildings whose trips flow through the tile and the destinations they head to — not read
// "no commute routes here", and not draw hairlines that stop short of the homes. A home and a job sit
// at the two ends of one long arterial; the MIDDLE tile is on the sole path between them, so its
// corridor must span the actual home → this tile → the actual job, all on roads.
test('a loaded road tile traces its catchment: source home → here → destination job', async ({ game }) => {
  const res = await game.eval(inPage(`
    resetGrid();
    S.commuteRoute = true;
    const ry = 10;
    hroad(ry, 2, 60);                                  // one long arterial
    const home = set(3,  ry+1, 'res'); home.lv = 2; home.dev = 200;
    const job  = set(58, ry+1, 'ind'); job.lv  = 1; job.dev  = 200;   // ~55 tiles away (> MAX_TRIP)
    recomputeNets(); recomputeFields(); recomputeCommute();

    const mid = 30;                                    // a tile squarely between the two, on the sole path
    const tr  = routesThroughRoad(mid, ry);
    const r   = tr.routes.find(r => r.kind==='work');
    const crosses = !!r && r.path.includes(idx(mid, ry));
    const reachesHome = !!r && r.src  && r.src[0]===3  && r.src[1]===ry+1;   // corridor end IS the real home
    const reachesJob  = !!r && r.dest && r.dest[0]===58 && r.dest[1]===ry+1; // …and the real job
    const allRoad = !!r && r.path.every(ti => !!ROADTYPE[map[(ti/G)|0][ti%G].t]);
    return { onlyPath: !!ROADTYPE[map[ry][mid].t], n: tr.routes.length, crosses, reachesHome, reachesJob, allRoad };
  `));

  expect(res.onlyPath).toBe(true);
  expect(res.n).toBeGreaterThan(0);   // the corridor that loads this mid-tile is surfaced…
  expect(res.crosses).toBe(true);     // …and it provably runs through the inspected tile…
  expect(res.reachesHome).toBe(true); // …anchored to the REAL source home (not a hairline stopping short)…
  expect(res.reachesJob).toBe(true);  // …and the REAL destination job
  expect(res.allRoad).toBe(true);     // every traced tile is a road
});
