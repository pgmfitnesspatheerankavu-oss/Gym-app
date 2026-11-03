// Owner-only Staff profile administration. Auth accounts are created in Firebase Console.
import { collection, doc, getDocs, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { auth, db, resolveRole } from "./firebase-client.js";
import { staffProfilePayload } from "./staff-management-policy.js";

async function requireOwner() {
  const user = auth.currentUser;
  if (!user) throw new Error("Owner login required");
  const access = await resolveRole(user);
  if (!access.allowed || access.role !== "owner") throw new Error("Only the Owner can manage Staff");
  return user;
}

export async function listStaffProfiles() {
  await requireOwner();
  const snapshot = await getDocs(collection(db, "users"));
  return snapshot.docs
    .map(item => ({ uid: item.id, ...item.data() }))
    .filter(item => item.role === "staff")
    .map(({ uid, displayName = "", active = false }) => ({ uid, displayName, active }));
}

export async function saveStaffProfile(input) {
  const user = await requireOwner();
  const { uid, profile } = staffProfilePayload(input);
  if (uid === user.uid) throw new Error("Owner account cannot be registered as Staff");
  await setDoc(doc(db, "users", uid), {
    ...profile, updatedAt: serverTimestamp(), updatedBy: user.uid
  }, { merge: true });
  return { uid, ...profile };
}
