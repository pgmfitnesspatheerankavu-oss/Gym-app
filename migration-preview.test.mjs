import test from "node:test";
import assert from "node:assert/strict";
import { previewLegacyMigration } from "./migration-preview.js";

test("summarizes legacy member, pending, renewal and expense data", () => {
  const result = previewLegacyMigration({
    openingBalance: 1200,
    members: [{
      id: "m1", name: "Test Member", amount: 500, totalFee: 1000,
      payments: [
        { amount: 100, date: "2026-01-02" },
        { amount: 200, type: "Renewal", date: "2026-02-02" }
      ],
      renewals: [{ fee: 600, paidAmount: 200, date: "2026-02-02" }]
    }],
    expenses: [{ title: "Rent", amount: 300 }],
    attendance: [{ date: "2026-01-02" }]
  });
  assert.equal(result.members, 1);
  assert.equal(result.initialPayments, 1);
  assert.equal(result.pendingPaymentAmount, 100);
  assert.equal(result.renewalPaymentAmount, 200);
  assert.equal(result.renewalFeeAmount, 600);
  assert.equal(result.expenseAmount, 300);
  assert.equal(result.attendanceRows, 1);
  assert.ok(result.warnings.some(w => w.includes("Renewal paid amount")));
});

test("rejects malformed and incomplete backup data", () => {
  assert.throws(() => previewLegacyMigration("{bad json"));
  assert.throws(() => previewLegacyMigration({ members: [] }));
});

test("does not mutate the supplied data", () => {
  const source = { members: [{ name: "A", amount: 50 }], expenses: [] };
  const before = JSON.stringify(source);
  previewLegacyMigration(source);
  assert.equal(JSON.stringify(source), before);
});
