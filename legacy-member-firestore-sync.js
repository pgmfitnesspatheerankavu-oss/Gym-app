// Bridge the original dashboard's Add/Edit Member form to the same Firestore
// collections used by Cloud Members. Local backup storage remains untouched.
import {
  createMemberWithInitialPayment,
  updateMember
} from "./cloud-data.js";

function toCloudMember(member) {
  const joinDate = /^\\d{4}-\\d{2}-\\d{2}$/.test(member.date || "")
    ? member.date
    : new Date().toISOString().slice(0, 10);
  const data = {
    name: String(member.name || "").trim(),
    phone: String(member.phone || ""),
    address: String(member.address || ""),
    plan: String(member.plan || ""),
    planFee: Number(member.totalFee || 0),
    registrationFee: 0,
    joinDate,
    planStartDate: joinDate,
    expiryDate: String(member.expiryDate || ""),
    status: "active",
    notes: ""
  };
  if (!data.name) throw new Error("Member name is required.");
  if (!Number.isFinite(data.planFee) || data.planFee < 0) {
    throw new Error("Member fee is invalid.");
  }
  return data;
}

window.addEventListener("pgm:member-saved", async (event) => {
  const detail = event.detail || {};
  const member = detail.member;
  if (!member || !detail.localSyncKey) return;

  try {
    const cloudData = toCloudMember(member);
    let result;
    if (detail.isUpdate && detail.cloudMemberId) {
      await updateMember(detail.cloudMemberId, cloudData);
      result = { id: detail.cloudMemberId };
    } else {
      const paid = Number(member.amount || 0);
      const payment = paid > 0 ? {
        amount: paid,
        feeAmount: Number(member.totalFee || 0),
        date: /^\\d{4}-\\d{2}-\\d{2}$/.test(member.date || "")
          ? member.date
          : new Date().toISOString().slice(0, 10),
        payMode: String(member.payMode || "Cash"),
        type: "membership",
        plan: String(member.plan || ""),
        expiryDate: String(member.expiryDate || "")
      } : null;
      const stableId = "pgm_" + String(detail.localSyncKey).replace(/[^a-zA-Z0-9_-]/g, "_");
      result = await createMemberWithInitialPayment(cloudData, payment, stableId);
    }
    if (typeof detail.onSuccess === "function") detail.onSuccess(result.id);
    window.dispatchEvent(new CustomEvent("pgm:member-cloud-sync", {
      detail: { ok: true, memberId: result.id, name: member.name }
    }));
  } catch (error) {
    console.error("PGM Firestore member sync failed:", error);
    const message = error?.message || "Unknown Firestore error";
    if (typeof detail.onError === "function") detail.onError(message);
    window.dispatchEvent(new CustomEvent("pgm:member-cloud-sync", {
      detail: { ok: false, name: member.name, message }
    }));
  }
});
