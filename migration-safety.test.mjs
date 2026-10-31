import test from "node:test";
import assert from "node:assert/strict";
import {
  stableMigrationJson, classifyMigrationTarget, buildMigrationPreflight
} from "./migration-safety.js";

const op = { collection: "members", id: "legacy_m_1", data: { name: "Anu", amount: 500, nested: { b: 2, a: 1 } } };
const migrated = {
  ...op.data, legacySource: "pgm_fitness_data", migrationVersion: 1,
  migrationSourceData: { nested: { a: 1, b: 2 }, amount: 500, name: "Anu" }
};

test("stable JSON ignores object key order but preserves array order", () => {
  assert.equal(stableMigrationJson({ b: 2, a: 1 }), stableMigrationJson({ a: 1, b: 2 }));
  assert.notEqual(stableMigrationJson([1, 2]), stableMigrationJson([2, 1]));
});

test("missing target is eligible for write", () => {
  assert.equal(classifyMigrationTarget(op, null), "write");
});

test("identical prior migration is recognized for safe retry", () => {
  assert.equal(classifyMigrationTarget(op, migrated), "already-migrated");
});

test("unrelated or modified target is a collision, never an overwrite", () => {
  assert.equal(classifyMigrationTarget(op, { ...migrated, name: "Changed" }), "already-migrated");
  assert.equal(classifyMigrationTarget(op, { name: "Other member" }), "collision");
  assert.equal(classifyMigrationTarget(op, { ...migrated, migrationSourceData: { name: "Other" } }), "collision");
});

test("preflight separates writes, completed rows and collisions", () => {
  const result = buildMigrationPreflight(
    [op, { collection: "expenses", id: "e1", data: { amount: 100 } }],
    new Map([["members/legacy_m_1", migrated], ["expenses/e1", { amount: 100 }]])
  );
  assert.equal(result.write.length, 0);
  assert.equal(result.alreadyMigrated.length, 1);
  assert.deepEqual(result.collisions, ["expenses/e1"]);
});
