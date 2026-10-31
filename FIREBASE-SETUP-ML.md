# PGM FITNESS – Firebase setup (development branch)

Firebase project: `pgmfitness-5e107`

## Prepared in this development branch
- Firestore rules identify the Owner by a fixed Firebase Auth UID.
- Only the Owner can manage documents under `users/{uid}`, so Staff cannot promote themselves.
- The rules define a future normalized schema: `members`, `payments`, `renewals`, `attendance`, `expenses`, `settings`, and `financialReports`.
- Staff transaction records are append-only: Staff can create their own payment/renewal records but cannot edit or delete them.
- Expenses, settings, financial reports, and legacy `gymData` remain Owner-only.
- Default access is denied.

## Current development status (2026-10-31)
- `new-app.html` and `new-app.js` are the separate Owner/Staff development app. They use Firebase Authentication and the Firestore adapter in `cloud-data.js`, with the rules in `firestore.rules`.
- `index.html` is the legacy app entry point and must not be confused with the new cloud app.
- Automated migration tests and Firestore emulator rules tests pass on `firebase-login-development`.
- The new cloud app has not yet been deployed to a verified preview URL or tested end-to-end with real Owner and Staff accounts.
- Legacy localStorage data has not yet been migrated/imported into the new Firestore collections.

## IMPORTANT – do not publish these rules yet
Do not publish the development Firestore rules or enter live gym data into the new collections until migration, account-level testing, and deployment review are complete. Keep the existing Live App and installed APK untouched.

## Firebase account setup (when the app integration is ready)
1. Keep the existing Owner account. Do not delete it.
2. Authentication → Sign-in method → enable Email/Password.
3. Create two separate Staff accounts in Authentication → Users → Add user. Use unique email addresses and temporary passwords.
4. For each Staff Auth UID, the Owner creates `users/{UID}` in Firestore with:
   - `role`: string `staff`
   - `active`: boolean `true`
   - `displayName`: string
5. Never create an Owner role from the client app. Owner access is determined by the fixed UID in the rules.

## Remaining engineering work
- Add a login screen and Firebase Auth state handling.
- Migrate localStorage data model into separate member, payment, renewal, attendance and expense documents.
- Add safe first-time import and owner-controlled backup/restore.
- Implement multi-device cloud sync, audit information and Owner/Staff screen permissions.
- Test rules with Owner, Staff 1, Staff 2, inactive Staff and unauthenticated sessions before publishing.
- Only after those tests, publish the rules and deploy the website. Build/update the APK separately after web release is verified.

## Safety
- This branch is development-only; it does not change the live site or installed APK.
- Never paste service-account private keys into the website or GitHub.
- Firebase web configuration values are public client identifiers, not server credentials.
- Do not uninstall the existing APK, clear its storage, or delete existing data during development.
