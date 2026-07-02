import { test, expect } from './harness.js';

// THROWAWAY sim profiler. Times simTick() on big cities and attributes cost to
// recomputeFields(). Level-up calls inside the growth loop are RF_DEFER-coalesced
// into one real pass per tick — only non-deferred passes are counted, so rfPerTick
// reads as REAL O(G²) work, not deferred no-ops. "steady" = the city as-loaded
// (near equilibrium); "boom" = all lots knocked down with max demand, forcing mass
// regrowth. Run: `npx playwright test tick.spec.js`.

test('sim tick cost breakdown', async ({ game }) => {
  test.setTimeout(180000);

  const out = await game.eval(() => {
    let rfCalls=0, rfSelf=0, rcCalls=0, rcSelf=0;
    const _rf=recomputeFields, _rc=recomputeCommute;
    recomputeFields = function(){ if (!RF_DEFER) rfCalls++; const t=performance.now(); const r=_rf.apply(this,arguments); rfSelf+=performance.now()-t; return r; };
    recomputeCommute = function(){ rcCalls++; const t=performance.now(); const r=_rc.apply(this,arguments); rcSelf+=performance.now()-t; return r; };

    function devLotCount(){ let d=0; for(let y=0;y<G;y++)for(let x=0;x<G;x++){ const c=map[y][x]; if(ZONE[c.t]&&c.lv>0&&!c.part) d++; } return d; }

    function measure(N){
      rfCalls=rfSelf=rcCalls=rcSelf=0;
      const t0=performance.now();
      for (let i=0;i<N;i++) simTick();
      const total=performance.now()-t0;
      return { msTick: total/N, rfPerTick: rfCalls/N, rfMsTick: rfSelf/N,
               rcPerTick: rcCalls/N, rcMsTick: rcSelf/N, rfShare: 100*rfSelf/total };
    }

    function knockDown(){   // force a boom: reset every zoned lot near the floor, crank demand + mood
      for (let y=0;y<G;y++) for (let x=0;x<G;x++){
        const c=map[y][x];
        if (ZONE[c.t]){ if (c.grp) unmerge(c.grp[0],c.grp[1]); }
      }
      for (let y=0;y<G;y++) for (let x=0;x<G;x++){
        const c=map[y][x];
        if (ZONE[c.t]){ c.lv=1; c.dev=20; c.grp=null; c.part=false; }
      }
      S.demand={r:1,c:1,i:1}; S.happyF=85; S.edu=0.9;
      recomputeNets(); recomputeFields();
    }

    function profile(code,label){
      loadSave(code); S.started=true; recomputeNets(); recomputeFields();
      const pop=S.pop, dev=devLotCount();
      const steady=measure(60);
      knockDown();
      const boom=measure(60);
      return { label, pop, dev, steady, boom };
    }

    // synthetic dense city at an arbitrary grid size: a road lattice + zoned lots filled to lv4
    // (210 res/tile). Probes how the now-single-pass tick scales beyond the shipped world sizes.
    function profileSynthetic(g,label){
      setWorldSize(g);
      for (let y=0;y<G;y++){ map[y]=[]; for (let x=0;x<G;x++) map[y][x]=blankCell(); }
      for (let y=0;y<G;y++) for (let x=0;x<G;x++){
        const c=map[y][x];
        if (y%5===0 || x%5===0){ c.t='road'; }
        else { const r=(x*7+y*3)%5; c.t = r<3?'res':(r<4?'com':'ind'); c.lv=4; c.dev=400; }
      }
      for (let y=0;y<G;y+=20) for (let x=0;x<G;x+=20){ if (map[y][x].t==='road'){ map[y][x].t='power'; } }
      for (let y=10;y<G;y+=20) for (let x=10;x<G;x+=20){ if (map[y][x] && map[y][x].t==='road'){ map[y][x].t='pump'; } }
      S.demand={r:1,c:1,i:1}; S.happyF=85; S.edu=0.9; S.started=true;
      recomputeNets(); recomputeFields(); simTick();
      const pop=S.pop, dev=devLotCount();
      const m=measure(40);
      return { label, g, pop, dev, steady:m, boom:null };
    }

    return [
      profile(EXAMPLE_CITY3, '96x96  ~200k'),
      profile(EXAMPLE_CITY2, '64x64   ~67k'),
      profileSynthetic(128, '128x128 synthetic'),
      profileSynthetic(160, '160x160 synthetic'),
    ];
  });

  const L=['','================ SIM TICK PROFILE (ms/tick, avg) ================'];
  for (const r of out){
    L.push('');
    L.push(`${r.label}   [pop=${r.pop}, devLots=${r.dev}]`);
    L.push(`  steady : ${r.steady.msTick.toFixed(2)} ms/tick · recomputeFields ${r.steady.rfPerTick.toFixed(1)}x/tick = ${r.steady.rfMsTick.toFixed(2)} ms (${r.steady.rfShare.toFixed(0)}%) · commute ${r.steady.rcMsTick.toFixed(2)} ms`);
    if (r.boom) L.push(`  boom   : ${r.boom.msTick.toFixed(2)} ms/tick · recomputeFields ${r.boom.rfPerTick.toFixed(1)}x/tick = ${r.boom.rfMsTick.toFixed(2)} ms (${r.boom.rfShare.toFixed(0)}%) · commute ${r.boom.rcMsTick.toFixed(2)} ms`);
  }
  L.push('==================================================================');
  console.log(L.join('\n'));

  expect(out.length).toBe(4);
});
