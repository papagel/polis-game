import { test, expect } from './harness.js';
import { inPage } from './citybuild.js';

// Undo/redo: beginAction/endAction snapshot the touched cells + money, doUndo/doRedo
// swap them back. These assert the real invariants — exact cell payload restoration,
// money restoration, and the redo stack clearing on a new action.

const BUILD = `
  resetGrid(); S.started = true; S.money = 10000;
  S.tool = 'road';
  const snap = (x,y) => JSON.stringify(snapCell(x,y).cell);
`;

test('undo restores the exact cell payload and the money spent', async ({ game }) => {
  const r = await game.eval(inPage(`
    ${BUILD}
    const before = snap(10, 10), m0 = S.money;
    beginAction(); place(10, 10, true); endAction();
    const built = snap(10, 10), m1 = S.money;
    doUndo();
    return { before, built, after: snap(10, 10), m0, m1, m2: S.money,
             t: map[10][10].t };
  `));
  expect(r.built).not.toBe(r.before);   // the road really landed
  expect(r.m1).toBeLessThan(r.m0);      // and cost money
  expect(r.after).toBe(r.before);       // undo restored the identical payload
  expect(r.m2).toBe(r.m0);              // including the treasury
  expect(r.t).toBe('grass');
});

test('redo replays the action; a fresh action clears the redo stack', async ({ game }) => {
  const r = await game.eval(inPage(`
    ${BUILD}
    beginAction(); place(10, 10, true); endAction();
    doUndo();
    doRedo();
    const redone = map[10][10].t === 'road';
    // a NEW action after undo must clear redo (no branching timelines)
    doUndo();
    beginAction(); place(12, 12, true); endAction();
    return { redone, redoLeft: redoStack.length, undoLeft: undoStack.length };
  `));
  expect(r.redone).toBe(true);
  expect(r.redoLeft).toBe(0);
  expect(r.undoLeft).toBeGreaterThan(0);
});

test('undo of a bulldozed 2x2 tower restores the whole merged block', async ({ game }) => {
  const r = await game.eval(inPage(`
    resetGrid(); S.started = true; S.money = 1e6;
    hroad(20, 8, 16); set(8, 21, 'power'); set(9, 21, 'pump');
    // hand-build a merged 2×2 residential tower rooted at (10,18)
    for (const [qx,qy] of [[10,18],[11,18],[10,19],[11,19]]){
      const c = set(qx, qy, 'res');
      c.lv = 4; c.dev = 400; c.grp = [10,18]; c.part = !(qx===10 && qy===18); c.vary = 0.4;
    }
    map[18][10].fw = 2; map[18][10].fh = 2;
    recomputeNets(); recomputeFields();
    const popBefore = (() => { let p=0; for (let y=0;y<G;y++) for (let x=0;x<G;x++) if (map[y][x].t==='res') p+=CAP.res[map[y][x].lv]||0; return p; })();
    S.tool = 'bulldoze';
    beginAction(); place(10, 18, true); endAction();
    const cleared = map[18][10].t === 'grass' && !map[18][10].grp;
    doUndo();
    const c0 = map[18][10], c1 = map[19][11];
    const popAfter = (() => { let p=0; for (let y=0;y<G;y++) for (let x=0;x<G;x++) if (map[y][x].t==='res') p+=CAP.res[map[y][x].lv]||0; return p; })();
    return { cleared, rootBack: c0.t==='res' && c0.lv===4 && !!c0.grp && !c0.part,
             partBack: c1.t==='res' && c1.part && c1.grp && c1.grp[0]===10 && c1.grp[1]===18,
             popBefore, popAfter };
  `));
  expect(r.cleared).toBe(true);        // the bulldoze really flattened the block
  expect(r.rootBack).toBe(true);       // undo restored the root cell
  expect(r.partBack).toBe(true);       // …and the part cells pointing at it
  expect(r.popAfter).toBe(r.popBefore);
});

test('terraform edits join the same undo timeline', async ({ game }) => {
  const r = await game.eval(inPage(`
    resetGrid(); S.started = true; S.money = 1e6;
    S.tool = 'raise';
    beginAction(); place(15, 15, true); endAction();
    ensureEHAND();
    const raised = Array.from(EHAND).some(v => v !== 0);
    doUndo();
    const flatAgain = !Array.from(EHAND).some(v => v !== 0);
    return { raised, flatAgain };
  `));
  expect(r.raised).toBe(true);
  expect(r.flatAgain).toBe(true);
});
