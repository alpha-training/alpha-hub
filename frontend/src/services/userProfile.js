// src/services/userProfile.js
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "";
}

function seedNameFromEmail(email) {
  if (!email) return { firstName: "", lastName: "" };

  const local = email.split("@")[0] || "";

  // firstname.lastname or firstname_lastname or firstname-lastname
  if (/[._-]/.test(local)) {
    const parts = local.split(/[._-]/).filter(Boolean);
    return {
      firstName: parts[0] ? cap(parts[0]) : "",
      lastName: parts[1] ? cap(parts[1]) : "",
    };
  }

  return { firstName: "", lastName: "" };
}

export async function ensureUserProfile(db, authUser) {
  const ref = doc(db, "users", authUser.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) return snap.data();

  const { firstName, lastName } = seedNameFromEmail(authUser.email);

  const profile = {
    uid: authUser.uid,
    email: authUser.email ?? "",
    firstName,
    lastName,
    company: (authUser.email || "").endsWith("@alphakdb.com") ? "alphakdb" : "external",
    role: "user",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(ref, profile, { merge: true });
  return profile;
}
