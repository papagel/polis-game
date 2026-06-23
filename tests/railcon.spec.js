import { test, expect } from './harness.js';
import fs from 'node:fs';

// THROWAWAY: render rail<->station connection cases for visual inspection.
const OUT = new URL('./test-results/', import.meta.url).pathname;

test('rail station connection cases', async ({ game, page }) => {
  test.setTimeout(120000);

  await game.eval(() => {
    // start from a blank grass map
    for (let y=0;y<G;y++) for (let x=0;x<G;x++){
      const c=map[y][x]; c.t='grass'; c.lv=0; c.dev=0; c.bld=0; c.bus=false;
      c.rz=null; c.rail=false; c.grp=null; c.part=false; c.bridge=false;
      c.vary=0.5;
    }
    S.started=true;

    const stationAt=(x,y)=>{ map[y][x].t='rstation'; };
    const railLine=(x,y,dx,dy,n)=>{ for(let i=0;i<n;i++){ const cx2=x+dx*i, cy2=y+dy*i; if(inB(cx2,cy2)) map[cy2][cx2].rail=true; } };

    // Case A: station with single rail to +x (down-right)
    stationAt(6,6);  railLine(7,6,1,0,4);
    // Case B: station with single rail to +y (down-left)
    stationAt(14,6); railLine(14,7,0,1,4);
    // Case C: station with single rail to -x (up-left)
    stationAt(22,6); railLine(21,6,-1,0,4);
    // Case D: station with single rail to -y (up-right)
    stationAt(6,14); railLine(6,13,0,-1,4);
    // Case E: through station (rail on +x and -x)
    stationAt(14,14); railLine(11,14,1,0,3); railLine(15,14,1,0,3);
    // Case F: corner station (rail on +x and +y)
    stationAt(22,14); railLine(23,14,1,0,3); railLine(22,15,0,1,3);
    // Case G: through station (rail on +y and -y)
    stationAt(6,22); railLine(6,19,0,1,3); railLine(6,23,0,1,3);
    // Case H: station mid-line on a long straight that turns
    stationAt(16,22); railLine(13,22,1,0,3); railLine(17,22,1,0,2); railLine(19,22,0,1,3);

    recomputeNets(); recomputeFields();
  });

  // render each case centered
  const cases = [
    ['A_single_px', 6.7,6], ['B_single_py',14,6.7], ['C_single_mx',22,6], ['D_single_my',6,14],
    ['E_through_x',14,14], ['F_corner',22,14.6], ['G_through_y',6,22], ['H_midline_turn',16,22],
  ];
  fs.mkdirSync(OUT, { recursive: true });
  await page.evaluate(() => { const el=document.getElementById('intro'); if(el) el.style.display='none'; });
  for (const [name,gx,gy] of cases){
    await game.eval(({gx,gy})=>{
      const W=window.innerWidth, H=window.innerHeight;
      S.zoom=4.2; S.rot=0; S.ox=W/2; S.oy=H/2;
      const [sx,sy]=tileScreen(gx,gy);
      S.ox += W/2-sx; S.oy += H/2-(sy+TH/2*S.zoom);
      PERF.gnd=false; render(performance.now()); render(performance.now());
    },{gx,gy});
    await page.locator('#c').screenshot({ path: OUT + 'rc-'+name+'.png' });
  }
  expect(1).toBe(1);
});
