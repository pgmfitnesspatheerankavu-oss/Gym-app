// PGM FITNESS Firestore data access layer.
// This module is intentionally separate from the legacy localStorage UI.
// Firestore Security Rules are the final authorization boundary.
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, writeBatch, setDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { auth, db, resolveRole } from "./firebase-client.js";
import { canRole } from "./access-policy.js";
import { staffProfilePayload } from "./staff-management-policy.js";
import {
  memberCreatePayload, memberUpdatePayload, transactionPayload,
  attendancePayload, expensePayload
} from "./cloud-data-policy.js";

function requireCapability(role, capability, permissions = []) {
  if (!canRole(role, capability, permissions)) throw new Error("Permission denied: " + capability);
}
async function currentRole() {
  const user = auth.currentUser;
  if (!user) throw new Error("Login required");
  const result = await resolveRole(user);
  if (!result.allowed) throw new Error("Account is not enabled for cloud records");
  return { user, role: result.role, permissions: result.permissions || [] };
}
async function collectorDetails(user, role) {
  let displayName = String(user.displayName || "").trim();
  if (!displayName) {
    try {
      const profile = await getDoc(doc(db, "users", user.uid));
      if (profile.exists()) displayName = String(profile.data().displayName || "").trim();
    } catch (_) {}
  }
  return { collectedBy: displayName || (role === "owner" ? "Owner" : user.email || "Staff"), collectedByUid: user.uid };
}

function cleanRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("Invalid record");
  }
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

export async function listMembers() {
  const { role, permissions } = await currentRole();
  requireCapability(role, "members.read", permissions);
  const snapshot = await getDocs(query(collection(db, "members"), orderBy("name")));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}
export async function getMember(memberId) {
  const { role, permissions } = await currentRole();
  requireCapability(role, "members.read", permissions);
  if (!memberId) throw new Error("Member ID required");
  const snapshot = await getDoc(doc(db, "members", memberId));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
}
export async function createMember(record) {
  const { user, role, permissions } = await currentRole();
  requireCapability(role, "members.create", permissions);
  const data = memberCreatePayload(record);
  if (role !== "owner" && Object.prototype.hasOwnProperty.call(data, "planFee")) {
    throw new Error("Only the Owner can set a member plan fee");
  }
  return addDoc(collection(db, "members"), {
    ...data, createdAt: serverTimestamp(), createdBy: user.uid,
    updatedAt: serverTimestamp(), updatedBy: user.uid
  });
}
export async function createMemberWithInitialPayment(memberRecord, paymentRecord, stableMemberId = null) {
  const { user, role, permissions } = await currentRole();
  requireCapability(role, "members.create", permissions);
  const memberData = memberCreatePayload(memberRecord);
  const batch = writeBatch(db);
  // A stable ID makes a retry of the same local save idempotent instead of
  // creating another member document.
  const memberRef = stableMemberId
    ? doc(db, "members", String(stableMemberId))
    : doc(collection(db, "members"));
  batch.set(memberRef, {
    ...memberData, createdAt: serverTimestamp(), createdBy: user.uid,
    updatedAt: serverTimestamp(), updatedBy: user.uid
  });
  if (paymentRecord && Number(paymentRecord.amount) > 0) {
    requireCapability(role, "payments.create", permissions);
    const paymentData = transactionPayload({ ...paymentRecord, memberId: memberRef.id, memberName: memberData.name, phone: memberData.phone || "", ...await collectorDetails(user, role) });
    const paymentRef = stableMemberId
      ? doc(db, "payments", "initial_" + String(stableMemberId))
      : doc(collection(db, "payments"));
    batch.set(paymentRef, {
      ...paymentData, createdAt: serverTimestamp(), createdBy: user.uid
    });
  }
  await batch.commit();
  return { id: memberRef.id };
}

