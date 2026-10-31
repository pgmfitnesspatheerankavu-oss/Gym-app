// PGM FITNESS Firebase client foundation.
// Add the Firebase web-app configuration and fixed Owner UID before enabling.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, addDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = window.PGM_FIREBASE_CONFIG;
const OWNER_UID = window.PGM_OWNER_UID;
if (!firebaseConfig || !OWNER_UID) throw new Error("Firebase configuration is not installed.");

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export async function resolveRole(user) {
  if (!user) return { allowed: false, reason: "signed-out" };
  if (user.uid === OWNER_UID) return { allowed: true, role: "owner", uid: user.uid };
  const profile = await getDoc(doc(db, "users", user.uid));
  if (!profile.exists()) return { allowed: false, reason: "not-provisioned" };
  const data = profile.data();
  if (data.role !== "staff" || data.active !== true) return { allowed: false, reason: "inactive-or-invalid-role" };
  // Do not grant Staff access to the legacy localStorage app.
  return { allowed: false, reason: "staff-cloud-migration-pending", role: "staff" };
}

export async function signIn(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return resolveRole(credential.user);
}
export async function signOutUser() { await signOut(auth); }
export function watchAuth(callback) {
  return onAuthStateChanged(auth, async user => {
    try { callback(user ? await resolveRole(user) : { allowed: false, reason: "signed-out" }, user); }
    catch (error) { callback({ allowed: false, reason: "role-check-failed", error }, user); }
  });
}

// Owner-only legacy-safe inventory check; does not change or migrate any data.
export async function getCloudCollectionCounts() {
  const result = {};
  for (const name of ["members", "payments", "renewals", "attendance", "expenses"]) {
    result[name] = (await getDocs(collection(db, name))).size;
  }
  return result;
}

// Staff/Owner transaction records are append-only at the Firestore rules layer.
export async function addPayment(record, user = auth.currentUser) {
  if (!user) throw new Error("Login required");
  const role = await resolveRole(user);
  if (!role.allowed) throw new Error("Account is not enabled for cloud records");
  return addDoc(collection(db, "payments"), { ...record, createdBy: user.uid, createdAt: serverTimestamp() });
}
export async function addRenewal(record, user = auth.currentUser) {
  if (!user) throw new Error("Login required");
  const role = await resolveRole(user);
  if (!role.allowed) throw new Error("Account is not enabled for cloud records");
  return addDoc(collection(db, "renewals"), { ...record, createdBy: user.uid, createdAt: serverTimestamp() });
}
