import { signIn, signOutUser, watchAuth } from "./firebase-client.js";

const panel = document.getElementById("pgmAuthGate");
const form = document.getElementById("pgmLoginForm");
const email = document.getElementById("pgmLoginEmail");
const password = document.getElementById("pgmLoginPassword");
const message = document.getElementById("pgmLoginMessage");
const logout = document.getElementById("pgmLogoutButton");

function showMessage(value) { message.textContent = value || ""; }
function lockApp() { panel.hidden = false; document.body.classList.add("pgm-locked"); }
function unlockOwner() { panel.hidden = true; document.body.classList.remove("pgm-locked"); }

lockApp();
watchAuth(async (role, user) => {
  if (role.allowed && role.role === "owner") {
    unlockOwner();
    return;
  }
  lockApp();
  if (user) {
    showMessage("ഈ അക്കൗണ്ടിന് ഇപ്പോൾ PGM FITNESS access അനുവദിച്ചിട്ടില്ല. Owner account ഉപയോഗിക്കുക.");
    try { await signOutUser(); } catch (_) {}
  }
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  const button = form.querySelector("button");
  button.disabled = true;
  showMessage("Login പരിശോധിക്കുന്നു…");
  try {
    const role = await signIn(email.value, password.value);
    if (role.allowed && role.role === "owner") {
      password.value = "";
      showMessage("");
      unlockOwner();
    } else {
      await signOutUser();
      showMessage("ഈ അക്കൗണ്ടിന് Owner access ഇല്ല.");
    }
  } catch (error) {
    const code = error?.code || "";
    if (code.includes("invalid-credential") || code.includes("user-not-found") || code.includes("wrong-password")) {
      showMessage("Email അല്ലെങ്കിൽ Password ശരിയല്ല.");
    } else if (code.includes("too-many-requests")) {
      showMessage("കൂടുതൽ ശ്രമങ്ങൾ ഉണ്ടായിട്ടുണ്ട്. കുറച്ച് കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കുക.");
    } else {
      showMessage("Login പരാജയപ്പെട്ടു. Firebase connection / Email-Password setting പരിശോധിക്കുക.");
      console.error("PGM login error:", error);
    }
  } finally {
    button.disabled = false;
  }
});

logout.addEventListener("click", async () => {
  await signOutUser();
  lockApp();
  showMessage("Logout ചെയ്തു.");
});
