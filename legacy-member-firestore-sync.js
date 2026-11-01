// Bridge the original dashboard's Add/Edit Member form to the same Firestore
// collections used by Cloud Members. Local backup storage remains untouched.
import {
  createMemberWithInitialPayment,
  updateMember,
  listMembers
} from "./cloud-data.js";

function toCloudMember(member) {
  const joinDate = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(member.date || "")
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
        date: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(member.date || "")
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


// One-time recovery path for members already saved in the old localStorage app.
// It links exact existing records and creates only unmatched members.
const recoveryButton = document.createElement("button");
recoveryButton.type = "button";
recoveryButton.textContent = "Sync Old Members";
recoveryButton.style.cssText = "position:fixed;right:12px;bottom:112px;z-index:6000;padding:10px 14px;border:0;border-radius:22px;background:#166534;color:white;font-weight:700;box-shadow:0 2px 8px #0005";
recoveryButton.addEventListener("click", syncExistingLocalMembers);
document.body.append(recoveryButton);

function memberMatchKey(member) {
  const name = String(member.name || "").trim().toLocaleLowerCase();
  const phone = String(member.phone || "").replace(/\D/g, "");
  return name + "|" + phone;
}

async function syncExistingLocalMembers() {
  if (typeof window.PGMPrepareLegacyMemberSync !== "function" ||
      typeof window.PGMUpdateLegacyMemberSync !== "function") {
    alert("Local member data is not ready. Reload the app and try again.");
    return;
  }
  const localMembers = window.PGMPrepareLegacyMemberSync();
  if (!localMembers.length) {
    alert("Local app-ൽ sync ചെയ്യാനുള്ള member records ഇല്ല.");
    return;
  }
  if (!window.confirm(
    localMembers.length + " local member record(s) പരിശോധിച്ച് Firestore-ൽ ഇല്ലാത്തവ മാത്രം ചേർക്കട്ടേ? " +
    "പേര് + ഫോൺ നമ്പർ കൃത്യമായി ഒത്താൽ നിലവിലുള്ള cloud record-ുമായി link ചെയ്യും. " +
    "ഒന്നും delete ചെയ്യില്ല."
  )) return;

  recoveryButton.disabled = true;
  const originalLabel = recoveryButton.textContent;
  let linked = 0, created = 0, skipped = 0;
  const errors = [];
  try {
    const cloudMembers = await listMembers();
    const existingKeys = new Map();
    for (const cloudMember of cloudMembers) {
      const key = memberMatchKey(cloudMember);
      if (!existingKeys.has(key)) existingKeys.set(key, []);
      existingKeys.get(key).push(cloudMember);
    }

    for (const localMember of localMembers) {
      if (localMember.cloudMemberId) { skipped++; continue; }
      const key = memberMatchKey(localMember);
      const matches = existingKeys.get(key) || [];
      if (matches.length === 1) {
        window.PGMUpdateLegacyMemberSync(localMember.cloudSyncKey, matches[0].id);
        linked++;
        continue;
      }
      if (matches.length > 1) {
        skipped++;
        errors.push(localMember.name + ": same name/phone multiple cloud matches; skipped for safety");
        continue;
      }

      try {
        const cloudData = toCloudMember(localMember);
        const paid = Number(localMember.amount || 0);
        const payment = paid > 0 ? {
          amount: paid,
          feeAmount: Number(localMember.totalFee || 0),
          date: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(localMember.date || "")
            ? localMember.date
            : new Date().toISOString().slice(0, 10),
          payMode: String(localMember.payMode || "Cash"),
          type: "membership",
          plan: String(localMember.plan || ""),
          expiryDate: String(localMember.expiryDate || "")
        } : null;
        const stableId = "pgm_" + String(localMember.cloudSyncKey).replace(/[^a-zA-Z0-9_-]/g, "_");
        const result = await createMemberWithInitialPayment(cloudData, payment, stableId);
        window.PGMUpdateLegacyMemberSync(localMember.cloudSyncKey, result.id);
        created++;
      } catch (error) {
        errors.push(localMember.name + ": " + (error?.message || "Firestore error"));
      }
    }

    const summary = "Local members sync complete. Linked: " + linked +
      ", newly added: " + created + ", skipped: " + skipped +
      (errors.length ? "\nDetails:\n" + errors.join("\n") : "");
    alert(summary);
  } catch (error) {
    alert("Local member sync failed: " + (error?.message || "Firestore error"));
  } finally {
    recoveryButton.disabled = false;
    recoveryButton.textContent = originalLabel;
  }
}
