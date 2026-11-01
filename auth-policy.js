// Pure role decision used by Firebase Auth; profile lookup remains in firebase-client.js.
import { STAFF_CAPABILITIES, defaultStaffPermissions } from "./access-policy.js";
export function decideAccess(user, ownerUid, staffProfile = null) {
  if (!user) return { allowed: false, reason: "signed-out" };
  if (user.uid === ownerUid) return { allowed: true, role: "owner", uid: user.uid, permissions: [] };
  if (!staffProfile) return { allowed: false, reason: "not-provisioned" };
  if (staffProfile.role !== "staff" || staffProfile.active !== true) return { allowed: false, reason: "inactive-or-invalid-role" };
  const source = Array.isArray(staffProfile.permissions) ? staffProfile.permissions : defaultStaffPermissions();
  const permissions = [...new Set(source.filter(x => STAFF_CAPABILITIES.includes(x)))];
  return { allowed: true, role: "staff", uid: user.uid, displayName: staffProfile.displayName || "", permissions };
}
