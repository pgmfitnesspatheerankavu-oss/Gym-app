// PGM FITNESS — deterministic, read-only legacy migration plan.
// No Firebase writes, localStorage changes, or source deletion occur here.
import { previewLegacyMigration } from "./migration-preview.js";

const clean = value => value == null ? "" : String(value);
const amount = value => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error("അസാധുവായ തുക കണ്ടെത്തി. Migration നിർത്തി.");
  return n;
};

export function buildLegacyMigrationPlan(rawJson) {
  const state = typeof rawJson === "string" ? JSON.parse(rawJson) : rawJson;
  const summary = previewLegacyMigration(state);
  if (summary.warnings.some(w => w.includes("തെറ്റായ") || w.includes("അസാധുവായ"))) {
    throw new Error("ഡാറ്റയിൽ തിരുത്തേണ്ട പ്രശ്നങ്ങളുണ്ട്. Warnings പരിശോധിച്ചശേഷം വീണ്ടും ശ്രമിക്കുക.");
  }

  const operations = [];
  const memberRefs = [];
  const warnings = [...summary.warnings];

  state.members.forEach((m, i) => {
    if (!m || typeof m !== "object" || !clean(m.name).trim()) {
      throw new Error(`അംഗം #${i + 1}-ന് സാധുവായ പേര് ഇല്ല. Migration നിർത്തി.`);
    }
    // Index-based IDs remain stable for repeat runs of the same unchanged backup.
    const memberId = `legacy_m_${i + 1}`;
    memberRefs.push({ index: i, id: memberId, name: clean(m.name) });
    const profile = {
      name: clean(m.name), phone: clean(m.phone), address: clean(m.address),
      gender: clean(m.gender), joinDate: clean(m.joinDate || m.date),
      plan: clean(m.plan), planFee: amount(m.totalFee ?? m.amount ?? 0),
      expiryDate: clean(m.expiryDate), status: clean(m.status || "active"),
      notes: clean(m.notes), legacySource: "pgm_fitness_data",
      legacyIndex: i
    };
    if (m.photo) warnings.push(`അംഗം #${i + 1}: photo Cloud Storage-ലേക്ക് മാറ്റിയിട്ടില്ല; local backup-ൽ സൂക്ഷിക്കുക.`);
    operations.push({ collection: "members", id: memberId, data: profile });

    if (amount(m.amount || 0) > 0) {
      operations.push({
        collection: "payments", id: `legacy_m_${i + 1}_initial`,
        data: { memberId, memberNameSnapshot: clean(m.name), amount: amount(m.amount),
          date: clean(m.date), payMode: clean(m.payMode), kind: "joining",
          legacySource: "pgm_fitness_data", legacyIndex: i }
      });
    }

    (Array.isArray(m.payments) ? m.payments : []).forEach((p, j) => {
      const isRenewalPayment = clean(p.type).toLowerCase() === "renewal";
      operations.push({
        collection: "payments", id: `legacy_m_${i + 1}_payment_${j + 1}`,
        data: { memberId, memberNameSnapshot: clean(m.name), amount: amount(p.amount),
          date: clean(p.date), payMode: clean(p.payMode),
          kind: isRenewalPayment ? "renewal" : "pending_fee",
          legacySource: "pgm_fitness_data", legacyIndex: i, legacyItemIndex: j }
      });
    });

    (Array.isArray(m.renewals) ? m.renewals : []).forEach((r, j) => {
      operations.push({
        collection: "renewals", id: `legacy_m_${i + 1}_renewal_${j + 1}`,
        data: { memberId, memberNameSnapshot: clean(m.name), plan: clean(r.plan),
          amount: amount(r.fee), paidAmount: amount(r.paidAmount),
          startDate: clean(r.date), expiryDate: clean(r.expiryDate),
          payMode: clean(r.payMode), legacySource: "pgm_fitness_data",
          legacyIndex: i, legacyItemIndex: j }
      });
    });
  });

  (state.expenses || []).forEach((e, i) => {
    operations.push({
      collection: "expenses", id: `legacy_expense_${i + 1}`,
      data: { title: clean(e.title || e.name), amount: amount(e.amount),
        date: clean(e.date), category: clean(e.category), notes: clean(e.notes),
        legacySource: "pgm_fitness_data", legacyIndex: i }
    });
  });

  (Array.isArray(state.attendance) ? state.attendance : []).forEach((a, i) => {
    // Legacy app stores memberKey as phone when available, otherwise the member's array index.
    const key = clean(a.memberKey);
    const byPhone = key ? memberRefs.filter(m => clean(state.members[m.index].phone) === key) : [];
    let member = byPhone.length === 1 ? byPhone[0] : null;
    if (!member && key !== "" && /^\\d+$/.test(key)) {
      const index = Number(key);
      if (Number.isSafeInteger(index) && state.members[index]) {
        const candidate = memberRefs.find(m => m.index === index);
        if (candidate && !clean(state.members[index].phone)) member = candidate;
      }
    }
    // A name-only match is accepted only when unique; ambiguous records are skipped.
    if (!member && clean(a.memberName)) {
      const matches = memberRefs.filter(m => m.name.trim().toLowerCase() === clean(a.memberName).trim().toLowerCase());
      if (matches.length === 1) member = matches[0];
    }
    if (!member) {
      warnings.push(`Attendance #${i + 1}: memberKey/name ഉപയോഗിച്ച് അംഗത്തെ ഉറപ്പിക്കാൻ കഴിഞ്ഞില്ല; സ്വമേധയാ പരിശോധിക്കുക.`);
      return;
    }
    operations.push({
      collection: "attendance", id: `legacy_attendance_${i + 1}`,
      data: { memberId: member.id, memberNameSnapshot: clean(a.memberName || member.name),
        phone: clean(a.phone), date: clean(a.date), checkInAt: clean(a.time),
        legacySource: "pgm_fitness_data", legacyIndex: i }
    });
  });

  operations.push({
    collection: "settings", id: "main",
    data: { openingBalance: amount(state.openingBalance || 0),
      legacySource: "pgm_fitness_data" }
  });

  return {
    readOnly: true,
    requiresOwnerConfirmation: true,
    sourcePreserved: true,
    summary,
    warnings: [...new Set(warnings)],
    operationCount: operations.length,
    collectionCounts: operations.reduce((counts, op) => {
      counts[op.collection] = (counts[op.collection] || 0) + 1;
      return counts;
    }, {}),
    operations
  };
}
