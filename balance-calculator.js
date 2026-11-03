export function calculateBalanceDue(member, payments, asOf) {
  const firstRegistration = (member?.planStartDate || member?.joinDate) === member?.joinDate;
  const planPrices = { "1 Month": 650, "3 Months": 1600, "6 Months": 2700, "12 Months": 4700, "Couple / Duo - 3 Months": 3000 };
  const storedPlanFee = Number(member?.planFee);
  const planFee = Number.isFinite(storedPlanFee) && storedPlanFee > 0
    ? storedPlanFee
    : Number(planPrices[member?.plan] || 0);
  const fee = planFee + (firstRegistration ? Number(member?.registrationFee || 0) : 0);
  if (!Number.isFinite(fee) || fee <= 0) return 0;
  const cycleStart = member.planStartDate || member.joinDate || "0000-01-01";
  const paid = (payments || [])
    .filter(p => p.memberId === member.id && p.date >= cycleStart && p.date <= asOf)
    .reduce((sum, p) => sum + Math.max(0, Number(p.amount) || 0), 0);
  return Math.max(0, fee - paid);
}
