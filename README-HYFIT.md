# HYFIT

Independent Android gym-management app cloned from the PGM FITNESS application.

- Android application ID: `com.hyfit.gym.management`
- Display name: `HYFIT`
- Independent Firebase project required. Do not use PGM FITNESS Firebase credentials or database.
- Required GitHub Actions secrets for the HYFIT build: `HYFIT_FIREBASE_API_KEY`, `HYFIT_FIREBASE_AUTH_DOMAIN`, `HYFIT_FIREBASE_PROJECT_ID`, `HYFIT_FIREBASE_STORAGE_BUCKET`, `HYFIT_FIREBASE_MESSAGING_SENDER_ID`, `HYFIT_FIREBASE_APP_ID`, `HYFIT_OWNER_UID`.
- APK signing uses the repository's existing signing secrets. The package ID is different, so it installs as a separate app.

The build intentionally fails if HYFIT Firebase credentials are missing. This prevents accidental connection to PGM FITNESS data.
