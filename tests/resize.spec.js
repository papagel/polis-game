import { test, expect } from './harness.js';
import { inPage } from './citybuild.js';

// World-size changes (setWorldSize) reallocate every scalar field and the grid.
// A bug here is a hard crash, not a subtle drift, so these guard the structural
// invariants: each size produces correctly-sized arrays, the sim ticks without
// throwing at every size, and a save round-trips across a size change.

test('every world size reallocates a correctly-sized grid and fields, and ticks cleanly', async ({ game }) => {
  const rows = await game.eval(inPage(`
    const out = [];
    for (const ws of WORLD_SIZES){
      setWorldSize(ws.g);
      for (let y=0;y<G;y++){ map[y]=[]; for (let x=0;x<G;x++) map[y][x]=blankCell(); }
      recomputeNets(); recomputeFields();
      for (let i=0;i<10;i++) simTick();
      out.push({
        g: ws.g, G, gridRows: map.length, gridCols: map[G-1].length,
        pollution: pollution.length, traffic: traffic.length, cover: cover.police.length,
      });
    }
    setWorldSize(40);
    return out;
  `));
  for (const r of rows){
    expect(r.G).toBe(r.g);
    expect(r.gridRows).toBe(r.g);
    expect(r.gridCols).toBe(r.g);
    expect(r.pollution).toBe(r.g * r.g);
    expect(r.traffic).toBe(r.g * r.g);
    expect(r.cover).toBe(r.g * r.g);
  }
  expect(game.errors()).toEqual([]);
});

test('expandWorld re-seats the elevation layers instead of wiping them', async ({ game }) => {
  const res = await game.eval(inPage(`
    setWorldSize(40);
    for (let y=0;y<G;y++){ map[y]=[]; for (let x=0;x<G;x++) map[y][x]=blankCell(); }
    recomputeNets(); recomputeFields();
    // give both vertex layers a known peak: procedural base + player sculpt at vertex (10,10)
    const oNV=G+1, vx=10, vy=10, oi=vy*oNV+vx;
    EBASE=new Float32Array(oNV*oNV); EBASE[oi]=20;
    EHAND=new Float32Array(oNV*oNV); EHAND[oi]=50;
    applyElev();
    const before={ base:EBASE[oi], hand:EHAND[oi], vert:EVERT[oi] };
    const pad=2; expandWorld(pad);
    // the same logical vertex now lives at (vx+pad, vy+pad) on the wider grid
    const nNV=G+1, ni=(vy+pad)*nNV+(vx+pad);
    return {
      G, before,
      after:{ base:EBASE[ni], hand:EHAND[ni], vert:EVERT[ni] },
      baseLen:EBASE.length, handLen:EHAND.length, want:nNV*nNV,
    };
  `));
  expect(res.G).toBe(44);                       // 40 + pad*2
  expect(res.baseLen).toBe(res.want);           // buffers re-strided to (G+1)^2
  expect(res.handLen).toBe(res.want);
  expect(res.after.base).toBeCloseTo(res.before.base);   // procedural highland survived, anchored
  expect(res.after.hand).toBeCloseTo(res.before.hand);   // player sculpt survived, not zeroed
  expect(res.after.vert).toBeCloseTo(res.before.vert);   // combined surface unchanged at that tile
  expect(res.after.vert).toBeCloseTo(70);
});

test('expandWorld dresses the new ring with trees and small hills, interior untouched', async ({ game }) => {
  const res = await game.eval(inPage(`
    setWorldSize(40);
    genMap(20260622);
    recomputeNets(); recomputeFields();
    elevDirty=true; recomputeElev();
    const oldG=G, oNV=G+1;
    // interior elevation fingerprint: tallest vertex, to confirm it survives the expand
    let bi=-1,bv=0; for(let i=0;i<EVERT.length;i++){ if(EVERT[i]>bv){bv=EVERT[i];bi=i;} }
    const pv={ vx:bi%oNV, vy:Math.floor(bi/oNV), vert:EVERT[bi] };

    const pad=2; expandWorld(pad);
    const nG=G, nNV=G+1;
    const inRing=(x,y)=> x<pad||y<pad||x>=nG-pad||y>=nG-pad;
    let ringTrees=0; for(let y=0;y<nG;y++)for(let x=0;x<nG;x++) if(inRing(x,y)&&map[y][x].t==='tree') ringTrees++;
    let ringElev=0; for(let gy=0;gy<nNV;gy++)for(let gx=0;gx<nNV;gx++){
      const onRing = gx<=pad||gy<=pad||gx>=nG-pad||gy>=nG-pad;
      if(onRing) ringElev+=EVERT[gy*nNV+gx];
    }
    const ni=(pv.vy+pad)*nNV+(pv.vx+pad);
    return { nG, ringTrees, ringElev, interiorPeak:EVERT[ni], wasPeak:pv.vert };
  `));
  expect(res.nG).toBe(44);
  expect(res.ringTrees).toBeGreaterThan(0);              // forests grew on the new land
  expect(res.ringElev).toBeGreaterThan(0);               // small hills rose on the new land
  expect(res.interiorPeak).toBeCloseTo(res.wasPeak);     // and the existing peak is right where it was
});

test('a save round-trips across a world-size change', async ({ game }) => {
  const res = await game.eval(inPage(`
    setWorldSize(40);
    for (let y=0;y<G;y++){ map[y]=[]; for (let x=0;x<G;x++) map[y][x]=blankCell(); }
    S.scen=0; S.started=false; S.day=0; S.money=20000; S.tax=9; S.pop=0; S.loan=null;
    map[10][10].t='road';
    map[9][10].t='res';
    const saved = makeSave();
    // jump to a different size, then load the 40-grid save back
    setWorldSize(96);
    for (let y=0;y<G;y++){ map[y]=[]; for (let x=0;x<G;x++) map[y][x]=blankCell(); }
    loadSave(saved);
    return { G, rows: map.length, road: map[10][10].t, res: map[9][10].t };
  `));
  expect(res.G).toBe(40);            // loadSave restored the saved grid size
  expect(res.rows).toBe(40);
  expect(res.road).toBe('road');     // and the city itself
  expect(res.res).toBe('res');
});
