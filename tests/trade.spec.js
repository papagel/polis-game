import { test, expect } from './harness.js';
import { inPage } from './citybuild.js';

// Goods & trade: industry manufactures goods, homes/shops consume them. A surplus
// is EXPORTED for income, a deficit is IMPORTED at a cost — throughput-gated by
// seaports/airports. GDP is a derived headline (annualised value added) that must
// stay OUT of the budget loop. We assert *direction* and *monotonicity*, not
// magnitudes, so honest balance tuning of the GOODS_/TRADE_ tables stays green.

// Build a served block of `type` lots, optionally with a powered, road-connected
// seaport, tick a few days so pop/jobs settle, then return the live budget parts.
const budgetFor = (type, withPort, ports = 1) => inPage(`
  resetGrid();
  hroad(20, 6, 26);
  set(6, 21, 'power');
  set(7, 21, 'pump');
  for (let x = 10; x <= 24; x++){ const c = set(x, 19, '${type}'); c.lv = 3; c.dev = 300; }
  if (${withPort}){
    // one or more docks just below the powered road row — connected + powered ⇒ a real gateway
    for (let p = 0; p < ${ports}; p++){ const px = 10 + p*3; set(px, 21, 'port'); }
  }
  recomputeNets();
  recomputeFields();
  __seedRng(11);
  for (let i = 0; i < 3; i++) simTick();
  __unseedRng();
  return computeBudget();
`);

test('an industry-heavy city runs a goods surplus and exports it', async ({ game }) => {
  const b = await game.eval(budgetFor('ind', false));
  expect(b.indJ).toBeGreaterThan(0);
  expect(b.goodsNet).toBeGreaterThan(0);   // factories with few mouths to feed ⇒ surplus
  expect(b.exportInc).toBeGreaterThan(0);  // even overland trade earns a little
  expect(b.tradeNet).toBeGreaterThan(0);
});

test('a seaport unlocks far more export income than overland trade alone', async ({ game }) => {
  const noPort = await game.eval(budgetFor('ind', false));
  const withPort = await game.eval(budgetFor('ind', true));
  expect(withPort.tradePorts).toBeGreaterThanOrEqual(1);
  // the same surplus is monetised much more once a gateway can move the freight
  expect(withPort.exportInc).toBeGreaterThan(noPort.exportInc * 1.5);
  expect(withPort.tradeCap).toBeGreaterThan(noPort.tradeCap);
});

test('a residents-only city runs a deficit and pays to import — a port softens the bill', async ({ game }) => {
  const noPort = await game.eval(budgetFor('res', false));
  const withPort = await game.eval(budgetFor('res', true));
  expect(noPort.goodsNet).toBeLessThan(0);    // homes, no factories ⇒ must import
  expect(noPort.importCost).toBeGreaterThan(0);
  expect(noPort.tradeNet).toBeLessThan(0);
  // a gateway carries bulk freight cheaply, so the same deficit costs less to cover
  expect(withPort.importCost).toBeLessThan(noPort.importCost);
});

test('export income is capped so stacking ports cannot print money', async ({ game }) => {
  const b = await game.eval(budgetFor('ind', true, 5));
  expect(b.exportInc).toBeLessThanOrEqual(TRADE_INCOME_CAP_FOR_TEST(b));
});
// the cap is applied before the difficulty/scenario multipliers, so the ceiling is
// TRADE_INCOME_CAP × dInc (normal play: ×1, no km ramp outside Kobayashi Maru).
function TRADE_INCOME_CAP_FOR_TEST(b){ return 2400 * b.dInc + 1; }

test('GDP is anchored to the tax base — tax income is exactly tax% of (non-tourism) GDP', async ({ game }) => {
  // the re-anchoring guarantee: GDP/yr = (pop·26 + jobs·36 + tourism)·12, and the tax
  // formula levies tax% on that same pop·26 + jobs·36 base. With no airport (tourism=0),
  // pre-difficulty tax income must equal exactly tax% of GDP/12. Catches any drift between
  // the GDP weights and the resTax/jobTax coefficients.
  const b = await game.eval(budgetFor('ind', false));
  const taxBase = b.resTax + b.jobTax;                 // pre-difficulty tax on production
  const expected = (b.tax / 100) * (b.gdp / 12);       // tourism is 0 here, so GDP/12 == the taxed base
  expect(Math.abs(taxBase - expected)).toBeLessThan(1e-3);
});

test('GDP is positive and scales with the size of the economy', async ({ game }) => {
  const small = await game.eval(inPage(`
    resetGrid(); hroad(20, 6, 16); set(6,21,'power'); set(7,21,'pump');
    for (let x=10;x<=12;x++){ const c=set(x,19,'ind'); c.lv=3; c.dev=300; }
    recomputeNets(); recomputeFields();
    __seedRng(3); for (let i=0;i<3;i++) simTick(); __unseedRng();
    return computeBudget();
  `));
  const big = await game.eval(inPage(`
    resetGrid(); hroad(20, 6, 26); set(6,21,'power'); set(7,21,'pump');
    for (let x=10;x<=24;x++){ const c=set(x,19,'ind'); c.lv=3; c.dev=300; }
    recomputeNets(); recomputeFields();
    __seedRng(3); for (let i=0;i<3;i++) simTick(); __unseedRng();
    return computeBudget();
  `));
  expect(small.gdp).toBeGreaterThan(0);
  expect(big.gdp).toBeGreaterThan(small.gdp);   // more jobs ⇒ more value added
});
