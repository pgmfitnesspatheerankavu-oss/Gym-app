// Supabase Storage public client configuration for member photos.
// Publishable keys are intended for browser use; never place a secret/service_role key here.
const SUPABASE_URL = "https://hkgmdvmptlqutfrayhuo.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_XdQd07Y_SEONUaRHnkeFaQ_C8NXgPEo";
const BUCKET = "member-photos";

export async function uploadMemberPhoto(memberId, file) {
  if (!memberId) throw new Error("Member ID is missing.");
  if (!(file instanceof File) || !file.type.startsWith("image/")) throw new Error("Please select an image file.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Image must be smaller than 5 MB.");
  const safeName = "profile-" + Date.now() + "-" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = memberId + "/" + safeName;
  const endpoint = SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: "Bearer " + SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": file.type,
      "x-upsert": "true"
    },
    body: file
  });
  if (!response.ok) {
    let detail = "";
    try { const data = await response.json(); detail = data.message || data.error || data.statusCode || ""; } catch (_) {}
    if (response.status === 403 || response.status === 400) throw new Error("Supabase Storage upload blocked. Supabase SQL Editor-ൽ നൽകിയ Storage policy ചേർക്കുക. " + detail);
    throw new Error("Supabase photo upload failed (" + response.status + "). " + detail);
  }
  return { path, url: SUPABASE_URL + "/storage/v1/object/public/" + BUCKET + "/" + path.split("/").map(encodeURIComponent).join("/") };
}