export async function updateMember(memberId, changes) {
  const { user, role, permissions } = await currentRole();
  requireCapability(role, "members.update", permissions);
  if (!memberId) throw new Error("Member ID required");
  const data = memberUpdatePayload(changes);
  return updateDoc(doc(db, "members", memberId), {
    ...data, updatedAt: serverTimestamp(), updatedBy: user.uid
  });
}
export async function deleteMember(memberId) {
  const { role, permissions } = await currentRole();
  requireCapability(role, "members.delete", permissions);
  if (!memberId) throw new Error("Member ID required");
  await deleteDoc(doc(db, "members", memberId));
}

export async function recordAttendance(record) {
  const { user, role, permissions } = await currentRole();
  requireCapability(role, "attendance.create", permissions);
  const data = attendancePayload(record);
  return addDoc(collection(db, "attendance"), {
    ...data, createdAt: serverTimestamp(), createdBy: user.uid
  });
}
export async function listAttendanceForDate(date) {
  const { role, permissions } = await currentRole();
  requireCapability(role, "attendance.read", permissions);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error("Invalid date");
  const snapshot = await getDocs(query(
    collection(db, "attendance"), where("date", "==", date), orderBy("date")
  ));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}
export async function listAllPayments() {
  const { role, permissions } = await currentRole();
  requireCapability(role, "payments.read.all", permissions);
  const snapshot = await getDocs(query(collection(db, "payments"), orderBy("date", "desc")));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

export async function listMyPayments() {
  const { user, role, permissions } = await currentRole();
  requireCapability(role, "payments.read.own", permissions);
  const snapshot = await getDocs(query(
    collection(db, "payments"), where("createdBy", "==", user.uid)
  ));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}
export async function deletePayment(paymentId) {
  const { role, permissions } = await currentRole();
  requireCapability(role, "payments.delete", permissions);
  if (!paymentId) throw new Error("Payment ID required");
  await deleteDoc(doc(db, "payments", paymentId));
}
export async function createPayment(record) {
  const { user, role, permissions } = await currentRole();
  requireCapability(role, "payments.create", permissions);
  const data = transactionPayload({ ...record, ...await collectorDetails(user, role) });
  return addDoc(collection(db, "payments"), {
    ...data, createdAt: serverTimestamp(), createdBy: user.uid
  });
}
export async function listAllRenewals() {
  const { role, permissions } = await currentRole();
  requireCapability(role, "renewals.read.all", permissions);
  const snapshot = await getDocs(query(collection(db, "renewals"), orderBy("date", "desc")));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}
export async function listMyRenewals() {
  const { user, role, permissions } = await currentRole();
  requireCapability(role, "renewals.read.own", permissions);
  const snapshot = await getDocs(query(
    collection(db, "renewals"), where("createdBy", "==", user.uid)
  ));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}
export async function deleteRenewal(renewalId) {
  const { role, permissions } = await currentRole();
  requireCapability(role, "renewals.delete", permissions);
  if (!renewalId) throw new Error("Renewal ID required");
  await deleteDoc(doc(db, "renewals", renewalId));
}
export async function saveRenewalBundle(memberId, renewalRecord, memberChanges, paymentRecord) {
  const { user, role, permissions } = await currentRole();
  requireCapability(role, "renewals.create", permissions);
  requireCapability(role, "members.update", permissions);
  if (paymentRecord) requireCapability(role, "payments.create", permissions);
  if (!memberId) throw new Error("Member ID required");
  const renewal = transactionPayload(renewalRecord);
  const changes = memberUpdatePayload(memberChanges);
  const batch = writeBatch(db);
  batch.set(doc(collection(db, "renewals")), { ...renewal, createdAt: serverTimestamp(), createdBy: user.uid });
  batch.update(doc(db, "members", memberId), { ...changes, updatedAt: serverTimestamp(), updatedBy: user.uid });
  if (paymentRecord) {
    const payment = transactionPayload({ ...paymentRecord, ...await collectorDetails(user, role) });
    batch.set(doc(collection(db, "payments")), { ...payment, createdAt: serverTimestamp(), createdBy: user.uid });
  }
  await batch.commit();
}
export async function saveRenewalWithPayment({ memberId, renewal, memberChanges, payment }) {
  const { user, role, permissions } = await currentRole();
  requireCapability(role, "renewals.create", permissions);
  requireCapability(role, "members.update", permissions);
  if (payment) requireCapability(role, "payments.create", permissions);
  if (!memberId) throw new Error("Member ID required");
  const renewalData = transactionPayload(renewal);
  const batch = writeBatch(db);
  const memberRef = doc(db, "members", memberId);
  const renewalRef = doc(collection(db, "renewals"));
  batch.set(renewalRef, { ...renewalData, createdAt: serverTimestamp(), createdBy: user.uid });
  batch.update(memberRef, { ...memberUpdatePayload(memberChanges), updatedAt: serverTimestamp(), updatedBy: user.uid });
  if (payment) {
    const paymentData = transactionPayload({ ...payment, ...await collectorDetails(user, role) });
    const paymentRef = doc(collection(db, "payments"));
    batch.set(paymentRef, { ...paymentData, createdAt: serverTimestamp(), createdBy: user.uid });
  }
  await batch.commit();
  return { renewalId: renewalRef.id };
}
export async function createRenewal(record) {
  const { user, role, permissions } = await currentRole();
  requireCapability(role, "renewals.create", permissions);
  const data = transactionPayload(record);
  return addDoc(collection(db, "renewals"), {
    ...data, createdAt: serverTimestamp(), createdBy: user.uid
  });
}
// Financial collections are deliberately owner-only.
export async function listExpenses() {
  const { role, permissions } = await currentRole();
  requireCapability(role, "expenses.read", permissions);
  const snapshot = await getDocs(query(collection(db, "expenses"), orderBy("date", "desc")));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}
export async function createExpense(record) {
  const { user, role, permissions } = await currentRole();
  requireCapability(role, "expenses.create", permissions);
  const data = expensePayload(record);
  return addDoc(collection(db, "expenses"), {
    ...data, createdAt: serverTimestamp(), createdBy: user.uid
  });
}
export async function updateExpense(expenseId, changes) {
  const { user, role, permissions } = await currentRole();
  requireCapability(role, "expenses.update", permissions);
  if (!expenseId) throw new Error("Expense ID required");
  const data = expensePayload(changes);
  await updateDoc(doc(db, "expenses", expenseId), { ...data, updatedAt: serverTimestamp(), updatedBy: user.uid });
}
export async function deleteExpense(expenseId) {
  const { role, permissions } = await currentRole();
  requireCapability(role, "expenses.delete", permissions);
  if (!expenseId) throw new Error("Expense ID required");
  await deleteDoc(doc(db, "expenses", expenseId));
}

// Owner-only gym settings, including opening balance.
export async function getGymSettings() {
  const { role, permissions } = await currentRole();
  requireCapability(role, "settings.read", permissions);
  const snapshot = await getDoc(doc(db, "settings", "main"));
  return snapshot.exists() ? snapshot.data() : { openingBalance: 0 };
}
export async function saveGymSettings(changes) {
  const { user, role, permissions } = await currentRole();
  requireCapability(role, "settings.update", permissions);
  const openingBalance = Number(changes?.openingBalance);
  if (!Number.isFinite(openingBalance) || openingBalance < 0) {
    throw new Error("Opening balance must be a valid non-negative amount");
  }
  await setDoc(doc(db, "settings", "main"), {
    openingBalance, updatedAt: serverTimestamp(), updatedBy: user.uid
  }, { merge: true });
  return { openingBalance };
}

// Owner-only staff profile management. Auth accounts are created separately in Firebase Console.
export async function listStaffProfiles() {
  const { role, permissions } = await currentRole();
  requireCapability(role, "staff.manage", permissions);
  const snapshot = await getDocs(collection(db, "users"));
  return snapshot.docs.map(item => ({ uid: item.id, ...item.data() })).filter(item => item.role === "staff");
}
export async function saveStaffProfile(input) {
  const { user, role, permissions } = await currentRole();
  requireCapability(role, "staff.manage", permissions);
  const { uid, profile } = staffProfilePayload(input);
  if (uid === user.uid) throw new Error("Owner account cannot be changed as Staff");
  await setDoc(doc(db, "users", uid), { ...profile, updatedAt: serverTimestamp(), updatedBy: user.uid }, { merge: true });
}
