// Central capability policy. Firestore Security Rules are the final authorization boundary.
export const STAFF_CAPABILITIES = ["members.read","members.create","members.update","members.delete","payments.read.all","payments.read.own","payments.create","payments.delete","renewals.read.all","renewals.read.own","renewals.create","renewals.delete","attendance.read","attendance.create","expenses.read","expenses.create","expenses.update","expenses.delete","reports.read"];
export const STAFF_CAPABILITY_LABELS = {"members.read":"View members","members.create":"Add members","members.update":"Edit members","members.delete":"Delete members","payments.read.all":"View all payments","payments.read.own":"View own payments","payments.create":"Add payments","payments.delete":"Delete payments","renewals.read.all":"View all renewals","renewals.read.own":"View own renewals","renewals.create":"Add renewals","renewals.delete":"Delete renewals","attendance.read":"View attendance","attendance.create":"Mark attendance","expenses.read":"View expenses","expenses.create":"Add expenses","expenses.update":"Edit expenses","expenses.delete":"Delete expenses","reports.read":"View P&L reports"};
const OWNER = new Set([...STAFF_CAPABILITIES, "settings.read", "settings.update", "staff.manage", "backup.export", "backup.restore", "cloud.migrate"]);
const LEGACY_STAFF = new Set(["members.read","members.create","members.update","payments.read.own","payments.create","renewals.read.own","renewals.create","attendance.read","attendance.create"]);
export function canRole(role, capability, permissions = []) {
  if (role === "owner") return OWNER.has(capability);
  if (role === "staff") return new Set(permissions || []).has(capability);
  return false;
}
export function defaultStaffPermissions() { return [...LEGACY_STAFF]; }
export function visibleCapabilities(role, permissions = []) {
  const all = new Set([...OWNER, ...STAFF_CAPABILITIES]);
  return [...all].filter(capability => canRole(role, capability, permissions)).sort();
}
