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
