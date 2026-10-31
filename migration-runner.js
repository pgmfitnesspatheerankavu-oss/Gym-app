// PGM FITNESS — owner-confirmed, additive legacy migration runner.
// This module never deletes or modifies localStorage. It writes deterministic IDs
// in batches and requires an explicit owner confirmation before the first write.
import { buildLegacyMigrationPlan } from "./migration-plan.js";
import { verifyMigrationPlan } from "./migration-verification.js";
export { verifyMigrationPlan } from "./migration-verification.js";
import {
  collection, doc, getDoc, getDocs, limit, query, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { auth, db, resolveRole } from "./firebase-client.js";

const CONFIRMATION = "MIGRATE PGM FITNESS";
const CHUNK_SIZE = 400;

export function previewCloudMigration(rawBackup) {
  const plan = buildLegacyMigrationPlan(rawBackup);
  return { plan, verification: verifyMigrationPlan(plan) };
}

export async function runOwnerMigration(rawBackup, confirmationText) {
  if (confirmationText !== CONFIRMATION) throw new Error("ഉടമയുടെ വ്യക്തമായ confirmation ആവശ്യമാണ്.");
  const user = auth.currentUser;
  if (!user) throw new Error("ആദ്യം Owner login ചെയ്യുക.");
  const role = await resolveRole(user);
  if (!role.allowed || role.role !== "owner") throw new Error("ഈ Migration Owner-ന് മാത്രം അനുവദിച്ചിരിക്കുന്നു.");

  const { plan, verification } = previewCloudMigration(rawBackup);
  if (plan.warnings.some(w => w.includes("തെറ്റായ") || w.includes("അസാധുവായ") || w.includes("പേര് ഇല്ല"))) {
    throw new Error("Backup warnings പരിഹരിച്ചശേഷം മാത്രം Migration നടത്താം.");
  }

  // Refuse to mix with an existing non-legacy cloud dataset.
  const existing = await getDocs(query(collection(db, "members"), limit(1)));
  if (!existing.empty) {
    const first = existing.docs[0];
    if (first.data().legacySource !== "pgm_fitness_data") {
      throw new Error("Cloud members collection ഇതിനകം ഉപയോഗത്തിലുണ്ട്. സുരക്ഷിത reconciliation ആവശ്യമാണ്.");
    }
  }

  const operations = plan.operations;
  let written = 0;
  for (let offset = 0; offset < operations.length; offset += CHUNK_SIZE) {
    const batch = writeBatch(db);
    const chunk = operations.slice(offset, offset + CHUNK_SIZE);
    for (const op of chunk) {
      const ref = doc(db, op.collection, op.id);
      const data = {
        ...op.data,
        ...(op.collection === "payments" || op.collection === "renewals" || op.collection === "attendance"
          ? { createdBy: user.uid } : {}),
        migrationVersion: 1,
        migratedAt: serverTimestamp(),
        migratedBy: user.uid
      };
      batch.set(ref, data, { merge: false });
    }
    await batch.commit();
    written += chunk.length;
  }

  // Read-back verification checks every expected deterministic document.
  const readBack = {};
  for (const name of Object.keys(verification.collectionCounts)) {
    readBack[name] = 0;
  }
  for (const op of operations) {
    const snap = await getDoc(doc(db, op.collection, op.id));
    if (!snap.exists() || snap.data().legacySource !== "pgm_fitness_data") {
      throw new Error("Migration verification failed at " + op.collection + "/" + op.id);
    }
    readBack[op.collection]++;
  }
  for (const [name, expected] of Object.entries(verification.collectionCounts)) {
    if (readBack[name] !== expected) throw new Error("Read-back count mismatch: " + name);
  }
  return {
    success: true,
    written,
    expected: verification.collectionCounts,
    verified: readBack,
    totals: verification,
    localDataPreserved: true
  };
}
