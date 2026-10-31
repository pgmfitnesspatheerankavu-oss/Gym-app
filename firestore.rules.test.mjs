import fs from "node:fs";
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, updateDoc } from "firebase/firestore";

const rules = fs.readFileSync("firestore.rules", "utf8");
const ownerMatch = rules.match(/request\.auth\.uid\s*==\s*"([^"]+)"/);
assert.ok(ownerMatch, "Owner UID must be configured in Firestore rules");
const ownerUid = ownerMatch[1];
const staffUid = "emulator-staff-user";
let env;

before(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-pgm-fitness", firestore: { rules } });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "users", staffUid), { role: "staff", active: true });
  });
});

test("active staff can create a clean member profile", async () => {
  const db = env.authenticatedContext(staffUid).firestore();
  await assertSucceeds(setDoc(doc(db, "members", "m1"), { name: "Test Member", phone: "9999999999", planFee: 1200 }));
});
test("staff cannot inject financial or ownership fields into member", async () => {
  const db = env.authenticatedContext(staffUid).firestore();
  await assertFails(setDoc(doc(db, "members", "m2"), { name: "Test Member", totalFee: 50000, createdBy: "spoofed" }));
});
test("staff cannot change protected member fields", async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "members", "m3"), { name: "Test Member", planFee: 1000 });
  });
  const db = env.authenticatedContext(staffUid).firestore();
  await assertFails(updateDoc(doc(db, "members", "m3"), { planFee: 9000 }));
  await assertSucceeds(updateDoc(doc(db, "members", "m3"), { name: "Updated Name" }));
});
test("staff cannot read or write owner-only expenses", async () => {
  const db = env.authenticatedContext(staffUid).firestore();
  await assertFails(setDoc(doc(db, "expenses", "e1"), { title: "Rent", amount: 1000, date: "2026-10-31" }));
  await assertFails(getDoc(doc(db, "expenses", "e1")));
});
test("staff can create only their own payment records", async () => {
  const db = env.authenticatedContext(staffUid).firestore();
  await assertSucceeds(setDoc(doc(db, "payments", "p1"), { amount: 500, date: "2026-10-31", createdBy: staffUid }));
  await assertFails(setDoc(doc(db, "payments", "p2"), { amount: 500, date: "2026-10-31", createdBy: "another-user" }));
});
test("inactive staff cannot access member records", async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "users", "inactive-staff"), { role: "staff", active: false });
  });
  const db = env.authenticatedContext("inactive-staff").firestore();
  await assertFails(getDoc(doc(db, "members", "m1")));
});
test("owner retains access to owner-only expenses", async () => {
  const db = env.authenticatedContext(ownerUid).firestore();
  await assertSucceeds(setDoc(doc(db, "expenses", "owner-e1"), { title: "Rent", amount: 1000, date: "2026-10-31" }));
});
