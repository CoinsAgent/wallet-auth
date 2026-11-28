# US-004-01 — Manual test walkthrough

This walkthrough uses a fresh local test instance and an isolated CLI profile. It does not reset an existing database or deploy the feature.

Verified implementation: `5b1ecfc` on branch `codex/us-004-01-device-auth`. The current authorized release is available at https://wallet-auth.beeswarm.dev; see the current-release instructions below. The preflight results and timing observations are recorded in [evidence.md](evidence.md).

## What was checked before writing this guide

Verified on **2026-11-26**, against source revision `5b1ecfca99bcc4d6d285009f0422a0a528d61e3c`.

| Check | Observed result |
|---|---|
| Fresh server, device login and explicit consent | PASS |
| Registration, selected-client consent, list/get/update and invalid-update rejection | PASS |
| Denial, cancellation, five-guess limit and switching wallets | PASS |
| Real pending-login expiry | PASS — 300 seconds, no clock changes |
| Guessing-window recovery | PASS — same authenticated session after the real five-minute window |
| Automatic refresh | PASS — waited past the server's 15-minute access deadline; actual CLI list rotated protected credentials while retaining the authorization ID |
| Disposable-client deletion and repeated deletion | PASS — exits 0 then 6 |
| Browser revocation, rejected CLI access and confirmed logout | PASS — access failed with exit 3, logout succeeded |
| Manual URL/code entry | PASS — supplemental actual CLI/browser run |
| Ctrl+C through npm | PASS — the process group stopped with SIGINT, cancellation was reported and no credential was created |
| Cleanup | PASS — temporary server, generated-wallet database and credentials removed |

The main preflight exited 0 and recorded 78 passing checkpoints between `2026-11-26T05:58:25Z` and `2026-11-26T06:13:46Z`. The recorded access deadline was `06:13:41Z`; the post-expiry list/refresh succeeded at `06:13:43Z`. No server clock or credential expiry was edited. Local logs and runner: [artifacts/manual-preflight/](artifacts/manual-preflight/).

The preflight used actual npm CLI commands, a built server, native Better Auth OAuth Device Authorization, SQLite, Chromium browser UI and generated-wallet providers producing real SIWE signatures. The actual terminal QR was decoded and its URL opened in an isolated browser context; manual URL/code entry was also checked. This is automated observation, not a physical wallet, phone-camera scan or remote-host certification.

## Current authorized public release — backend port 3001

Release `ed2b0cf` is running at **https://wallet-auth.beeswarm.dev**. Its canonical issuer is `https://wallet-auth.beeswarm.dev/api/auth`; the backend still uses port3001. The latest origin correction preserved the existing database and service protections. Private rollback configuration/data backups are retained; see [evidence.md](evidence.md).

To test this running instance, **skip Step 1**. Complete Step 2’s isolated CLI setup, then override its origin before running login:

```bash
export US00401_ORIGIN=https://wallet-auth.beeswarm.dev
```

Follow the remaining steps with that public origin. Open https://wallet-auth.beeswarm.dev/#authorizations for revocation. Direct `http://127.0.0.1:3001` requests are rejected by the enabled Host check because localhost is no longer the canonical issuer. Proxy/tunnel/TLS settings were not changed. The port3201 setup below remains a separate disposable test option.

## 1. Start a fresh test server — Terminal A

Prerequisites: this branch/revision, Node.js 22.22 or later in the Node 22 line, installed locked dependencies, and a browser with a supported wallet. Run `npm ci` first if the checkout does not already have its dependencies.

Use a test wallet. Keep its private key in the wallet; the server does not need it.

```bash
cd /home/btc/code/wallet-auth
npm run build

export US00401_SERVER_DIR="$(mktemp -d /tmp/walletgate-us00401-server.XXXXXX)"
export DATABASE_PATH="$US00401_SERVER_DIR/test.sqlite"
export TRUSTED_ORIGIN=http://localhost:3201
export PORT=3201
export BETTER_AUTH_SECRET="$(openssl rand -hex 32)"

node --import tsx scripts/init-database.ts --database "$DATABASE_PATH"
node --import tsx backend/index.ts
```

Expected: initialization succeeds and the server listens on `http://localhost:3201`. Keep Terminal A running. Use a free port if 3201 is occupied, changing the origin and port consistently in both terminals.

