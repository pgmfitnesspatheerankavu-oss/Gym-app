// Owner-only Staff profile provisioning helpers.
import { STAFF_CAPABILITIES, defaultStaffPermissions } from "./access-policy.js";
export function staffProfilePayload(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid staff profile");
  const uid = String(input.uid || "").trim();
  const displayName = String(input.displayName || "").trim();
  if (!uid || uid.length > 128 || /[\s/]/.test(uid)) throw new Error("A valid Firebase Auth UID is required");
  if (!displayName || displayName.length > 80) throw new Error("Staff name is required (maximum 80 characters)");
  if (input.active !== undefined && typeof input.active !== "boolean") throw new Error("Staff active status must be true or false");
  const requested = input.permissions === undefined ? defaultStaffPermissions() : input.permissions;
  if (!Array.isArray(requested) || requested.some(x => !STAFF_CAPABILITIES.includes(x))) throw new Error("Invalid Staff permission selected");
  const permissions = [...new Set(requested)];
  return { uid, profile: { role: "staff", active: input.active !== false, displayName, permissions } };
}
