import { test, expect } from './harness.js';
import { inPage } from './citybuild.js';

// The hover/inspect tooltip must name the structure the player actually SEES under the cursor,
// not the flat lot the cursor's ground ray lands on. A tall building drawn from a tile *in
// front* visually covers the lots behind it, so the naive toGrid() projection reports the wrong
// thing. pickTile() instead paints an off-screen id-buffer (the renderer's own ground+structure
// passes, every fill forced to a per-cell id colour) and reads the pixel under the cursor — so
// it returns exactly the cell whose drawn pixels you're pointing at. These guard that invariant.

test('pickTile reports the building you see, not the lot behind it', async ({ game }) => {
  const res = await game.eval(inPage(`
    setWorldSize(40);
    for (let y=0;y<G;y++){ map[y]=[]; for (let x=0;x<G;x++) map[y][x]=blankCell(); }
    recomputeNets(); recomputeFields();
    S.rot=0; S.zoom=1;
    const bx=20, by=20;
    const c=map[by][bx];
    c.t='monument'; c.vary=0.5; c.pw=1; c.wt=1;            // a tall, single-tile landmark

    // centre the camera on the tile so its full body sits inside the canvas
    const W=cv.width/DPR, H=cv.height/DPR;
    let s=tileScreen(bx,by);
    S.ox += W/2 - s[0]; S.oy += H/2 - s[1];
    s=tileScreen(bx,by);
    const sx=s[0], cyp=s[1] + TH/2*S.zoom;                 // ground centre of the tile

    // walk up the facade: somewhere above the lot's own diamond the FLAT projection lands on a
    // tile behind, yet the pixel is painted by the monument — pickTile must still return (bx,by)
    let found=false, anyFlatDiff=false, sample=null;
    for (let up=14; up<=110; up+=3){
      const fg=toGrid(sx, cyp-up);
      const flatDiff = !(fg[0]===bx && fg[1]===by);
      if (flatDiff) anyFlatDiff=true;
      const pk=pickTile(sx, cyp-up);
      const pickIsTile = pk[0]===bx && pk[1]===by;
      if (flatDiff && pickIsTile){ found=true; sample={up, fg, pk}; break; }
    }
    const onBase=pickTile(sx, cyp-2);                       // the base still resolves to the tile
    return { bx, by, found, anyFlatDiff, sample, onBase };
  `));
  expect(res.anyFlatDiff).toBe(true);                       // the facade does rise above the lot's diamond
  expect(res.found).toBe(true);                             // and the covered pixel picks the monument, not the tile behind
  expect(res.onBase).toEqual([res.bx, res.by]);
  expect(game.errors()).toEqual([]);
});

test('pickTile falls back to the flat tile over open ground', async ({ game }) => {
  const res = await game.eval(inPage(`
    setWorldSize(40);
    for (let y=0;y<G;y++){ map[y]=[]; for (let x=0;x<G;x++) map[y][x]=blankCell(); }
    recomputeNets(); recomputeFields();
    S.rot=0; S.zoom=1;
    const bx=18, by=22;
    const W=cv.width/DPR, H=cv.height/DPR;
    let s=tileScreen(bx,by);
    S.ox += W/2 - s[0]; S.oy += H/2 - s[1];
    s=tileScreen(bx,by);
    const sx=s[0], cy=s[1] + TH/2*S.zoom;                  // dead centre of a grass tile
    const pk=pickTile(sx, cy), fg=toGrid(sx, cy);
    return { pk, fg };
  `));
  expect(res.pk).toEqual(res.fg);                           // nothing is built → the visible pixel is the ground tile
  expect(game.errors()).toEqual([]);
});
