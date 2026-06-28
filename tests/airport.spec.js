import { test, expect } from './harness.js';
import { inPage } from './citybuild.js';

// The airport is a 5×2 (rotatable) building. Its tall parts — terminal, control
// tower, parked jets — sit at the back of the footprint, so stamping the whole
// thing on the single view-bottom tile makes those parts paint over neighbours
// standing in front of them. The fix dispatches each tall part from the grid
// cell it actually stands on, and leaves only the flat runway on the front tile.
// We assert the *consequence*: a real frame dispatches each part once, from more
// than one distinct cell, and at least one tall part is behind the front tile
// (so a neighbour in front of it can occlude it).
test('airport dispatches its tall parts per-tile, not stamped on one tile', async ({ game }) => {
  const res = await game.eval(inPage(`
    resetGrid();
    const bx=10, by=10, fw=5, fh=2;
    const root=set(bx,by,'airport');
    root.grp=[bx,by]; root.part=false; root.fw=fw; root.fh=fh; root.pw=true; root.road=true;
    for (let yy=by; yy<by+fh; yy++) for (let xx=bx; xx<bx+fw; xx++){
      if (xx===bx && yy===by) continue;
      const c=set(xx,yy,'airport'); c.grp=[bx,by]; c.part=true;
    }

    // spy on the per-phase dispatch (phase is the 8th arg of drawAirport)
    const calls=[]; const orig=window.drawAirport;
    window.drawAirport=function(){ calls.push(arguments[7]); return orig.apply(this,arguments); };

    function centerFit(zoom){
      const W=window.innerWidth, H=window.innerHeight;
      S.zoom=zoom; S.ox=W/2; S.oy=H/2;
      const [sx,sy]=tileScreen(bx+(fw>>1), by+(fh>>1));
      S.ox+=W/2-sx; S.oy+=H/2-(sy+TH/2*S.zoom);
    }

    // replicate render()'s per-cell mapping so we can reason about depth order
    function partCells(){
      const along=fw>=fh, cxg=bx+fw/2, cyg=by+fh/2;
      let fX=-1,fY=-1,best=-1;                                   // view-bottom (front) tile
      for (let yy=by; yy<by+fh; yy++) for (let xx=bx; xx<bx+fw; xx++){
        const [vx,vy]=g2v(xx,yy); if (vx+vy>best){ best=vx+vy; fX=xx; fY=yy; }
      }
      const parts=airportParts(fw,fh).map(p=>{
        const gx=along?cxg+p.du:cxg-p.dv, gy=along?cyg+p.dv:cyg+p.du;
        const x=Math.min(bx+fw-1,Math.max(bx,Math.floor(gx)));
        const y=Math.min(by+fh-1,Math.max(by,Math.floor(gy)));
        return { k:p.k, x, y, onFront: x===fX && y===fY };
      });
      return { front:[fX,fY], parts };
    }

    const perRot=[];
    for (let rot=0; rot<4; rot++){
      S.rot=rot;
      calls.length=0;
      centerFit(0.6);
      render(performance.now());
      perRot.push({ rot, phases:calls.slice(), ...partCells() });
    }
    window.drawAirport=orig;
    return perRot;
  `));

  for (const r of res){
    const count=(p)=> r.phases.filter(x=>x===p).length;
    // the flat runway is painted per-tile (one clipped slice per footprint tile),
    // not stamped once on a single late tile, so it depth-sorts against neighbours
    expect(count('ground')).toBe(10);                // 5×2 footprint
    // each tall part is dispatched once, from the cell it stands on
    expect(count('terminal')).toBe(1);
    expect(count('tower')).toBe(1);
    expect(count('jet1')).toBe(1);
    expect(count('jet2')).toBe(1);
    // never stamped as one undivided 'all' draw on a single tile
    expect(r.phases.includes('all')).toBe(false);
    // the tall parts spread over more than one grid cell, so they depth-sort apart
    const distinct=new Set(r.parts.map(p=>p.x+','+p.y));
    expect(distinct.size).toBeGreaterThan(1);
  }
  // in at least one rotation a building (terminal/tower) sits behind the front
  // tile — i.e. a neighbour in front of it now paints over it, the bug we fixed.
  const fixed=res.some(r=> r.parts.some(p=> (p.k==='terminal'||p.k==='tower') && !p.onFront));
  expect(fixed).toBe(true);
  expect(await game.errors()).toEqual([]);
});
