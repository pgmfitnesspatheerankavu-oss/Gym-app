import test from "node:test";
import assert from "node:assert/strict";
import { decideAccountRole } from "./account-role.js";

const ownerUid = "owner-test-uid";

test("signed-out users are denied", () => {
  assert.deepEqual(decideAccountRole(null, ownerUid), { allowed: false, reason: "signed-out" });
});

test("only the fixed owner UID receives owner access", () => {
  assert.deepEqual(decideAccountRole({ uid: ownerUid }, ownerUid), {
    allowed: true, role: "owner", uid: ownerUid
  });
  assert.equal(decideAccountRole({ uid: "other" }, ownerUid, { role: "owner", active: true }).allowed, false);
});

test("missing, inactive, and invalid staff profiles are denied", () => {
  assert.equal(decideAccountRole({ uid: "staff" }, ownerUid).reason, "not-provisioned");
  assert.equal(decideAccountRole({ uid: "staff" }, ownerUid, { role: "staff", active: false }).allowed, false);
  assert.equal(decideAccountRole({ uid: "staff" }, ownerUid, { role: "owner", active: true }).allowed, false);
});

test("active staff remains blocked until cloud migration is complete", () => {
  assert.deepEqual(decideAccountRole({ uid: "staff" }, ownerUid, { role: "staff", active: true }), {
    allowed: false, reason: "staff-cloud-migration-pending", role: "staff"
  });
});
