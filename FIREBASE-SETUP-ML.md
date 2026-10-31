# PGM FITNESS – Firebase setup (development branch)

Project: `pgmfitness-5e107`

## What this commit prepares
- Firestore rules pin the owner to the Firebase Auth UID supplied for this project.
- Only the owner can create/update/delete staff role documents under `users/{uid}`.
- Unrecognized users have no database access.
- Gym data remains owner-only for now. This is intentional: the current app stores payments and renewals inside member records, so allowing staff to edit a member document would also let them rewrite payment history.

## Before enabling cloud sync
1. In Firebase Console → Authentication → Sign-in method, enable Email/Password.
2. Keep the existing Owner account. Do not delete it.
3. In Firestore → Rules, publish the contents of `firestore.rules` from this branch.
4. Do not switch to test mode or publish permissive rules.
5. Create two Staff users in Authentication → Users → Add user. Use unique email addresses and temporary passwords; give each staff member their own credentials.
6. For each Staff Auth UID, create `users/{UID}` in Firestore with fields:
   - `role`: string `staff`
   - `active`: boolean `true`
   - `displayName`: string (staff member's name)
   The owner UID is recognized directly by the rules; do not create a client-editable owner role.
7. Do not put member or payment data into Firestore yet.

## Important limitation / next engineering step
The existing app is a single-page localStorage app. It does not yet authenticate users or sync data. Its payment and renewal history is embedded in member objects. Before staff can safely add members and record payments, the app must be migrated to separate member, payment, and renewal documents with rules that allow staff to create new records but never edit/delete historical transactions. Owner-only financial reports and audit logs must be implemented against that schema.

## Safety
- This branch is development-only. It does not change the live site or installed APK.
- Never paste service-account private keys into the website or GitHub.
- Firebase web configuration values are public client identifiers, not server credentials.
- Do not delete app data, clear storage, or uninstall the existing APK during development.
