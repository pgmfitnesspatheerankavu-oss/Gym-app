# HYFIT — independent setup and APK build

HYFIT is maintained on the `hyfit-app` branch with Android application ID
`com.hyfit.gym.management`. Do not merge this branch into `main` as part of
normal HYFIT builds. The app must use a Firebase project created specifically
for HYFIT; never enter the PGM FITNESS project ID, web config, Owner UID,
service-account key, or signing key here.

## One-time Firebase setup (Google account owner action required)

Firebase projects are created inside the user's Google account. A repository
maintainer cannot create or accept billing/terms for a project without that
account's authorization. Create a new project named **HYFIT** at
https://console.firebase.google.com/ and complete these steps:

1. In Project settings, register a **Web app** named HYFIT. The Android package
   name is `com.hyfit.gym.management` when registering the Android app too.
2. Copy the Web app configuration values from Firebase. Add them to GitHub
   Actions secrets using the exact names below. Do not commit the config file.
3. Authentication → Sign-in method → enable **Email/Password**.
4. Authentication → Users → Add user. Create the HYFIT Owner email/password.
   Copy that user's Firebase Auth **UID**; add it as `HYFIT_OWNER_UID`.
5. Firestore Database → Create database. Start in production mode. Deploy the
   rules in `firestore.rules` only after replacing
   `HYFIT_OWNER_UID_REPLACE_BEFORE_DEPLOY` with the HYFIT Owner UID.
6. Storage → Get started. Deploy `storage.rules` from this branch. Use the
   HYFIT project's own default Storage bucket.
7. In Firebase Project settings, confirm the Web app config and Storage bucket
   both belong to the new HYFIT project.

### GitHub Actions secrets

Repository → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
| --- | --- |
| `HYFIT_FIREBASE_API_KEY` | HYFIT Web app `apiKey` |
| `HYFIT_FIREBASE_AUTH_DOMAIN` | HYFIT Web app `authDomain` |
| `HYFIT_FIREBASE_PROJECT_ID` | HYFIT project ID |
| `HYFIT_FIREBASE_STORAGE_BUCKET` | HYFIT Storage bucket |
| `HYFIT_FIREBASE_MESSAGING_SENDER_ID` | HYFIT Web app `messagingSenderId` |
| `HYFIT_FIREBASE_APP_ID` | HYFIT Web app `appId` |
| `HYFIT_OWNER_UID` | UID of the first HYFIT Owner in Authentication |

Firebase Web API keys are app identifiers, not Admin credentials. Never add
Firebase Admin service-account JSON or private keys to the client build.

## Persistent Android signing (one time)

Generate a dedicated HYFIT keystore and keep a secure offline backup. Do not
reuse PGM's keystore. On a trusted computer with Java keytool:

```sh
keytool -genkeypair -v -keystore hyfit-release.jks -alias hyfit -keyalg RSA -keysize 2048 -validity 10000
base64 -w 0 hyfit-release.jks
```

Save the base64 output as `HYFIT_KEYSTORE_BASE64`, and save the keystore
password, alias (`hyfit`), and key password as
`HYFIT_KEYSTORE_PASSWORD`, `HYFIT_KEY_ALIAS`, and
`HYFIT_KEY_PASSWORD`. Keep the original keystore and passwords safe. Losing
them prevents signing future updates with the same certificate.

## Build

After the seven Firebase secrets and four signing secrets are configured:
GitHub → Actions → **Build HYFIT Android APK** → Run workflow → branch
`hyfit-app`. Download the `hyfit-android-apk` artifact from a successful run.
Do not install a build until the HYFIT Owner can log in and test member,
payment, renewal, expense, attendance, and photo upload.

## Isolation checklist

- Android application ID: `com.hyfit.gym.management`
- Firebase project ID must be a new HYFIT-only project.
- Owner UID must be from HYFIT Authentication.
- Firestore and Storage rules must be deployed to HYFIT only.
- All CI secrets are prefixed `HYFIT_`.
- PGM FITNESS Firebase data and the `main` branch must remain untouched.
