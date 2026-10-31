import test from "node:test";
import assert from "node:assert/strict";
import { decideAccess } from "./auth-policy.js";

test("signed-out sessions are denied", () => {
  assert.deepEqual(decideAccess(null, "owner-uid"), { allowed: false, reason: "signed-out" });
});

test("only the exact configured UID receives Owner role", () => {
  assert.deepEqual(decideAccess({ uid: "owner-uid" }, "owner-uid"), {
    allowed: true, role: "owner", uid: "owner-uid"
  });
  assert.equal(decideAccess({ uid: "other" }, "owner-uid").allowed, false);
});

test("unprovisioned, inactive and invalid profiles are denied", () => {
  assert.equal(decideAccess({ uid: "staff" }, "owner-uid").reason, "not-provisioned");
  assert.equal(decideAccess({ uid: "staff" }, "owner-uid", { role: "staff", active: false }).reason, "inactive-or-invalid-role");
  assert.equal(decideAccess({ uid: "staff" }, "owner-uid", { role: "owner", active: true }).allowed, false);
});

test("active staff receive limited Staff role access", () => {
  assert.deepEqual(decideAccess({ uid: "staff" }, "owner-uid", { role: "staff", active: true, displayName: "Trainer" }), {
    allowed: true, role: "staff", uid: "staff", displayName: "Trainer"
  });
});
