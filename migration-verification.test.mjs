import test from "node:test";
import assert from "node:assert/strict";
import { buildLegacyMigrationPlan } from "./migration-plan.js";
import { verifyMigrationPlan } from "./migration-verification.js";

const sample = () => buildLegacyMigrationPlan({
  openingBalance: 50,
  members: [{ name: "A", amount: 100, totalFee: 300,
    payments: [{ amount: 25, type: "Renewal" }],
    renewals: [{ fee: 200, paidAmount: 25 }] }],
  expenses: [{ title: "Rent", amount: 10 }]
});

test("verifies counts and keeps renewal paid amount informational", () => {
  const result = verifyMigrationPlan(sample());
  assert.equal(result.operationCount, 5);
  assert.equal(result.paymentLedgerTotal, 125);
  assert.equal(result.expenseTotal, 10);
  assert.equal(result.renewalPaidAmountInformationalOnly, 25);
});

test("rejects duplicate document IDs", () => {
  const plan = sample();
  plan.operations.push({ ...plan.operations[0] });
  assert.throws(() => verifyMigrationPlan(plan), /Duplicate/);
});

test("rejects collection count mismatch", () => {
  const plan = sample();
  plan.collectionCounts.members = 9;
  assert.throws(() => verifyMigrationPlan(plan), /count mismatch/i);
});

test("rejects negative and non-finite amounts", () => {
  const plan = sample();
  plan.operations[0].data.amount = -1;
  assert.throws(() => verifyMigrationPlan(plan), /Invalid amount/);
});

test("requires read-only, source-preserving owner-confirmed plan", () => {
  const plan = sample();
  plan.sourcePreserved = false;
  assert.throws(() => verifyMigrationPlan(plan));
});