These commands start the server directly with explicit environment variables; they do not read or overwrite your existing `.env`. The generated secret is not printed. Retain this terminal's secret and database if restarting this same test instance.

## 2. Isolate the CLI — Terminal B

```bash
cd /home/btc/code/wallet-auth
export US00401_CLI_DIR="$(mktemp -d /tmp/walletgate-us00401-cli.XXXXXX)"
export US00401_ORIGIN=http://localhost:3201

us00401_cli() {
  npm run cli -- "$@" --state-dir "$US00401_CLI_DIR" --profile us00401-manual
}
```

`us00401_cli` is a shell helper for this guide, not a separately installed command. Every call uses the same isolated profile and private temporary directory. Do not share credential or one-time secret file contents.

Optional origin check:

```bash
curl --fail --silent --show-error "$US00401_ORIGIN/api/auth/.well-known/openid-configuration"
```

Expected: issuer equal to your selected `$US00401_ORIGIN` plus `/api/auth`, with `device_authorization_endpoint` at that origin plus `/api/auth/device/code`.

## 3. Login with Device Authorization

```bash
us00401_cli login --device --origin "$US00401_ORIGIN" --label 'US00401 manual test'
```

Expected: JSON containing verification URL, user code, expiry and polling interval, plus a terminal QR/instructions. No confidential device code, access token or refresh token is printed. Keep the command running. Complete each attempt within five minutes, including SIWE and consent; authentication does not extend that deadline. Start login again if it expires.

For the local test, open the printed `verification_uri_complete` in a browser on the same computer. To exercise manual entry instead, open `verification_uri` and type the printed user code. A phone cannot reach this computer's `localhost`; see the final section for physical cross-device testing.

In the browser:

1. Sign in with the supported wallet and approve the SIWE signature, if asked. Wallet connection alone is not sign-in.
2. Select **Review code**.
3. Compare the displayed code with the initiating CLI.
4. Check **The code matches my CLI**.
5. Check **Create new applications using single-use IATs**.
6. Check **Allow continued access within these limits**.
7. Select **Allow selected access**.

Expected: consent controls start unchecked; scanning/opening the URL does not approve anything. The browser says **Authorization approved. Return to the CLI.** The CLI exits 0 and prints your wallet, authorization ID and granted permissions. Retain the public authorization ID for later revocation.

```bash
us00401_cli list
```

Expected: success with an empty application list.

## 4. Register a disposable application

Generate and keep one request ID:

```bash
US00401_REQUEST_ID="$(node -p 'crypto.randomUUID()')"

us00401_cli create   --name 'Disposable device-flow app'   --redirect https://rp.example/callback   --request-id "$US00401_REQUEST_ID"
```

Expected: a public `application.clientId` and `secret_file` path. The one-time secret is written to a protected file, not printed. The redirect is dummy metadata for CRUD testing, not a working RP callback service.

Copy only the public client ID into Terminal B:

```bash
US00401_CLIENT_ID='PASTE_application.clientId_HERE'
us00401_cli list
```

Expected: **the list is still empty**. Registration does not grant management access to the new client.

If a creation response is lost, retain the original request ID and retry the exact original command before replacing its authorization. Do not generate a new ID merely because a response was lost.

## 5. Explicitly authorize this client

Run login again with the same profile:

```bash
us00401_cli login --device --origin "$US00401_ORIGIN" --label 'US00401 manual test'
```

In the browser, repeat code comparison and continued-access consent. For the disposable client select **Read configuration**, **Update name and redirects**, and **Permanently delete**. Keep registration selected for this walkthrough. Approve.

Expected: successful login replaces this profile's previous authorization. Separate profiles remain independent. Denied, cancelled or failed attempts before successful replacement preserve the previous authorization.

```bash
us00401_cli list
us00401_cli get "$US00401_CLIENT_ID"
```

Expected: the selected application appears with its name/redirects and no client secret.

## 6. Update and check atomic rejection

```bash
us00401_cli update "$US00401_CLIENT_ID"   --name 'Updated device-flow app'   --redirect https://rp.example/updated-callback

us00401_cli get "$US00401_CLIENT_ID"
```

Expected: the new name and complete redirect set persist.

