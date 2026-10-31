// Pure input policy shared by the Firestore adapter and Node tests.
const MEMBER_FIELDS = new Set([
  "name", "phone", "address", "gender", "joinDate", "plan",
  "planFee", "expiryDate", "status", "notes"
]);
const MEMBER_UPDATE_FIELDS = new Set([...MEMBER_FIELDS]);
const TRANSACTION_FIELDS = new Set([
  "memberId", "memberName", "phone", "amount", "feeAmount",
  "date", "payMode", "type", "plan", "expiryDate", "notes"
]);
const ATTENDANCE_FIELDS = new Set([
  "date", "memberId", "memberKey", "memberName", "phone", "time"
]);
const EXPENSE_FIELDS = new Set(["title", "amount", "date", "notes"]);

export function pickAllowedFields(record, allowed) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("Invalid record");
  }
  return Object.fromEntries(Object.entries(record)
    .filter(([key, value]) => allowed.has(key) && value !== undefined));
}
export function memberCreatePayload(record) {
  const data = pickAllowedFields(record, MEMBER_FIELDS);
  if (!String(data.name || "").trim()) throw new Error("Member name required");
  return data;
}
export function memberUpdatePayload(record) {
  return pickAllowedFields(record, MEMBER_UPDATE_FIELDS);
}
export function transactionPayload(record) {
  const data = pickAllowedFields(record, TRANSACTION_FIELDS);
  if (!Number.isFinite(Number(data.amount)) || Number(data.amount) <= 0) {
    throw new Error("A positive transaction amount is required");
  }
  if (!data.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(data.date))) {
    throw new Error("A valid transaction date is required");
  }
  return data;
}
export function attendancePayload(record) {
  const data = pickAllowedFields(record, ATTENDANCE_FIELDS);
  if (!data.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(data.date))) {
    throw new Error("A valid attendance date is required");
  }
  if (!data.memberId && !data.memberKey && !data.phone) {
    throw new Error("Attendance member reference required");
  }
  return data;
}
export function expensePayload(record) {
  const data = pickAllowedFields(record, EXPENSE_FIELDS);
  if (!String(data.title || "").trim()) throw new Error("Expense title required");
  if (!Number.isFinite(Number(data.amount)) || Number(data.amount) < 0) {
    throw new Error("A valid expense amount is required");
  }
  if (!data.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(data.date))) {
    throw new Error("A valid expense date is required");
  }
  return data;
}
