export function calculateBalanceDue(member, payments, asOf) {
  const firstRegistration = (member?.planStartDate || member?.joinDate) === member?.joinDate;
  const fee = Number(member?.planFee) + (firstRegistration ? Number(member?.registrationFee || 0) : 0);
  if (!Number.isFinite(fee) || fee <= 0) return 0;
  const cycleStart = member.planStartDate || member.joinDate || "0000-01-01";
  const paid = (payments || [])
    .filter(p => p.memberId === member.id && p.date >= cycleStart && p.date <= asOf)
    .reduce((sum, p) => sum + Math.max(0, Number(p.amount) || 0), 0);
  return Math.max(0, fee - paid);
}
