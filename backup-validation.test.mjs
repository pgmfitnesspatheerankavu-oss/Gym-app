import test from "node:test";
import assert from "node:assert/strict";
import "./backup-validation.js";

const { validateBackupData, parseBackup } = globalThis.PGMBackupValidation;
const valid = { openingBalance: 120, members: [{ name: "Member" }], expenses: [{ title: "Rent", amount: 50 }] };

test("accepts a valid version 1 backup", () => {
  const parsed = { app: "PGM FITNESS", backupVersion: 1, exportedAt: "2026-10-31T00:00:00.000Z", data: valid };
  assert.deepEqual(parseBackup(parsed), valid);
});

test("accepts legacy unwrapped backups", () => {
  assert.deepEqual(parseBackup(valid), valid);
});

test("rejects unknown app, unsupported version, and invalid timestamp", () => {
  for (const parsed of [
    { app: "Other", backupVersion: 1, exportedAt: "2026-10-31", data: valid },
    { app: "PGM FITNESS", backupVersion: 2, exportedAt: "2026-10-31", data: valid },
    { app: "PGM FITNESS", backupVersion: 1, exportedAt: "not-a-date", data: valid }
  ]) assert.throws(() => parseBackup(parsed));
});

test("rejects missing arrays, non-object rows, and invalid opening balance", () => {
  for (const data of [
    { members: [], expenses: null },
    { members: [null], expenses: [] },
    { members: [], expenses: ["bad"] },
    { members: [], expenses: [], openingBalance: "120" },
    { members: [], expenses: [], openingBalance: Infinity }
  ]) assert.equal(validateBackupData(data), false);
});

test("does not mutate imported data", () => {
  const source = structuredClone(valid);
  const before = JSON.stringify(source);
  parseBackup(source);
  assert.equal(JSON.stringify(source), before);
});
