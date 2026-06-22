import { test, expect } from './harness.js';
import fs from 'node:fs';

// THROWAWAY render-LOD validation. The LOD is confined to the giant world (G>110) at deep zoom.
// Test 1 confirms a normal 96² city zoomed out keeps FULL DETAIL (LOD never engages, no boxes).
// Test 2 confirms the 128² whole-map survey still gets the LOD speedup at its deepest zoom.
// Run: `npx playwright test lod.spec.js`.

const OUT = new URL('./test-results/', import.meta.url).pathname;

test('96x96 zoomed out keeps full detail (LOD never engages)', async ({ game, page }) => {
  test.setTimeout(120000);

  const m = await game.eval(() => {
    loadSave(EXAMPLE_CITY3); S.started=true; recomputeNets(); recomputeFields();
    shoreDirty=true; elevDirty=true;
    const W=window.innerWidth, H=window.innerHeight;
    S.zoom=0.24; S.rot=0; S.ox=W/2; S.oy=H/2;   // a normal zoom-out on COLOSSAL; min-zoom floor keeps it ≥0.219
    const [sx,sy]=tileScreen(G>>1,G>>1); S.ox+=W/2-sx; S.oy+=H/2-(sy+TH/2*S.zoom);
    PERF.spr=true; PERF.gnd=true; SPR_INTERACT=false;

    const N=30;
    const timeNow=()=>{ render(performance.now()); render(performance.now()); const t0=performance.now(); for(let i=0;i<N;i++) render(performance.now()); return (performance.now()-t0)/N; };
    PERF.lod=false; const off=timeNow();
    PERF.lod=true;  const on =timeNow();
    return { off, on, zoom:S.zoom, G };
  });

  console.log('\n================ 96² ZOOM-OUT (ms/frame) ================');
  console.log(`  G=${m.G}, zoom=${m.zoom}`);
  console.log(`  lod flag off : ${m.off.toFixed(2)} ms`);
  console.log(`  lod flag on  : ${m.on.toFixed(2)} ms   (should match — LOD is gated to G>110)`);
  console.log('=========================================================\n');

  fs.mkdirSync(OUT, { recursive: true });
  await page.evaluate(() => { document.getElementById('intro').style.display='none'; PERF.lod=true; render(performance.now()); render(performance.now()); });
  await page.locator('#c').screenshot({ path: OUT + 'lod-96-detail.png' });

  expect(Math.abs(m.on-m.off)/m.off).toBeLessThan(0.25);   // LOD must NOT engage on 96² → full detail, same cost
});

test('128x128 BOUNDLESS render cost with LOD', async ({ game, page }) => {
  test.setTimeout(120000);
  const m = await game.eval(() => {
    setWorldSize(128);
    for (let y=0;y<G;y++){ map[y]=[]; for (let x=0;x<G;x++) map[y][x]=blankCell(); }
    for (let y=0;y<G;y++) for (let x=0;x<G;x++){
      const c=map[y][x];
      if (y%5===0||x%5===0){ c.t='road'; }
      else { const r=(x*7+y*3)%5; c.t=r<3?'res':(r<4?'com':'ind'); c.lv=4; c.dev=400; }
    }
    S.started=true; recomputeNets(); recomputeFields(); shoreDirty=true; elevDirty=true;
    const W=window.innerWidth, H=window.innerHeight;
    S.rot=0; const fit=()=>{ S.ox=W/2; S.oy=H/2; const [sx,sy]=tileScreen(G>>1,G>>1); S.ox=W/2+(W/2-sx); S.oy=H/2+(H/2-(sy+TH/2*S.zoom)); };
    PERF.spr=true; PERF.gnd=true; SPR_INTERACT=false;
    const N=20;
    // measure lod off vs on WITHOUT changing zoom between them, so the ground cache stays warm & valid
    const timeN=()=>{ for(let i=0;i<5;i++) render(performance.now()); const t0=performance.now(); for(let i=0;i<N;i++) render(performance.now()); return (performance.now()-t0)/N; };
    let dev=0; for(let y=0;y<G;y++)for(let x=0;x<G;x++){ const c=map[y][x]; if(ZONE[c.t]&&c.lv>0) dev++; }
    S.zoom=0.16; fit();                         // whole-map (only reachable now that min-zoom scales with G)
    PERF.lod=false; const wholeOff=timeN();
    PERF.lod=true;  const wholeOn =timeN();
    S.zoom=0.55; fit();                         // play-zoom (LOD inactive here by design)
    PERF.lod=false; const play=timeN();
    return { wholeOn, wholeOff, play, dev };
  });
  console.log('\n================ 128x128 RENDER (ms/frame) ================');
  console.log(`  devLots=${m.dev}`);
  console.log(`  whole-map z0.16 : lod off ${m.wholeOff.toFixed(1)} ms · lod on ${m.wholeOn.toFixed(1)} ms   (${(100*(m.wholeOff-m.wholeOn)/m.wholeOff).toFixed(0)}% faster)`);
  console.log(`  play-zoom z0.55 : ${m.play.toFixed(1)} ms (LOD off above 0.38)`);
  console.log('===========================================================\n');
  fs.mkdirSync(OUT, { recursive: true });
  await page.evaluate(() => { const i=document.getElementById('intro'); if(i) i.style.display='none'; S.zoom=0.16; const W=innerWidth,H=innerHeight; S.ox=W/2;S.oy=H/2; const [sx,sy]=tileScreen(G>>1,G>>1); S.ox=W/2+(W/2-sx); S.oy=H/2+(H/2-(sy+TH/2*S.zoom)); PERF.lod=true; render(performance.now()); render(performance.now()); });
  await page.locator('#c').screenshot({ path: OUT + 'lod-128.png' });
  expect(m.wholeOn).toBeLessThan(m.wholeOff);
});
