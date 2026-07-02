import { test, expect } from './harness.js';
import { inPage } from './citybuild.js';

// commitPending() coalesces the per-tile recomputeNets/recomputeFields that place()
// triggers into ONE rebuild for the whole drag (NET_DEFER/RF_DEFER). These assert the
// consequence: the flush really runs (a lot at the far end of a dragged road is
// powered the moment the gesture commits) and the expensive passes run once, not per tile.

test('a dragged road commits in one network pass and the far lot is live immediately', async ({ game }) => {
  const res = await game.eval(inPage(`
    resetGrid(); S.started = true; S.money = 1e9;
    set(5, 21, 'power'); set(6, 21, 'pump');
    const lot = set(35, 19, 'res'); lot.lv = 1; lot.dev = 40;
    // real gesture path: marquee from (5,20) to (35,20), then commit
    S.tool = 'road';
    // count the EXPENSIVE inner pass (deferred calls return before reaching it)
    const _rp = recomputePower;
    let powerRuns = 0;
    recomputePower = function(){ powerRuns++; return _rp.apply(this, arguments); };
    pend = { a:[5,20], b:[35,20] };
    commitPending();
    recomputePower = _rp;
    const roadOk = map[20][5].t === 'road' && map[20][35].t === 'road';
    return { powerRuns, roadOk, pw: map[19][35].pw, wt: map[19][35].wt };
  `));
  expect(res.roadOk).toBe(true);
  expect(res.powerRuns).toBe(1);   // one flood-fill for the whole 31-tile drag, not 31
  expect(res.pw).toBe(true);       // …and the flush really happened: the far lot is powered
  expect(res.wt).toBe(true);
});

test('a deferred flush leaves the same network state as tile-by-tile placement', async ({ game }) => {
  const res = await game.eval(inPage(`
    const snapshot = () => {
      let pw = 0, wt = 0;
      for (let y=0;y<G;y++) for (let x=0;x<G;x++){ if (map[y][x].pw) pw++; if (map[y][x].wt) wt++; }
      return pw + '|' + wt + '|' + S.powerUse + '|' + S.waterUse;
    };
    const buildCity = (viaDrag) => {
      resetGrid(); S.started = true; S.money = 1e9;
      set(5, 21, 'power'); set(6, 21, 'pump');
      for (let x=10; x<=30; x++){ const c = set(x, 19, 'res'); c.lv = 2; c.dev = 150; }
      S.tool = 'road';
      if (viaDrag){ pend = { a:[5,20], b:[30,20] }; commitPending(); }
      else { for (let x=5; x<=30; x++) place(x, 20, true); }
      return snapshot();
    };
    return { drag: buildCity(true), single: buildCity(false) };
  `));
  expect(res.drag).toBe(res.single);
});
