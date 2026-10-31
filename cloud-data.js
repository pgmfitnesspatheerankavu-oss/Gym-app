// PGM FITNESS Firestore data access layer.
// This module is intentionally separate from the legacy localStorage UI.
// Firestore Security Rules are the final authorization boundary.
import {
  collection, doc, getDocs, addDoc, updateDoc,
  query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { auth, db, resolveRole } from "./firebase-client.js";
import { canRole } from "./access-policy.js";
import {
  memberCreatePayload, memberUpdatePayload, transactionPayload,
  attendancePayload, expensePayload
} from "./cloud-data-policy.js";

function requireCapability(role, capability) {
  if (!canRole(role, capability)) throw new Error("Permission denied: " + capability);
}
async function currentRole() {
  const user = auth.currentUser;
  if (!user) throw new Error("Login required");
  const result = await resolveRole(user);
  if (!result.allowed) throw new Error("Account is not enabled for cloud records");
  return { user, role: result.role };
}
function cleanRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("Invalid record");
  }
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

export async function listMembers() {
  const { role } = await currentRole();
  requireCapability(role, "members.read");
  const snapshot = await getDocs(query(collection(db, "members"), orderBy("name")));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}
export async function createMember(record) {
  const { user, role } = await currentRole();
  requireCapability(role, "members.create");
  const data = memberCreatePayload(record);
  return addDoc(collection(db, "members"), {
    ...data, createdAt: serverTimestamp(), createdBy: user.uid,
    updatedAt: serverTimestamp(), updatedBy: user.uid
  });
}
export async function updateMember(memberId, changes) {
  const { user, role } = await currentRole();
  requireCapability(role, "members.update");
  if (!memberId) throw new Error("Member ID required");
  const data = memberUpdatePayload(changes);
  return updateDoc(doc(db, "members", memberId), {
    ...data, updatedAt: serverTimestamp(), updatedBy: user.uid
  });
}
export async function recordAttendance(record) {
  const { user, role } = await currentRole();
  requireCapability(role, "attendance.create");
  const data = attendancePayload(record);
  return addDoc(collection(db, "attendance"), {
    ...data, createdAt: serverTimestamp(), createdBy: user.uid
  });
}
export async function listAttendanceForDate(date) {
  const { role } = await currentRole();
  requireCapability(role, "attendance.read");
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(date))) throw new Error("Invalid date");
  const snapshot = await getDocs(query(
    collection(db, "attendance"), where("date", "==", date), orderBy("date")
  ));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}
export async function createPayment(record) {
  const { user, role } = await currentRole();
  requireCapability(role, "payments.create");
  const data = transactionPayload(record);
  return addDoc(collection(db, "payments"), {
    ...data, createdAt: serverTimestamp(), createdBy: user.uid
  });
}
export async function createRenewal(record) {
  const { user, role } = await currentRole();
  requireCapability(role, "renewals.create");
  const data = transactionPayload(record);
  return addDoc(collection(db, "renewals"), {
    ...data, createdAt: serverTimestamp(), createdBy: user.uid
  });
}
// Financial collections are deliberately owner-only.
export async function listExpenses() {
  const { role } = await currentRole();
  requireCapability(role, "expenses.read");
  const snapshot = await getDocs(query(collection(db, "expenses"), orderBy("date", "desc")));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}
export async function createExpense(record) {
  const { user, role } = await currentRole();
  requireCapability(role, "expenses.create");
  const data = expensePayload(record);
  return addDoc(collection(db, "expenses"), {
    ...data, createdAt: serverTimestamp(), createdBy: user.uid
  });
}
