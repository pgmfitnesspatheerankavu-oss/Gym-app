// Explicit, loss-minimizing adapter from the legacy localStorage member shape.
// It is for preview/mapping only; it performs no reads, writes, or migration.
export function mapLegacyMemberProfile(member) {
  if (!member || typeof member !== "object" || Array.isArray(member)) {
    throw new Error("Invalid legacy member");
  }
  const name = String(member.name || "").trim();
  if (!name) throw new Error("Legacy member name required");
  const planFee = Number(member.totalFee !== undefined ? member.totalFee : member.amount);
  if (!Number.isFinite(planFee) || planFee < 0) throw new Error("Legacy plan fee is invalid");
  const result = {
    name,
    phone: String(member.phone || ""),
    address: String(member.address || ""),
    joinDate: String(member.date || ""),
    plan: String(member.plan || ""),
    planFee,
    expiryDate: String(member.expiryDate || ""),
    status: "active"
  };
  if (member.gender) result.gender = String(member.gender);
  return result;
}

export function mapLegacyMemberTransactions(member, memberId) {
  if (!member || typeof member !== "object" || Array.isArray(member)) {
    throw new Error("Invalid legacy member");
  }
  if (!memberId) throw new Error("Cloud member ID required");
  const transactions = [];
  const initialPaid = Number(member.amount) || 0;
  if (initialPaid > 0) transactions.push({
    kind: "payment", memberId, memberName: String(member.name || ""),
    phone: String(member.phone || ""), amount: initialPaid,
    feeAmount: Number(member.totalFee !== undefined ? member.totalFee : member.amount) || 0,
    date: String(member.date || ""), payMode: String(member.payMode || "Cash"), type: "Joining"
  });
  for (const payment of Array.isArray(member.payments) ? member.payments : []) {
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    transactions.push({
      kind: "payment", memberId, memberName: String(member.name || ""),
      phone: String(member.phone || ""), amount,
      date: String(payment.date || member.date || ""),
      payMode: String(payment.payMode || "Cash"), type: String(payment.type || "Payment")
    });
  }
  for (const renewal of Array.isArray(member.renewals) ? member.renewals : []) {
    const feeAmount = Number(renewal.fee);
    const amount = Number(renewal.paidAmount);
    if (!Number.isFinite(feeAmount) || feeAmount <= 0) continue;
    transactions.push({
      kind: "renewal", memberId, memberName: String(member.name || ""),
      phone: String(member.phone || ""), amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
      feeAmount, date: String(renewal.date || ""),
      payMode: String(renewal.payMode || "Cash"), type: "Renewal",
      plan: String(renewal.plan || ""), expiryDate: String(renewal.expiryDate || "")
    });
  }
  return transactions;
}
