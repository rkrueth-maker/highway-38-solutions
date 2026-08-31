# H38 Reseller Scout — Firebase real-device acceptance

This is a manual, cost-controlled real Android gate for the private Scout branch only.

## Authority

- Repository branch: `agent/private-reseller-scout` only.
- The workflow refuses to run its job from another branch.
- A successful Firebase run is reported as `REAL DEVICE FARM PASS`.
- It does **not** replace exact owner-handset acceptance. The user's physical Android phone remains the final `PASS` authority for release boundaries.

## One-time setup

Create or choose a dedicated Firebase/Google Cloud project for Scout Test Lab. Enable Firebase Test Lab / Cloud Testing and Cloud Tool Results for that project. For gcloud-driven Test Lab runs using Firebase's default results bucket, Google documents that the executing principal needs the project Editor role. If you use your own results bucket, use the narrower Firebase Test Lab Admin plus Firebase Analytics Viewer roles and the required bucket permissions instead.

Create a CI service account and add these GitHub Actions secrets:

- `FIREBASE_PROJECT_ID` — Firebase / Google Cloud project ID.
- `FIREBASE_SERVICE_ACCOUNT_JSON` — JSON credentials for the CI service account. Never commit this file.
- `H38_SCOUT_TEST_EMAIL` — dedicated Scout owner-test account email.
- `H38_SCOUT_TEST_PASSWORD` — password for that dedicated test account.

Do not use a personal Google password or place any credential in workflow YAML, source code, issues, artifacts, screenshots, or logs.

## Run it

Open GitHub Actions → **H38 Scout Firebase Real Device Acceptance** → **Run workflow** while the branch selector is `agent/private-reseller-scout`.

The default device is the Firebase physical Samsung Galaxy S20 model ID `x1q` with Android version ID `29`, matching Google's documented physical-device CLI example. Device availability changes. Before consuming a test, the workflow calls `gcloud firebase test android models describe` and refuses to continue unless the selected target reports `PHYSICAL` and supports the requested version. Override the workflow inputs when Test Lab changes its catalog.

## What the scripted owner pass checks

1. Installs and launches the owner build on Firebase-hosted physical Android hardware.
2. Signs in using the dedicated owner-test credentials supplied as instrumentation arguments.
3. Confirms Discover / Hunt / Scan / Auctions / Track bottom navigation is reachable.
4. Searches Discover for `fridge`, confirms the query remains applied, and fails if the known stale `Lawn care equipment` card reappears.
5. Opens Auctions and requires `Local sales` or `Craigslist` to be reachable.
6. Opens Hunt, requires Dollar General to be reachable, scrolls the real UI, and fails if the known UPC `840797136519` is visibly paired with the prior wrong `Beech-Nut Veggies Stage 2 Baby Food` title.
7. Round-trips through Scan, Track, and Discover to catch basic navigation regressions.

Firebase's Test Lab result includes device logs and test-result media such as video/screenshots when available in the Test Lab result. The GitHub artifact keeps the exact app APK, test APK, SHA-256 values, selected-device description, gcloud output, and the resulting device-farm status.

## Deliberate limits

Live marketplace inventory can legitimately be empty or change between runs, so the test does not fabricate a requirement that a particular fridge listing, garage sale, or Dollar General item must exist. It validates the app boundary and known regression signatures. Dollar General photo completeness and title/photo visual agreement still need review from the Test Lab media until a trustworthy DOM/native image assertion can prove those visual relationships without creating false failures.

A Firebase result cannot be called the user's exact physical-phone `PASS`. Use `REAL DEVICE FARM PASS`, `REAL DEVICE FARM FAIL`, or `NOT YET PROVEN` for this gate.
