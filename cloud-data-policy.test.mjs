import test from "node:test";
import assert from "node:assert/strict";
import {
  memberCreatePayload, memberUpdatePayload, transactionPayload,
  attendancePayload, expensePayload
} from "./cloud-data-policy.js";

test("member create strips injected fields and requires a name", () => {
  assert.deepEqual(memberCreatePayload({name:"A",payments:[{amount:999}],createdBy:"x"}), {name:"A"});
  assert.throws(() => memberCreatePayload({phone:"123"}), /name required/);
});
test("member update only allows profile fields", () => {
  assert.deepEqual(memberUpdatePayload({name:"B",payments:[],totalFee:500}), {name:"B"});
});
test("transaction payload validates amount/date and strips ownership fields", () => {
  assert.deepEqual(transactionPayload({amount:250,date:"2026-10-30",createdBy:"fake",memberId:"m1"}), {memberId:"m1",amount:250,date:"2026-10-30"});
  assert.throws(() => transactionPayload({amount:-1,date:"2026-10-30"}), /positive/);
  assert.throws(() => transactionPayload({amount:5,date:"30-10-2026"}), /date/);
});
test("attendance requires a date and member reference", () => {
  assert.deepEqual(attendancePayload({date:"2026-10-30",memberKey:"123",createdBy:"fake"}), {date:"2026-10-30",memberKey:"123"});
  assert.throws(() => attendancePayload({date:"2026-10-30"}), /reference/);
});
test("expense validates required fields and strips untrusted metadata", () => {
  assert.deepEqual(expensePayload({title:"Rent",amount:100,date:"2026-10-30",createdBy:"fake"}), {title:"Rent",amount:100,date:"2026-10-30"});
  assert.throws(() => expensePayload({title:"",amount:100,date:"2026-10-30"}), /title/);
});
