// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
//   node scripts/create-user.mjs --email=jane@alphakdb.com --password='TempPass123!' [--firstName=Jane] [--lastName=Doe]
//
// Requires a Firebase service-account key (Console → Project settings →
// Service accounts → Generate new private key). Never commit that file.

import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "";
}

function seedNameFromEmail(email) {
  const local = (email || "").split("@")[0] || "";
  if (/[._-]/.test(local)) {
    const parts = local.split(/[._-]/).filter(Boolean);
    return { firstName: parts[0] ? cap(parts[0]) : "", lastName: parts[1] ? cap(parts[1]) : "" };
  }
  return { firstName: "", lastName: "" };
}

const args = parseArgs();
const { email, password } = args;

if (!email || !password) {
  console.error("Usage: node scripts/create-user.mjs --email=<email> --password=<password> [--firstName=..] [--lastName=..] [--company=..]");
  process.exit(1);
}

const credential = args.serviceAccount
  ? cert(JSON.parse(readFileSync(args.serviceAccount, "utf8")))
  : applicationDefault();

initializeApp({ credential });

const auth = getAuth();
const db = getFirestore();

const seeded = seedNameFromEmail(email);
const firstName = args.firstName || seeded.firstName;
const lastName = args.lastName || seeded.lastName;
const company = args.company || ((email || "").endsWith("@alphakdb.com") ? "alphakdb" : "external");

try {
  const userRecord = await auth.createUser({
    email,
    password,
    displayName: [firstName, lastName].filter(Boolean).join(" ") || undefined,
  });

  await db.doc(`users/${userRecord.uid}`).set({
    uid: userRecord.uid,
    email,
    firstName,
    lastName,
    company,
    role: "user",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  console.log(`Created user ${email} (uid: ${userRecord.uid}) and Firestore profile.`);
} catch (err) {
  console.error("Failed to create user:", err.message);
  process.exit(1);
}
