// Central UI capability policy. Firestore rules remain the security boundary.
const OWNER = new Set([
  "members.read", "members.create", "members.update", "members.delete",
  "payments.read.all", "payments.create", "payments.update", "payments.delete",
  "renewals.read.all", "renewals.create", "renewals.update", "renewals.delete",
  "attendance.read", "attendance.create", "attendance.delete",
  "expenses.read", "expenses.create", "expenses.update", "expenses.delete",
  "reports.read", "settings.read", "settings.update",
  "staff.manage", "backup.export", "backup.restore", "cloud.migrate"
]);

const STAFF = new Set([
  "members.read", "members.create", "members.update",
  "payments.create", "renewals.create",
  "attendance.read", "attendance.create"
]);

export function canRole(role, capability) {
  if (role === "owner") return OWNER.has(capability);
  if (role === "staff") return STAFF.has(capability);
  return false;
}

export function visibleCapabilities(role) {
  const all = new Set([...OWNER, ...STAFF]);
  return [...all].filter(capability => canRole(role, capability)).sort();
}
