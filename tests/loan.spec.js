import { test, expect } from './harness.js';
import { inPage } from './citybuild.js';

// Loans: takeLoan(P) wires P to the treasury and sets a fixed amortized monthly
// payment; the monthly budget step (inside simTick) services it until the
// balance clears after LOAN_TERM months. Pure accounting — no RNG involved.

test('takeLoan credits the treasury and records the debt', async ({ game }) => {
  const res = await game.eval(inPage(`
    resetGrid();
    S.money = 10000;
    const ok = takeLoan(20000);
    return { ok, money: S.money, hasLoan: !!S.loan, bal: S.loan && S.loan.bal, left: S.loan && S.loan.left };
  `));
  expect(res.ok).toBe(true);
  expect(res.money).toBe(30000);    // 10000 + 20000 principal
  expect(res.hasLoan).toBe(true);
  expect(res.bal).toBe(20000);
  expect(res.left).toBe(24);        // LOAN_TERM
});

test('the loan amortizes to zero and clears after its term', async ({ game }) => {
  const res = await game.eval(inPage(`
    resetGrid();
    S.money = 100000;
    takeLoan(20000);
    // run two years of months (30 days each) so every payment is serviced.
    for (let i=0;i<24*30;i++) simTick();
    return { hasLoan: !!S.loan };
  `));
  expect(res.hasLoan).toBe(false);   // fully repaid, treasury debt-free
});

test('only one loan at a time', async ({ game }) => {
  const res = await game.eval(inPage(`
    resetGrid();
    S.money = 5000;
    const first = takeLoan(8000);
    const second = takeLoan(8000);   // should be refused while one is outstanding
    return { first, second };
  `));
  expect(res.first).toBe(true);
  expect(res.second).toBe(false);
});
