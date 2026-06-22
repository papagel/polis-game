import { test, expect } from './harness.js';
import fs from 'node:fs';

// THROWAWAY validation for the terrain/ground-cache fixes:
//  1. terraform must invalidate the ground cache (applyElev bumps gndVer) — no "delayed mountain"
//  2. elevated relief (cliffs/tunnels) is drawn live, so the cached frame matches a full live frame
// Run: `npx playwright test elev.spec.js`.

const OUT = new URL('./test-results/', import.meta.url).pathname;

test('terrain edits invalidate the ground cache + relief parity', async ({ game, page }) => {
  test.setTimeout(120000);

  const m = await game.eval(() => {
    loadSave(EXAMPLE_CITY2); S.started = true;

    // carve a natural patch near the middle and sculpt a couple of peaks so we get real cliffs + trees-on-slope
    const cx0 = G>>1, cy0 = G>>1;
    for (let dy=-7; dy<=7; dy++) for (let dx=-7; dx<=7; dx++){
      const x=cx0+dx, y=cy0+dy; if(!inB(x,y)) continue;
      const c=map[y][x]; c.t = ((Math.abs(dx)+Math.abs(dy))%3) ? 'tree' : 'grass';
      c.lv=0; c.dev=0; c.bld=0; c.bus=false; c.rz=null; c.vary=Math.random();
    }
    recomputeNets(); recomputeFields(); recomputeElev();
    for (let k=0;k<9;k++) terraform(cx0,   cy0,   1);
    for (let k=0;k<6;k++) terraform(cx0+3, cy0-3, 1);

    function centerFit(zoom){
      const W=window.innerWidth, H=window.innerHeight;
      S.zoom=zoom; S.rot=0; S.ox=W/2; S.oy=H/2;
      const [sx,sy]=tileScreen(cx0,cy0);
      S.ox += W/2-sx; S.oy += H/2-(sy+TH/2*S.zoom);
    }
    centerFit(0.85);
    PERF.spr = true; SPR_INTERACT = false;

    const grab = () => { render(performance.now()); return cx.getImageData(0,0,cv.width,cv.height).data; };
    const diff = (a,b) => {
      let sum=0, notable=0; const px=a.length/4;
      for (let i=0;i<a.length;i+=4){
        const d=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);
        sum+=d; if (d>=48) notable++;
      }
      return { mean:sum/(px*3), pct:100*notable/px };
    };

    // settle shore/elev under live rendering
    PERF.gnd=false; render(performance.now()); render(performance.now());

    // ---- parity on the hilly scene: cached vs full live ----
    PERF.gnd=false; const live = grab();
    PERF.gnd=true;  render(performance.now()); render(performance.now()); const cached = grab();
    const parity = diff(live, cached);

    // ---- staleness: sculpt a NEW hill with NO recomputeFields/sim tick, only terraform ----
    PERF.gnd=true; render(performance.now()); render(performance.now());
    const before = grab();                               // cached state, pre-edit
    const hx=cx0-5, hy=cy0+5; map[hy][hx].t='grass'; map[hy][hx].lv=0; map[hy][hx].dev=0;
    for (let k=0;k<9;k++) terraform(hx,hy,1);            // terraform -> applyElev -> gndVer++ (the fix)
    const afterCached = grab();                          // cached render AFTER the edit
    PERF.gnd=false; const afterLive = grab();            // ground truth

    const appeared   = diff(before, afterCached);        // big  => the hill showed up immediately
    const stillMatch = diff(afterCached, afterLive);     // tiny => cache wasn't stale

    return { parity, appeared, stillMatch, errors: 0 };
  });

  console.log('\n================ ELEVATION / GROUND-CACHE VALIDATION ================');
  console.log(`relief parity (cached vs live)   : mean ${m.parity.mean.toFixed(3)}/ch · ${m.parity.pct.toFixed(3)}% pixels differ`);
  console.log(`mountain appeared after edit     : mean ${m.appeared.mean.toFixed(3)}/ch · ${m.appeared.pct.toFixed(3)}% pixels changed`);
  console.log(`cache fresh after edit (vs live) : mean ${m.stillMatch.mean.toFixed(3)}/ch · ${m.stillMatch.pct.toFixed(3)}% pixels differ`);
  console.log('=====================================================================\n');

  // screenshots for eyeballing: live vs cached on the hilly scene (hide the intro overlay first)
  fs.mkdirSync(OUT, { recursive: true });
  await page.evaluate(() => { document.getElementById('intro').style.display='none'; PERF.gnd=false; render(performance.now()); });
  await page.locator('#c').screenshot({ path: OUT + 'elev-live.png' });
  await page.evaluate(() => { PERF.gnd=true; render(performance.now()); render(performance.now()); });
  await page.locator('#c').screenshot({ path: OUT + 'elev-cached.png' });

  // the hill must render immediately after terraform (no delay) ...
  expect(m.appeared.pct).toBeGreaterThan(0.5);
  // ... and the cached frame must agree with the live frame (cliffs occlude correctly, no staleness):
  // the residual diff is just cached-vs-live sub-pixel noise, so it should sit at the parity floor.
  expect(m.stillMatch.pct).toBeLessThan(1.0);
  expect(m.parity.pct).toBeLessThan(1.0);
  expect(m.stillMatch.pct).toBeLessThan(m.appeared.pct);   // edit moved far more pixels than the noise floor
  expect(Math.abs(m.stillMatch.pct - m.parity.pct)).toBeLessThan(0.2);   // cache is as fresh post-edit as a clean bake
});
