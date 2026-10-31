// Pure preflight policy for safe, retryable migration writes.
export function stableMigrationJson(value) {
  if (Array.isArray(value)) return "[" + value.map(stableMigrationJson).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(k =>
      JSON.stringify(k) + ":" + stableMigrationJson(value[k])
    ).join(",") + "}";
  }
  return JSON.stringify(value);
}

function actualLegacyFields(data) {
  const ignored = new Set([
    "legacySource", "migrationVersion", "migrationSourceData",
    "migratedAt", "migratedBy", "createdBy"
  ]);
  return Object.fromEntries(Object.entries(data || {}).filter(([key]) => !ignored.has(key)));
}

export function classifyMigrationTarget(operation, existingData) {
  if (existingData == null) return "write";
  if (existingData.legacySource !== "pgm_fitness_data" ||
      existingData.migrationVersion !== 1 ||
      stableMigrationJson(existingData.migrationSourceData) !== stableMigrationJson(operation.data) ||
      stableMigrationJson(actualLegacyFields(existingData)) !== stableMigrationJson(operation.data)) {
    return "collision";
  }
  return "already-migrated";
}

export function buildMigrationPreflight(operations, existingByKey) {
  const write = [];
  const alreadyMigrated = [];
  const collisions = [];
  for (const operation of operations) {
    const key = operation.collection + "/" + operation.id;
    const status = classifyMigrationTarget(operation, existingByKey.get(key));
    if (status === "write") write.push(operation);
    else if (status === "already-migrated") alreadyMigrated.push(operation);
    else collisions.push(key);
  }
  return { write, alreadyMigrated, collisions };
}
