import { test, expect } from './harness.js';

// THROWAWAY render profiler. Loads big sample cities, frames the whole map,
// seeds the agent fleet, then times render(). A non-invasive self-time wrapper
// attributes each frame to building-body vs agent draw functions; the remainder
// is ground/terrain. Goal: decide whether a ground-layer cache is worth it.
// Run: `npx playwright test profile.spec.js`.

test('render cost breakdown', async ({ game }) => {
  test.setTimeout(180000);

  const out = await game.eval(() => {
    // body superstructures (the expensive procedural geometry)
    const BLD = ['drawRes','drawCom','drawInd','drawTowerTile','drawBigBuilding',
      'drawVenue','civic','drawAirport','drawPort','drawZoo','drawUniversityCampus',
      'drawNuclearCampus','drawFusionCampus','drawCrane'];
    const AGT = ['drawVehicle','drawPed','drawTrainCar','drawPlanes','drawShips',
      'drawRockets','drawCopters'];

    const orig = {};
    for (const nm of [...BLD, ...AGT]) orig[nm] = window[nm];
    const buckets = { building:0, agents:0 };
    const stack = [];
    function wrap(nm, bucket){
      const fn = orig[nm];
      window[nm] = function(){
        const frame = { child:0 };
        stack.push(frame);
        const t0 = performance.now();
        const r = fn.apply(this, arguments);          // preserve return value
        const dt = performance.now() - t0;
        stack.pop();
        buckets[bucket] += dt - frame.child;          // self-time only
        if (stack.length) stack[stack.length-1].child += dt;
        return r;
      };
    }
    const wrapAll = () => { for (const nm of BLD) wrap(nm,'building'); for (const nm of AGT) wrap(nm,'agents'); };
    const unwrapAll = () => { for (const nm of [...BLD,...AGT]) window[nm] = orig[nm]; };

    function centerFit(zoom){
      const W = window.innerWidth, H = window.innerHeight;
      S.zoom = zoom; S.rot = 0;
      S.ox = W/2; S.oy = H/2;
      const [sx, sy] = tileScreen(G>>1, G>>1);
      S.ox += W/2 - sx;
      S.oy += H/2 - (sy + TH/2*S.zoom);
    }
    function seedAgents(){
      const sp = S.speed; S.speed = 1;
      for (let i=0;i<50;i++) stepCars(0.016);
      S.speed = sp;
    }
    function countDeveloped(){
      let dev=0, tree=0, road=0;
      for (let y=0;y<G;y++) for (let x=0;x<G;x++){
        const c = map[y][x];
        if (c.t==='tree') tree++;
        else if (ROADTYPE[c.t]) road++;
        else if ((ZONE[c.t] && c.lv>0) || (SVC[c.t]||PLANT[c.t]||WSRC[c.t])) dev++;
      }
      return { dev, tree, road };
    }

    function profile(code, label, zoom){
      loadSave(code); S.started = true;
      recomputeNets(); recomputeFields();
      shoreDirty = true; elevDirty = true;
      centerFit(zoom);
      seedAgents();

      const N = 30;
      // clean wall-clock headline (no wrapper overhead)
      render(performance.now()); render(performance.now());
      let t0 = performance.now();
      for (let i=0;i<N;i++) render(performance.now());
      const full = (performance.now() - t0) / N;

      // wrapped pass for the breakdown
      wrapAll();
      buckets.building = 0; buckets.agents = 0;
      render(performance.now());                       // warmup under wrappers
      buckets.building = 0; buckets.agents = 0;
      t0 = performance.now();
      for (let i=0;i<N;i++) render(performance.now());
      const wTotal = (performance.now() - t0);
      unwrapAll();
      const building = buckets.building / N;
      const agents = buckets.agents / N;
      const ground = wTotal / N - building - agents;   // remainder under same overhead

      const cnt = countDeveloped();
      return { label, pop:S.pop, cars:cars.length, peds:peds.length, zoom,
        full, building, agents, ground, ...cnt };
    }

    return [
      profile(EXAMPLE_CITY3, '96x96  200k  whole-map', 0.22),
      profile(EXAMPLE_CITY3, '96x96  200k  play-zoom', 0.60),
      profile(EXAMPLE_CITY2, '64x64   67k  whole-map', 0.33),
    ];
  });

  const lines = ['', '================ RENDER PROFILE (ms/frame, avg) ================'];
  for (const r of out){
    const denom = r.building + r.agents + r.ground;
    const pct = (v) => `${(100*v/denom).toFixed(0)}%`;
    lines.push('');
    lines.push(`${r.label}   [pop=${r.pop}, devLots=${r.dev}, trees=${r.tree}, roads=${r.road}, cars=${r.cars}, peds=${r.peds}]`);
    lines.push(`  full render      : ${r.full.toFixed(2)} ms`);
    lines.push(`  - buildings      : ${r.building.toFixed(2)} ms  (${pct(r.building)})`);
    lines.push(`  - agents         : ${r.agents.toFixed(2)} ms  (${pct(r.agents)})`);
    lines.push(`  - ground/terrain : ${r.ground.toFixed(2)} ms  (${pct(r.ground)})  <- cacheable layer`);
  }
  lines.push('================================================================');
  console.log(lines.join('\n'));

  expect(out.length).toBe(3);
});
