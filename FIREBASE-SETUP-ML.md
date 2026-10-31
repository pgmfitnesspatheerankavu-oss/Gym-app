# PGM FITNESS – Firebase setup (development branch)

Firebase project: `pgmfitness-5e107`

## Prepared in this development branch
- Firestore rules identify the Owner by a fixed Firebase Auth UID.
- Only the Owner can manage documents under `users/{uid}`, so Staff cannot promote themselves.
- The rules define a future normalized schema: `members`, `payments`, `renewals`, `attendance`, `expenses`, `settings`, and `financialReports`.
- Staff transaction records are append-only: Staff can create their own payment/renewal records but cannot edit or delete them.
- Expenses, settings, financial reports, and legacy `gymData` remain Owner-only.
- Default access is denied.

## IMPORTANT – do not publish these rules yet
The app has not yet been connected to Firebase. The current app stores all records in browser localStorage, and payment/renewal history is embedded inside member objects. The new collection rules are a target for the migration, not a finished live configuration. Do not publish the rules or enter live gym data into the new collections until the app migration and tests are complete.

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