```bash
us00401_cli update "$US00401_CLIENT_ID"   --name 'Must not persist'   --redirect http://rp.example/invalid

us00401_cli get "$US00401_CLIENT_ID"
```

Expected: the update exits 2; the subsequent get still shows `Updated device-flow app` and `https://rp.example/updated-callback`.

## 7. Check automatic renewal and browser independence

Optionally sign out in the browser, then run:

```bash
us00401_cli list
```

Expected: success. Browser sign-out does not revoke the independently authorized CLI grant.

Wait slightly longer than **15 minutes after the most recent successful CLI login**, then run:

```bash
us00401_cli list
```

Expected: success through automatic refresh. Do not edit credential files, token expiry or the server clock. Ordinary CLI output does not reveal the rotated token. This guide's preflight separately checked protected credentials internally to confirm rotation while preserving the authorization ID.

## 8. Delete only the disposable application

```bash
us00401_cli delete "$US00401_CLIENT_ID" --yes
us00401_cli list
us00401_cli delete "$US00401_CLIENT_ID" --yes
```

Expected: first deletion succeeds; the list no longer contains the app. Repeated deletion exits 6 without claiming another deletion occurred. Use only the disposable ID created above.

## 9. Revoke this authorization and logout

Open your selected origin followed by `/#authorizations` (`https://wallet-auth.beeswarm.dev/#authorizations` for the running release, or `http://localhost:3201/#authorizations` for the isolated test). Sign in with the original wallet if needed. If the browser is still signed in with a wallet used in the switch test, open the root page, sign out and sign in with the original wallet. Identify **US00401 manual test** by its authorization ID, then select **Revoke** and **Confirm revoke**.

```bash
us00401_cli list
```

Expected: exit 3 requesting reauthorization.

```bash
us00401_cli logout
```

Expected: confirmed server revocation and removal of the local profile credential. An unreachable server instead reports incomplete logout and retains credentials; do not treat that as successful revocation.

Stop the disposable server with Ctrl+C in Terminal A. Once the disposable app is deleted, remove the temporary server/CLI directories you created when finished; the CLI directory can still contain that app's one-time secret file. Never remove an unrelated state directory or database.

## 10. Negative and recovery checks

Perform these while the test server is running, preferably before final revocation:

| Check | Action | Expected |
|---|---|---|
| Denial | Start login again with the same profile; review and select **Deny** | Exit 3; no new credentials; previous valid profile remains usable |
| Cancellation | Start login and press Ctrl+C before approving | Polling stops; previous credentials remain. The npm wrapper may report SIGINT/interruption instead of numeric CLI exit 3 |
| Pending expiry | Start a login and leave it unapproved for five minutes | Exit 3 with expiry; the old code cannot be approved/redeemed |
| Code guessing | In one signed-in browser session submit five incorrect user codes, then try another lookup | Five invalid attempts rejected; subsequent lookup reports a temporary limit |
| Guessing recovery | Wait until that session's fixed five-minute window ends; start a fresh login and enter its new code in the same browser session | Lookup works again without a new session |
| Wallet switch | On a new-profile request, review with wallet A; select **Switch wallet**, sign with wallet B and review again | Wallet B is shown; prior code/offline/permission selections do not carry over; explicit consent is required again |

For the wallet-switch check, start an independent profile directly:

```bash
npm run cli -- login --device \
  --origin "$US00401_ORIGIN" \
  --label 'US00401 wallet switch' \
  --state-dir "$US00401_CLI_DIR" \
  --profile us00401-switch
```

For other independent fresh requests, call the repository CLI directly with a different `--profile` and the same `--state-dir "$US00401_CLI_DIR"`. A same-profile replacement must retain its original wallet; use a separate profile when switching owners. Deny or logout disposable extra authorizations when finished.

## Physical phone/remote-host follow-up

For an actual phone camera or remote Linux host, an explicitly authorized HTTPS test instance running this revision is needed. Use that instance's origin in `--origin`, scan the displayed QR on the browser device, compare the code, complete SIWE and select permissions. The device flow needs no callback listener, SSH forwarding or hosted relay.

Physical camera scanning, physical-wallet compatibility, remote-host execution and deployment were not performed by the local preflight. Do not count them as passing observations.
