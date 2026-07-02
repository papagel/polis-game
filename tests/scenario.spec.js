import { test, expect } from './harness.js';
import { inPage } from './citybuild.js';

// Scenarios: a goal + deadline evaluated monthly by scenarioTick(). Assert the win pays
// and clears, the hold-condition really demands CONSECUTIVE months, the deadline fails,
// and the active scenario survives a save round-trip.

test('meeting a scenario goal pays the reward and ends the scenario', async ({ game }) => {
  const r = await game.eval(inPage(`
    resetGrid(); S.started = true; S.money = 5000;
    S.scen = { id: 'first', sd: 0, hm: 0 }; S.day = 90;
    S.pop = 3000; S.happy = 70;                       // First Steps: 2,500 residents, mood ≥ 60
    scenarioTick();
    const win = { money: S.money, over: S.scen === null,
                  modal: document.getElementById('scenModal').classList.contains('open') };
    document.getElementById('scenModal').classList.remove('open');
    return win;
  `));
  expect(r.money).toBe(30000);   // §25,000 council reward landed
  expect(r.over).toBe(true);     // the scenario cleared
  expect(r.modal).toBe(true);    // and the player was told
});

test('a hold-condition scenario demands CONSECUTIVE months — a single blackout resets it', async ({ game }) => {
  const r = await game.eval(inPage(`
    resetGrid(); S.started = true; S.money = 0;
    // Blackout: 195k residents fully powered, hold 12 months. Empty map → 0 unpowered lots,
    // so the check is purely the pop figure here.
    S.scen = { id: 'blackout', sd: 0, hm: 0 }; S.day = 30;
    S.pop = 200000;
    for (let i = 0; i < 5; i++) scenarioTick();       // 5 good months
    const heldAt5 = S.scen.hm;
    S.pop = 1000; scenarioTick();                     // one bad month
    const afterSlip = S.scen.hm;
    S.pop = 200000;
    for (let i = 0; i < 11; i++) scenarioTick();      // 11 good months — not enough after the reset
    const stillGoing = !!S.scen;
    scenarioTick();                                   // the 12th consecutive month
    const wonNow = S.scen === null && S.money === 25000;
    document.getElementById('scenModal').classList.remove('open');
    return { heldAt5, afterSlip, stillGoing, wonNow };
  `));
  expect(r.heldAt5).toBe(5);
  expect(r.afterSlip).toBe(0);      // the slip wiped the streak
  expect(r.stillGoing).toBe(true);  // 11 in a row is not 12
  expect(r.wonNow).toBe(true);
});

test('the deadline passing without the goal fails the scenario (and offers a retry)', async ({ game }) => {
  const r = await game.eval(inPage(`
    resetGrid(); S.started = true; S.money = 777;
    S.scen = { id: 'first', sd: 0, hm: 0 };
    S.day = SCEN.first.years * 360 + 1;               // past the deadline
    S.pop = 10; S.happy = 10;                         // goal clearly unmet
    scenarioTick();
    const res = { over: S.scen === null, money: S.money,
                  modal: document.getElementById('scenModal').classList.contains('open'),
                  retryShown: document.getElementById('scenRetry').style.display !== 'none' };
    document.getElementById('scenModal').classList.remove('open');
    return res;
  `));
  expect(r.over).toBe(true);
  expect(r.money).toBe(777);        // no reward for failing
  expect(r.modal).toBe(true);
  expect(r.retryShown).toBe(true);  // the lose modal offers a retry
});

test('an active scenario (with its held months) survives a save round-trip', async ({ game }) => {
  const r = await game.eval(inPage(`
    resetGrid(); S.started = true;
    S.scen = { id: 'blackout', sd: 120, hm: 7 };
    const code = makeSave();
    S.scen = null;
    loadSave(code);
    return S.scen;
  `));
  expect(r).toEqual({ id: 'blackout', sd: 120, hm: 7 });
});

test('starting a fresh-map scenario resets the treasury, clock and undo history', async ({ game }) => {
  const r = await game.eval(inPage(`
    S.money = 999999; S.day = 5000;
    undoStack.push({ before: [], after: [], vb: [], va: [], dMoney: 0 });
    startScenario('first');
    return { scen: S.scen && S.scen.id, day: S.day, money: S.money,
             undo: undoStack.length, size: G };
  `));
  expect(r.scen).toBe('first');
  expect(r.day).toBe(0);
  expect(r.money).toBe(DIFFMONEY_EASY);
  expect(r.undo).toBe(0);
  expect(r.size).toBe(30);            // First Steps plays on a cozy 30×30
});
const DIFFMONEY_EASY = 30000;         // DIFF[0].money — First Steps starts on Easy
