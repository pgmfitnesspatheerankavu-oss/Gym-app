// Shared backup validation for the browser app and automated tests.
(function (root) {
  function validateBackupData(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return false;
    if (!Array.isArray(data.members) || !Array.isArray(data.expenses)) return false;
    if (data.members.some(item => !item || typeof item !== "object" || Array.isArray(item))) return false;
    if (data.expenses.some(item => !item || typeof item !== "object" || Array.isArray(item))) return false;
    if (data.openingBalance !== undefined &&
        (typeof data.openingBalance !== "number" || !Number.isFinite(data.openingBalance))) return false;
    return true;
  }

  function parseBackup(parsed) {
    let data;
    if (parsed && parsed.app !== undefined) {
      if (parsed.app !== "PGM FITNESS" || parsed.backupVersion !== 1 ||
          typeof parsed.exportedAt !== "string" || !Number.isFinite(Date.parse(parsed.exportedAt))) {
        throw new Error("Unsupported or invalid backup format");
      }
      data = parsed.data;
    } else {
      data = parsed; // Legacy unwrapped backup.
    }
    if (!validateBackupData(data)) throw new Error("Invalid or incomplete backup data");
    return data;
  }

  root.PGMBackupValidation = Object.freeze({ validateBackupData, parseBackup });
})(globalThis);
