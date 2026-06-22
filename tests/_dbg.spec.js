import { test, expect } from './harness.js';
import { inPage } from './citybuild.js';

test('dbg', async ({ game }) => {
  const res = await game.eval(inPage(`
    setWorldSize(40);
    for (let y=0;y<G;y++){ map[y]=[]; for (let x=0;x<G;x++) map[y][x]=blankCell(); }
    recomputeNets(); recomputeFields();
    S.rot=0; S.zoom=1;
    const bx=20, by=20;
    const c=map[by][bx];
    c.t='monument'; c.vary=0.5; c.pw=1; c.wt=1;
    const W=cv.width/DPR, H=cv.height/DPR;
    let s=tileScreen(bx,by);
    S.ox += W/2 - s[0]; S.oy += H/2 - s[1];
    s=tileScreen(bx,by);
    const sx=s[0], cyp=s[1] + TH/2*S.zoom;
    buildPickBuffer();
    const g=pickCv.getContext('2d');
    // scan a vertical column above the base; report decoded id per 4px
    const col=[];
    for (let up=-4; up<=120; up+=4){
      const dx=Math.round(sx*DPR), dy=Math.round((cyp-up)*DPR);
      const d=g.getImageData(dx,dy,1,1).data;
      const v=(d[0]|(d[1]<<8)|(d[2]<<16))-1;
      let cell=null; if(v>=0&&v<G*G) cell=[v%G,(v/G)|0];
      col.push({up, a:d[3], v, cell, fg:toGrid(sx,cyp-up)});
    }
    const want = by*G+bx;
    return { sx, cyp, W, H, cw:cv.width, ch:cv.height, DPR, want, col };
  `));
  console.log(JSON.stringify(res, null, 1));
  expect(true).toBe(true);
});
