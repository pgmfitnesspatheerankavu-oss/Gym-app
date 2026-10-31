import test from "node:test";
import assert from "node:assert/strict";
import { buildLegacyMigrationPlan } from "./migration-plan.js";

test("creates stable read-only operation IDs and separates renewal payment rows", () => {
  const source = {
    openingBalance: 100,
    members: [{
      name: "Member A", amount: 500, totalFee: 900, date: "2026-01-01",
      payments: [{ amount: 100, date: "2026-01-10" }, { amount: 200, type: "Renewal" }],
      renewals: [{ fee: 400, paidAmount: 200, date: "2026-02-01", expiryDate: "2026-03-01" }]
    }],
    expenses: [{ title: "Rent", amount: 50, date: "2026-01-01" }]
  };
  const first = buildLegacyMigrationPlan(source);
  const second = buildLegacyMigrationPlan(source);
  assert.equal(first.readOnly, true);
  assert.equal(first.requiresOwnerConfirmation, true);
  assert.equal(first.sourcePreserved, true);
  assert.deepEqual(first.operations.map(x => [x.collection, x.id]), second.operations.map(x => [x.collection, x.id]));
  assert.equal(first.collectionCounts.members, 1);
  assert.equal(first.collectionCounts.payments, 3);
  assert.equal(first.collectionCounts.renewals, 1);
  assert.equal(first.collectionCounts.expenses, 1);
  assert.equal(first.collectionCounts.settings, 1);
  assert.equal(first.operations.find(x => x.id === "legacy_m_1_payment_2").data.kind, "renewal");
});

test("maps attendance by phone and legacy index key", () => {
  const plan = buildLegacyMigrationPlan({
    members: [
      { name: "Phone Member", phone: "9990001111", amount: 0 },
      { name: "Index Member", phone: "", amount: 0 }
    ],
    expenses: [],
    attendance: [
      { date: "2026-10-31", memberKey: "9990001111", memberName: "Phone Member", time: "08:00" },
      { date: "2026-10-31", memberKey: "1", memberName: "Index Member", time: "08:05" }
    ]
  });
  const attendance = plan.operations.filter(x => x.collection === "attendance");
  assert.equal(attendance.length, 2);
  assert.equal(attendance[0].data.memberId, "legacy_m_1");
  assert.equal(attendance[1].data.memberId, "legacy_m_2");
});

test("skips ambiguous attendance links and reports warning", () => {
  const plan = buildLegacyMigrationPlan({
    members: [{ name: "Same", phone: "1" }, { name: "Same", phone: "2" }],
    expenses: [],
    attendance: [{ memberKey: "unknown", memberName: "Same", date: "2026-10-31" }]
  });
  assert.equal(plan.operations.filter(x => x.collection === "attendance").length, 0);
  assert.ok(plan.warnings.some(w => w.includes("Attendance #1")));
});

test("refuses members without names and invalid amounts", () => {
  assert.throws(() => buildLegacyMigrationPlan({ members: [{ name: "" }], expenses: [] }));
  assert.throws(() => buildLegacyMigrationPlan({ members: [{ name: "A", amount: -1 }], expenses: [] }));
});

test("does not mutate original source data", () => {
  const source = { members: [{ name: "A", amount: 10 }], expenses: [] };
  const before = JSON.stringify(source);
  buildLegacyMigrationPlan(source);
  assert.equal(JSON.stringify(source), before);
});
