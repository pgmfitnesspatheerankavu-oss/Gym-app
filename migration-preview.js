// PGM FITNESS — read-only migration pre-check.
// This module NEVER writes to localStorage or Firestore.
export function previewLegacyMigration(rawJson) {
  let state;
  try {
    state = typeof rawJson === "string" ? JSON.parse(rawJson) : rawJson;
  } catch {
    throw new Error("Backup JSON വായിക്കാൻ കഴിഞ്ഞില്ല. ഫയൽ ശരിയായ JSON ആണെന്ന് പരിശോധിക്കുക.");
  }
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new Error("Backup data format ശരിയല്ല.");
  }
  if (!Array.isArray(state.members) || !Array.isArray(state.expenses)) {
    throw new Error("members[] അല്ലെങ്കിൽ expenses[] ലഭ്യമല്ല. ഈ backup പഴയ PGM FITNESS format അല്ലായിരിക്കാം.");
  }

  const warnings = [];
  const seenIds = new Set();
  let initialPayments = 0;
  let memberPaymentRows = 0;
  let memberPaymentAmount = 0;
  let renewalRows = 0;
  let renewalPaidAmount = 0;
  let expenseAmount = 0;
  let invalidAmounts = 0;
  let largePhotos = 0;
  let missingNames = 0;

  const validAmount = value => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) { invalidAmounts++; return 0; }
    return n;
  };

  for (const [index, member] of state.members.entries()) {
    if (!member || typeof member !== "object") {
      warnings.push(`അംഗം #${index + 1}: തെറ്റായ റെക്കോർഡ്`);
      continue;
    }
    const id = member.id == null ? "" : String(member.id);
    if (id && seenIds.has(id)) warnings.push(`Duplicate member ID: ${id}`);
    if (id) seenIds.add(id);
    if (!String(member.name || "").trim()) missingNames++;
    if (typeof member.photo === "string" && member.photo.length > 500000) largePhotos++;

    const firstAmount = validAmount(member.amount);
    if (firstAmount > 0) initialPayments++;
    const payments = Array.isArray(member.payments) ? member.payments : [];
    const renewals = Array.isArray(member.renewals) ? member.renewals : [];
    for (const p of payments) {
      if (!p || typeof p !== "object") { warnings.push(`അംഗം #${index + 1}: തെറ്റായ payment`); continue; }
      memberPaymentRows++;
      memberPaymentAmount += validAmount(p.amount);
    }
    for (const r of renewals) {
      if (!r || typeof r !== "object") { warnings.push(`അംഗം #${index + 1}: തെറ്റായ renewal`); continue; }
      renewalRows++;
      renewalPaidAmount += validAmount(r.paidAmount);
    }
  }

  for (const expense of state.expenses) {
    if (!expense || typeof expense !== "object") { warnings.push("തെറ്റായ expense റെക്കോർഡ്"); continue; }
    expenseAmount += validAmount(expense.amount);
  }

  if (missingNames) warnings.push(`${missingNames} അംഗങ്ങൾക്ക് പേര് ഇല്ല`);
  if (largePhotos) warnings.push(`${largePhotos} അംഗങ്ങളുടെ photo 500 KB-ൽ കൂടുതലാണ്`);
  if (invalidAmounts) warnings.push(`${invalidAmounts} തുകകൾ അസാധുവാണ്; migration മുമ്പ് പരിശോധിക്കുക`);

  return {
    readOnly: true,
    source: "pgm_fitness_data",
    openingBalance: Number(state.openingBalance) || 0,
    members: state.members.length,
    initialPayments,
    memberPaymentRows,
    memberPaymentAmount: Number(memberPaymentAmount.toFixed(2)),
    renewalRows,
    renewalPaidAmount: Number(renewalPaidAmount.toFixed(2)),
    expenses: state.expenses.length,
    expenseAmount: Number(expenseAmount.toFixed(2)),
    warnings
  };
}
