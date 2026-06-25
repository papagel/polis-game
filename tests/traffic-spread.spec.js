import { test, expect } from './harness.js';
import { inPage } from './citybuild.js';

// Reduce trip concentration (#4). The commute emitter walks each trip down the
// cost gradient, picking among neighbouring road tiles. It used to weight that
// pick by a flat avenue bonus that ignored how loaded the avenue already was,
// and bucketed the gradient so coarsely that a parallel ROAD would gridlock
// beside a half-empty avenue — the "I build avenues but it's still jammed" feel.
// The pick is now capacity-aware (shy away from loaded tiles, BPR-shaped). Since
// congestion is load/CAPACITY, an avenue stays attractive at ~3x the load a road
// would be, so overflow lands on the higher-capacity street and the two parallels
// equalise their congestion instead of one jamming.
//
// Invariant: with a home cluster and a job cluster joined by TWO equal-length
// corridors — one avenue (cap 120), one road (cap 40) — under heavy demand the
// road must NOT end up far more congested than the parallel avenue. The emitter
// walk is stochastic (Math.random, unseedable), and this single-junction layout
// is its worst case for oscillation, so we average many runs and assert on the
// mean balance — the unfixed router sat at a ~1.56 road/avenue congestion ratio.
test('an avenue laid parallel to a road shares the load by capacity, not by piling on the road', async ({ game }) => {
  const res = await game.eval(inPage(`
    S.commuteRoute = true;
    function settle(iters){
      for (let k=0;k<iters;k++){
        for (let i=0;i<traffic.length;i++) traffic[i]*=0.80;
        recomputeCommute();
        for (let y=0;y<G;y++) for (let x=0;x<G;x++){ const c=map[y][x]; if (c.lv>0) emitTraffic(x,y,c.lv,c.t); }
      }
    }
    function avgCg(y,x0,x1){ let s=0,n=0; for(let x=x0;x<=x1;x++){ s+=congestion(x,y); n++; } return s/n; }
    function avgLoad(y,x0,x1){ let s=0,n=0; for(let x=x0;x<=x1;x++){ s+=traffic[idx(x,y)]; n++; } return s/n; }
    function build(){
      resetGrid();
      const x0=6, x1=40, topY=20, botY=24;
      set(2, topY, 'power'); set(3, topY, 'pump');
      for (let x=x0;x<=x1;x++){ map[topY][x].t='avenue'; map[botY][x].t='road'; }   // parallel corridors
      for (let y=topY;y<=botY;y++){ map[y][x0].t='road'; map[y][x1].t='road'; }      // joined only at the ends
      // dense homes (left) and jobs (right), two columns deep, to push demand past one road's capacity
      for (let y=topY-1;y<=botY+1;y++) for(let dx=1;dx<=2;dx++){ const c=set(x0-dx,y,'res'); c.lv=5; c.dev=500; }
      for (let y=topY-1;y<=botY+1;y++) for(let dx=1;dx<=2;dx++){ const c=set(x1+dx,y,'ind'); c.lv=5; c.dev=500; }
      for (let y=topY;y<=botY;y++){ map[y][x0-1].t='road'; map[y][x1+1].t='road'; }   // feeders behind the front column
      recomputeNets(); recomputeFields();
    }
    const N=20; let sumRatio=0, sumRoadCg=0, sumAveShare=0;
    for (let r=0;r<N;r++){
      build(); settle(80);
      const aCg=avgCg(20,8,38), rCg=avgCg(24,8,38);
      const aLd=avgLoad(20,8,38), rLd=avgLoad(24,8,38);
      sumRatio += rCg/aCg; sumRoadCg += rCg; sumAveShare += aLd/(aLd+rLd);
    }
    return { meanRatio: sumRatio/N, meanRoadCg: sumRoadCg/N, meanAveShare: sumAveShare/N };
  `));

  // the avenue carries the majority of the load (it has 3x the capacity) — trips are
  // not split capacity-blind 50/50, nor dumped entirely onto one street
  expect(res.meanAveShare).toBeGreaterThan(0.6);
  expect(res.meanAveShare).toBeLessThan(0.85);
  // congestion is balanced across the two parallels: the road is not left to gridlock
  // beside a half-empty avenue (the unfixed router sat near ~1.56 here)
  expect(res.meanRatio).toBeLessThan(1.4);
  // and on average the parallel road stays out of gridlock
  expect(res.meanRoadCg).toBeLessThan(1.0);
});
