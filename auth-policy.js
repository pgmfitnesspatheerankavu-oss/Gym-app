// Pure role decision used by Firebase Auth; Firestore profile lookup remains in firebase-client.js.
export function decideAccess(user, ownerUid, staffProfile = null) {
  if (!user) return { allowed: false, reason: "signed-out" };
  if (user.uid === ownerUid) return { allowed: true, role: "owner", uid: user.uid };
  if (!staffProfile) return { allowed: false, reason: "not-provisioned" };
  if (staffProfile.role !== "staff" || staffProfile.active !== true) {
    return { allowed: false, reason: "inactive-or-invalid-role" };
  }
  // Staff must not enter the legacy localStorage dashboard.
  return { allowed: false, reason: "staff-cloud-migration-pending", role: "staff" };
}
