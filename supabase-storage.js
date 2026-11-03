// Firebase Storage upload for authenticated PGM FITNESS users.
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js";
import { auth, storage } from "./firebase-client.js";

export async function uploadMemberPhoto(memberId, file) {
  if (!memberId) throw new Error("Member ID is missing.");
  if (!auth.currentUser) throw new Error("Login required to upload a member photo.");
  if (!(file instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("JPG, PNG, അല്ലെങ്കിൽ WEBP photo മാത്രം തിരഞ്ഞെടുക്കുക.");
  }
  if (file.size === 0 || file.size > 5 * 1024 * 1024) {
    throw new Error("Photo 0 bytes ആകരുത്; 5 MB-ൽ താഴെയായിരിക്കണം.");
  }
  const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const path = `member-photos/${memberId}/profile-${Date.now()}.${extension}`;
  const photoRef = ref(storage, path);
  await uploadBytes(photoRef, file, { contentType: file.type });
  const url = await getDownloadURL(photoRef);
  return { path, url };
}
