// PGM FITNESS Firestore data access layer.
// This module is intentionally separate from the legacy localStorage UI.
// Firestore Security Rules are the final authorization boundary.
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, writeBatch, writeBatch
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
export async function getMember(memberId) {
  const { role } = await currentRole();
  requireCapability(role, "members.read");
  if (!memberId) throw new Error("Member ID required");
  const snapshot = await getDoc(doc(db, "members", memberId));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
}
export async function createMember(record) {
  const { user, role } = await currentRole();
  requireCapability(role, "members.create");
  const data = memberCreatePayload(record);
  if (role !== "owner" && Object.prototype.hasOwnProperty.call(data, "planFee")) {
    throw new Error("Only the Owner can set a member plan fee");
  }
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
export async function deleteMember(memberId) {
  const { role } = await currentRole();
  requireCapability(role, "members.delete");
  if (!memberId) throw new Error("Member ID required");
  await deleteDoc(doc(db, "members", memberId));
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error("Invalid date");
  const snapshot = await getDocs(query(
    collection(db, "attendance"), where("date", "==", date), orderBy("date")
  ));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}
export async function listAllPayments() {
  const { role } = await currentRole();
  requireCapability(role, "payments.read.all");
  const snapshot = await getDocs(query(collection(db, "payments"), orderBy("date", "desc")));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

export async function listMyPayments() {
  const { user, role } = await currentRole();
  requireCapability(role, "payments.read.own");
  const snapshot = await getDocs(query(
    collection(db, "payments"), where("createdBy", "==", user.uid)
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
export async function listAllRenewals() {
  const { role } = await currentRole();
  requireCapability(role, "renewals.read.all");
  const snapshot = await getDocs(query(collection(db, "renewals"), orderBy("date", "desc")));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}
export async function listMyRenewals() {
  const { user, role } = await currentRole();
  requireCapability(role, "renewals.read.own");
  const snapshot = await getDocs(query(
    collection(db, "renewals"), where("createdBy", "==", user.uid)
  ));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}
export async function saveRenewalBundle(memberId, renewalRecord, memberChanges, paymentRecord) {
  const { user, role } = await currentRole();
  requireCapability(role, "renewals.create");
  requireCapability(role, "members.update");
  if (paymentRecord) requireCapability(role, "payments.create");
  if (!memberId) throw new Error("Member ID required");
  const renewal = transactionPayload(renewalRecord);
  const changes = memberUpdatePayload(memberChanges);
  const batch = writeBatch(db);
  batch.set(doc(collection(db, "renewals")), { ...renewal, createdAt: serverTimestamp(), createdBy: user.uid });
  batch.update(doc(db, "members", memberId), { ...changes, updatedAt: serverTimestamp(), updatedBy: user.uid });
  if (paymentRecord) {
    const payment = transactionPayload(paymentRecord);
    batch.set(doc(collection(db, "payments")), { ...payment, createdAt: serverTimestamp(), createdBy: user.uid });
  }
  await batch.commit();
}
export async function saveRenewalWithPayment({ memberId, renewal, memberChanges, payment }) {
  const { user, role } = await currentRole();
  requireCapability(role, "renewals.create");
  requireCapability(role, "members.update");
  if (payment) requireCapability(role, "payments.create");
  if (!memberId) throw new Error("Member ID required");
  const renewalData = transactionPayload(renewal);
  const batch = writeBatch(db);
  const memberRef = doc(db, "members", memberId);
  const renewalRef = doc(collection(db, "renewals"));
  batch.set(renewalRef, { ...renewalData, createdAt: serverTimestamp(), createdBy: user.uid });
  batch.update(memberRef, { ...memberUpdatePayload(memberChanges), updatedAt: serverTimestamp(), updatedBy: user.uid });
  if (payment) {
    const paymentData = transactionPayload(payment);
    const paymentRef = doc(collection(db, "payments"));
    batch.set(paymentRef, { ...paymentData, createdAt: serverTimestamp(), createdBy: user.uid });
  }
  await batch.commit();
  return { renewalId: renewalRef.id };
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
