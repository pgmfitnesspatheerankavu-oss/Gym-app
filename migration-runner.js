// PGM FITNESS — owner-confirmed, collision-safe legacy migration.
// Additive only: never deletes local data and never overwrites an existing cloud document.
import { buildLegacyMigrationPlan } from "./migration-plan.js";
import { verifyMigrationPlan } from "./migration-verification.js";
import { stableMigrationJson, buildMigrationPreflight } from "./migration-safety.js";
export { verifyMigrationPlan } from "./migration-verification.js";
import {
  doc, getDoc, writeBatch, serverTimestamp
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
  if (plan.warnings.length) {
    throw new Error("Backup-ൽ മുന്നറിയിപ്പുകളുണ്ട്. ആദ്യം Preview പരിശോധിച്ച് അവ പരിഹരിക്കണം.");
  }

  // Preflight every deterministic target before writing anything. Existing documents
  // are accepted only when they are already verified copies of this same legacy row.
  const existingByKey = new Map();
  for (const op of plan.operations) {
    const snap = await getDoc(doc(db, op.collection, op.id));
    existingByKey.set(op.collection + "/" + op.id, snap.exists() ? snap.data() : null);
  }
  const preflight = buildMigrationPreflight(plan.operations, existingByKey);
  if (preflight.collisions.length) {
    throw new Error("Cloud രേഖകൾ ഇതിനകം നിലനിൽക്കുന്നു; overwrite ഒഴിവാക്കി Migration നിർത്തി: " + preflight.collisions.join(", "));
  }
  const missing = preflight.write;
  const alreadyMigrated = preflight.alreadyMigrated;

  // Persist a source snapshot alongside each record so retries can distinguish an
  // identical prior migration from unrelated or manually changed cloud data.
  let written = 0;
  for (let offset = 0; offset < missing.length; offset += CHUNK_SIZE) {
    const batch = writeBatch(db);
    const chunk = missing.slice(offset, offset + CHUNK_SIZE);
    for (const op of chunk) {
      const ref = doc(db, op.collection, op.id);
      batch.set(ref, {
        ...op.data,
        ...(op.collection === "payments" || op.collection === "renewals" || op.collection === "attendance"
          ? { createdBy: user.uid } : {}),
        legacySource: "pgm_fitness_data",
        migrationVersion: 1,
        migrationSourceData: op.data,
        migratedAt: serverTimestamp(),
        migratedBy: user.uid
      }, { merge: false });
    }
    await batch.commit();
    written += chunk.length;
  }

  // Read-back verifies both the source snapshot and migration marker for every row.
  const readBack = {};
  for (const name of Object.keys(verification.collectionCounts)) readBack[name] = 0;
  for (const op of plan.operations) {
    const snap = await getDoc(doc(db, op.collection, op.id));
    if (!snap.exists()) throw new Error("Migration verification failed: " + op.collection + "/" + op.id);
    const data = snap.data();
    if (data.legacySource !== "pgm_fitness_data" || data.migrationVersion !== 1 ||
        stableMigrationJson(data.migrationSourceData) !== stableMigrationJson(op.data)) {
      throw new Error("Migration data mismatch: " + op.collection + "/" + op.id);
    }
    readBack[op.collection]++;
  }
  for (const [name, expected] of Object.entries(verification.collectionCounts)) {
    if (readBack[name] !== expected) throw new Error("Read-back count mismatch: " + name);
  }
  return {
    success: true, written, alreadyMigrated: alreadyMigrated.length,
    expected: verification.collectionCounts, verified: readBack,
    totals: verification, localDataPreserved: true, overwroteExistingCloudData: false
  };
}
