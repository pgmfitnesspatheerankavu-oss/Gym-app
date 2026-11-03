// Pure migration-plan validation and reconciliation summary.
export function verifyMigrationPlan(plan) {
  if (!plan || plan.readOnly !== true || plan.sourcePreserved !== true ||
      plan.requiresOwnerConfirmation !== true || !Array.isArray(plan.operations)) {
    throw new Error("Migration plan സാധുവല്ല.");
  }
  const ids = new Set(), counts = {};
  for (const op of plan.operations) {
    if (!op?.collection || !op?.id || !op?.data || typeof op.data !== "object") {
      throw new Error("Migration operation അപൂർണ്ണമാണ്.");
    }
    const key = op.collection + "/" + op.id;
    if (ids.has(key)) throw new Error("Duplicate migration ID: " + key);
    ids.add(key);
    counts[op.collection] = (counts[op.collection] || 0) + 1;
    for (const field of ["amount", "paidAmount"]) {
      if (op.data[field] !== undefined) {
        const n = Number(op.data[field]);
        if (!Number.isFinite(n) || n < 0) throw new Error("Invalid " + field + " in " + key);
      }
    }
  }
  for (const [name, count] of Object.entries(counts)) {
    if (count !== plan.collectionCounts?.[name]) throw new Error("Collection count mismatch: " + name);
  }
  const sums = { payments: 0, expenses: 0, renewalsPaid: 0 };
  for (const op of plan.operations) {
    if (op.collection === "payments") sums.payments += Number(op.data.amount || 0);
    if (op.collection === "expenses") sums.expenses += Number(op.data.amount || 0);
    if (op.collection === "renewals") sums.renewalsPaid += Number(op.data.paidAmount || 0);
  }
  return {
    operationCount: plan.operations.length, collectionCounts: counts,
    paymentLedgerTotal: Number(sums.payments.toFixed(2)),
    expenseTotal: Number(sums.expenses.toFixed(2)),
    renewalPaidAmountInformationalOnly: Number(sums.renewalsPaid.toFixed(2)),
    warnings: [...(plan.warnings || [])]
  };
}
