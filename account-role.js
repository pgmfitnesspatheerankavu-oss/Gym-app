// Pure account-role decision logic shared by Firebase client and tests.
export function decideAccountRole(user, ownerUid, profile = null) {
  if (!user) return { allowed: false, reason: "signed-out" };
  if (user.uid === ownerUid) return { allowed: true, role: "owner", uid: user.uid };
  if (!profile) return { allowed: false, reason: "not-provisioned" };
  if (profile.role !== "staff" || profile.active !== true) {
    return { allowed: false, reason: "inactive-or-invalid-role" };
  }
  // Staff stays blocked until cloud migration and staff UI are complete.
  return { allowed: false, reason: "staff-cloud-migration-pending", role: "staff" };
}
