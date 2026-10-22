# H38 Office — native Android app

The Office web app in a native shell, plus the one thing a web app cannot
do: **always-on background drive detection** for mileage tracking.

- Hosts the Office at `https://highway38solutions.com/commercial-app/`
  (same URL, same session — sign in once, in the app).
- A foreground service watches for drives with the "Allow all the time"
  location permission and delivers detected trips into the existing
  mileage system (`mileageTrips` records) — the web classification engine
  (schedule match, learned places, auto-file, ask-later queue, privacy
  scoping) applies unchanged. The native layer detects and delivers; it
  does not classify.
- Recording policy is honored natively: owners/admins record whenever
  their switches are on; employees only while clocked in; the Off-Duty
  switch stops everything. The web app pushes the policy through the
  `AndroidH38Office` bridge; the service re-reads the server-side gate
  inputs (open time entry, tenant pilot) when the WebView is dead.
- First-run wizard: sign in → location "all the time" → notifications →
  battery exemption → tracking on. One step per screen, plain language.

## Build

CI builds this project (`.github/workflows/h38-office-android-release.yml`):
unit tests + a compile/badging gate on every run, and the release APK when
the Office signing secrets are present.

Local build (JDK 17 + Android SDK platform 35 + Gradle 8.13):

```bash
cd native/h38-office/android-app
gradle :app:testDebugUnitTest :app:assembleRelease
```

Release signing activates only when all four env vars are set (same
pattern as the Deals wrapper): `H38_OFFICE_KEYSTORE_PATH`,
`H38_OFFICE_KEYSTORE_PASSWORD`, `H38_OFFICE_KEY_ALIAS`,
`H38_OFFICE_KEY_PASSWORD`. Without them the release build stays unsigned.

Identity: applicationId `com.highway38.office`, label "H38 Office".
The signing key is the Office app's own key (not the Deals key); its
certificate fingerprints are recorded in the build state file
(`~/workspace/native-office-build/STATE.md`, outside the repo).
