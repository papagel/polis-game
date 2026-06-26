import { test, expect } from './harness.js';
import { inPage, HELPERS } from './citybuild.js';

// like inPage(), but the body runs in an async IIFE so it can await real timers (the paint hold)
const inPageAsync = (body) => new Function(`${HELPERS}\nreturn (async function(){ ${body} })();`);

// One-finger pan with a build tool active (mobile). The rule: a touch gesture starts UNDECIDED — a
// drag past MOVE_PAN px pans the map and builds NOTHING; a single tool places only on a tap; a paint
// tool only starts drawing after a short hold (HOLD_DRAW_MS), so a plain swipe always scrolls. These
// tests drive real synthetic PointerEvents through the canvas listeners (pointerType:'touch').

// shared page-side setup + a tile<->canvas-pixel mapping that round-trips through toGrid
const SETUP = `
  resetGrid(); S.started = true; S.money = 1e9;
  function tilePx(gx,gy){ const [vx,vy]=rotC(gx+0.5,gy+0.5); const [sx,sy]=toScreen(vx-0.5,vy-0.5); return [sx, sy+TH/2*S.zoom]; }
  // find a tile whose pixel centre inverts back to it (and whose right neighbour does too)
  let T=null;
  for (let gy=6; gy<13 && !T; gy++) for (let gx=6; gx<13; gx++){
    const [px,py]=tilePx(gx,gy); const g=toGrid(px,py);
    const [px2,py2]=tilePx(gx+1,gy); const g2=toGrid(px2,py2);
    const [px3,py3]=tilePx(gx+1,gy+1); const g3=toGrid(px3,py3);
    if (g[0]===gx&&g[1]===gy&&inB(gx,gy) && g2[0]===gx+1&&g2[1]===gy&&inB(gx+1,gy)
        && g3[0]===gx+1&&g3[1]===gy+1&&inB(gx+1,gy+1)){ T={gx,gy,px,py,px2,py2,px3,py3}; break; }
  }
  const r = cv.getBoundingClientRect();
  function pe(type, px, py){ cv.dispatchEvent(new PointerEvent(type, { pointerId:1, pointerType:'touch', button:0, clientX:r.left+px, clientY:r.top+py, bubbles:true })); }
`;

test('single-placement tool: a one-finger drag pans the map and builds nothing', async ({ game }) => {
  const res = await game.eval(inPage(`
    ${SETUP}
    S.tool = 'police';
    const ox0 = S.ox, money0 = S.money, t0 = map[T.gy][T.gx].t;
    pe('pointerdown', T.px, T.py);
    pe('pointermove', T.px+30, T.py);     // 30px > MOVE_PAN ⇒ this is a pan, not a tap-place
    pe('pointerup',   T.px+30, T.py);
    return { panned: Math.abs(S.ox-ox0) > 10, built: map[T.gy][T.gx].t!==t0, spent: money0-S.money };
  `));
  expect(res.panned).toBe(true);    // the map scrolled…
  expect(res.built).toBe(false);    // …and nothing was placed under the finger
  expect(res.spent).toBe(0);
});

test('single-placement tool: a tap (no drag) still places the building', async ({ game }) => {
  const res = await game.eval(inPage(`
    ${SETUP}
    S.tool = 'police';
    const money0 = S.money, t0 = map[T.gy][T.gx].t;
    pe('pointerdown', T.px, T.py);
    pe('pointerup',   T.px, T.py);        // same spot ⇒ a tap
    return { built: map[T.gy][T.gx].t!==t0, spent: money0-S.money };
  `));
  expect(res.built).toBe(true);     // a tap places…
  expect(res.spent).toBeGreaterThan(0);
});

test('paint tool: a one-finger swipe (no hold) pans instead of painting', async ({ game }) => {
  const res = await game.eval(inPage(`
    ${SETUP}
    S.tool = 'road';
    const ox0 = S.ox, t0 = map[T.gy][T.gx].t;
    pe('pointerdown', T.px, T.py);
    pe('pointermove', T.px+30, T.py);     // moved before the hold fires ⇒ pan, no road
    pe('pointerup',   T.px+30, T.py);
    return { panned: Math.abs(S.ox-ox0) > 10, built: map[T.gy][T.gx].t!==t0 };
  `));
  expect(res.panned).toBe(true);
  expect(res.built).toBe(false);    // a swipe never lays road
});

test('paint tool: hold-then-drag draws (the hold arms drawing)', async ({ game }) => {
  const res = await game.eval(inPageAsync(`
    ${SETUP}
    S.tool = 'road';
    const ox0 = S.ox;
    pe('pointerdown', T.px, T.py);
    await new Promise(r=>setTimeout(r, 200));   // hold past HOLD_DRAW_MS ⇒ drawing arms here
    pe('pointermove', T.px2, T.py2);            // then drag to the neighbour tile
    pe('pointerup',   T.px2, T.py2);
    return { paved: !!ROADTYPE[map[T.gy][T.gx].t] && !!ROADTYPE[map[T.gy][T.gx+1].t], ox: S.ox, ox0 };
  `));
  expect(res.paved).toBe(true);     // both held tile and the dragged tile are road
});

test('zone tool: hold-then-drag paints the whole multi-tile rectangle', async ({ game }) => {
  const res = await game.eval(inPageAsync(`
    ${SETUP}
    S.tool = 'res';
    pe('pointerdown', T.px, T.py);
    await new Promise(r=>setTimeout(r, 200));   // hold arms drawing
    pe('pointermove', T.px3, T.py3);            // drag to the diagonal ⇒ a 2×2 marquee
    pe('pointerup',   T.px3, T.py3);
    const isRes = (x,y)=>map[y][x].t==='res';
    return { full: isRes(T.gx,T.gy) && isRes(T.gx+1,T.gy) && isRes(T.gx,T.gy+1) && isRes(T.gx+1,T.gy+1) };
  `));
  expect(res.full).toBe(true);      // every tile in the dragged rectangle is zoned
});
