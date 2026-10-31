import test from "node:test";
import assert from "node:assert/strict";
import { canRole, visibleCapabilities } from "./access-policy.js";

test("owner has every administrative capability", () => {
  for (const capability of [
    "members.delete", "payments.read.all", "expenses.create",
    "reports.read", "settings.update", "staff.manage",
    "backup.restore", "cloud.migrate"
  ]) assert.equal(canRole("owner", capability), true, capability);
});

test("staff can handle routine member, payment, renewal and attendance work", () => {
  for (const capability of [
    "members.read", "members.create", "members.update",
    "payments.create", "payments.read.own", "renewals.create", "renewals.read.own", "attendance.read", "attendance.create"
  ]) assert.equal(canRole("staff", capability), true, capability);
});

test("staff cannot access owner-only financial and administrative actions", () => {
  for (const capability of [
    "members.delete", "payments.read.all", "payments.update", "payments.delete",
    "renewals.update", "renewals.delete", "expenses.read", "expenses.create",
    "reports.read", "settings.update", "staff.manage", "backup.export",
    "backup.restore", "cloud.migrate"
  ]) assert.equal(canRole("staff", capability), false, capability);
});

test("unknown roles and unknown capabilities are denied", () => {
  assert.equal(canRole("guest", "members.read"), false);
  assert.equal(canRole("staff", "anything.unlisted"), false);
  assert.deepEqual(visibleCapabilities("guest"), []);
});
