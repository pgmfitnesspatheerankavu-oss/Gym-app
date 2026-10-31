import test from "node:test";
import assert from "node:assert/strict";
import { staffProfilePayload } from "./staff-management-policy.js";

test("accepts a named active Staff profile without creating credentials", () => {
  assert.deepEqual(staffProfilePayload({ uid: "firebase-auth-uid-1", displayName: "Staff One" }), {
    uid: "firebase-auth-uid-1",
    profile: { role: "staff", active: true, displayName: "Staff One" }
  });
});
test("allows Owner to deactivate a Staff profile", () => {
  assert.equal(staffProfilePayload({ uid: "staff-uid", displayName: "Staff", active: false }).profile.active, false);
});
test("rejects missing UID, invalid UID, and empty display name", () => {
  assert.throws(() => staffProfilePayload({ displayName: "Staff" }));
  assert.throws(() => staffProfilePayload({ uid: "bad uid", displayName: "Staff" }));
  assert.throws(() => staffProfilePayload({ uid: "staff-uid", displayName: " " }));
});
test("never accepts a caller-supplied role or credential fields", () => {
  const result = staffProfilePayload({ uid: "staff-uid", displayName: "Staff", role: "owner", password: "secret" });
  assert.deepEqual(result.profile, { role: "staff", active: true, displayName: "Staff" });
});
test("rejects non-boolean active values", () => {
  assert.throws(() => staffProfilePayload({ uid: "staff-uid", displayName: "Staff", active: "yes" }));
});
