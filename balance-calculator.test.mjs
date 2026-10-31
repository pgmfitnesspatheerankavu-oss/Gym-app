import test from "node:test";
import assert from "node:assert/strict";
import { calculateBalanceDue } from "./balance-calculator.js";

test("balance uses only payments in the current plan cycle", () => {
  const member = { id: "m1", planFee: 1200, joinDate: "2026-01-01", planStartDate: "2026-10-01" };
  const payments = [
    { memberId: "m1", amount: 500, date: "2026-09-15" },
    { memberId: "m1", amount: 300, date: "2026-10-03" },
    { memberId: "m1", amount: 200, date: "2026-11-01" },
    { memberId: "m2", amount: 1000, date: "2026-10-10" }
  ];
  assert.equal(calculateBalanceDue(member, payments, "2026-10-31"), 900);
});
test("balance never becomes negative and handles missing fee", () => {
  assert.equal(calculateBalanceDue({id:"m1",planFee:100},[{memberId:"m1",amount:150,date:"2026-01-01"}],"2026-12-31"),0);
  assert.equal(calculateBalanceDue({id:"m1"},[],"2026-12-31"),0);
});
