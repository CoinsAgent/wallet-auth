# US-004-01 — Domain release manual test

Test the deployed service directly from a Linux CLI and a separate browser or phone. This guide uses the public domain throughout; it requires no local server, database initialization, `.env`, deployment or SSH callback forwarding.

## Release and verification boundary

| Item | Value |
|---|---|
| Browser URL and CLI `--origin` | **https://wallet-auth.beeswarm.dev** |
| OIDC issuer | `https://wallet-auth.beeswarm.dev/api/auth` |
| Device authorization endpoint | `https://wallet-auth.beeswarm.dev/api/auth/device/code` |
| OAuth token endpoint | `https://wallet-auth.beeswarm.dev/api/auth/oauth2/token` |
| Authorization list/revocation | https://wallet-auth.beeswarm.dev/#authorizations |
| Deployed source | `ed2b0cf800ec7f193fdd7c278af678045d8ab4c3` |
| Backend | Port 3001 behind the existing public HTTPS route |

Use the public origin above, without `/api/auth` or a trailing slash, for CLI `--origin`. Direct `http://127.0.0.1:3001` access is rejected by the enabled Host check and is not an entry point for this walkthrough.

The database was reset for the fresh release, then preserved when the issuer was corrected to the public domain. Existing users or applications may now be present. These tests create one disposable application and delete only that application.

Recorded agent checks: the public release passed 21 HTTP/browser/CLI entry checks; the complete generated-wallet walkthrough, including actual five-minute expiry and 15-minute refresh, passed on an isolated local instance. Those results are in [evidence.md](evidence.md). **Your physical-wallet, phone-camera and remote-host results are not yet recorded.** Expected outcomes below are instructions, not claims that your domain walkthrough passed.

## 1. Prepare the CLI

Use Node.js 22.22 or later in the Node 22 line, npm, and this checkout containing the deployed device-flow source. The CLI is repository-local, not a published npm command. On another Linux host, use a checkout containing the revision above. Install dependencies with `npm ci` if they are not already installed; no server build or server secret is needed for CLI use.

In Bash:

```bash
cd /home/btc/code/wallet-auth
node --version
npm run cli -- help

export US00401_DOMAIN_ORIGIN=https://wallet-auth.beeswarm.dev
export US00401_DOMAIN_STATE_DIR="$(mktemp -d /tmp/walletgate-us00401-domain.XXXXXX)"

us00401_domain_cli() {
  npm run cli -- "$@" --state-dir "$US00401_DOMAIN_STATE_DIR" --profile us00401-domain
}

printf 'Keep this CLI state directory for this test: %s\n' "$US00401_DOMAIN_STATE_DIR"
```

`us00401_domain_cli` is a shell helper for this guide. Keep this terminal open so its variables and helper remain available. The directory is private and outside the repository. Never share credential files, one-time secret files, wallet keys or seed phrases.

### D01 — Confirm the domain and issuer

```bash
curl --fail --silent --show-error "$US00401_DOMAIN_ORIGIN/api/auth/.well-known/openid-configuration"
```

Expected: JSON with exactly the issuer and device/token endpoints listed above. Open https://wallet-auth.beeswarm.dev in your browser; the wallet sign-in page should render without **Untrusted host**. Stop if the issuer/domain differs.

## 2. Authorize the CLI — D02

```bash
us00401_domain_cli login --device \
  --origin "$US00401_DOMAIN_ORIGIN" \
  --label 'US00401 domain manual test'
```

Expected: verification URL, user code, expiry, polling interval and a terminal QR. Keep the CLI running. The attempt expires five minutes after issuance, including time spent signing in and reviewing consent.

On your browser device:

1. Scan the terminal QR, or open the printed `verification_uri_complete`. Confirm it uses `https://wallet-auth.beeswarm.dev`.
2. Sign in with your wallet through SIWE if asked. Reuse of an unexpired SIWE session is allowed; connecting a wallet alone is insufficient.
3. Select **Review code** and compare the browser code with your CLI.
4. Check **The code matches my CLI**.
5. Check **Create new applications using single-use IATs**. Leave existing applications' read/update/delete permissions unchecked.
6. Check **Allow continued access within these limits**.
7. Select **Allow selected access**.

Expected: controls start unchecked. Opening/scanning the link does not approve access. The browser says **Authorization approved. Return to the CLI.** The CLI exits 0 and prints public authorization metadata, not access/refresh tokens. Note the authorization ID for this profile.

```bash
us00401_domain_cli list
```

Expected: success with an empty list because you have not selected read access to any application, even if this wallet already owns applications.

## 3. Register one disposable application — D03

Generate one request ID and retain it for retries:

```bash
US00401_DOMAIN_REQUEST_ID="$(node -p 'crypto.randomUUID()')"

us00401_domain_cli create \
  --name 'US00401 disposable domain app' \
  --redirect https://rp.example/callback \
  --request-id "$US00401_DOMAIN_REQUEST_ID"
```

Expected: `application.clientId` and a private `secret_file` path. The one-time secret is saved, not printed. The redirect is dummy registration metadata for CRUD testing, not a working relying-party application.

Copy only the public client ID from the result:

```bash
US00401_DOMAIN_CLIENT_ID='PASTE_application.clientId_HERE'
us00401_domain_cli list
```

Expected: the list remains empty. Registration does not automatically grant management permissions. If the create response is lost, retry the exact original command with the same request ID before replacing its authorization; do not generate a new ID just to retry.

## 4. Authorize management and test manual code entry — D04

The login command uses the built-in public OAuth client ID `walletgate-cli`. Your disposable application's client ID is selected on the browser consent page; it is not an argument to `login`.

Run login again using the same profile and original wallet:

```bash
us00401_domain_cli login --device \
  --origin "$US00401_DOMAIN_ORIGIN" \
  --label 'US00401 domain manual test'
```

This time open the plain printed `verification_uri`, which should show an empty **User code** field after SIWE authentication. Type the CLI's user code and select **Review code**.

Before selecting permissions, show the public target ID saved in D03:

```bash
printf 'Select this application client ID in the browser: %s\n' "$US00401_DOMAIN_CLIENT_ID"
```

In the browser, locate **US00401 disposable domain app** and match the client ID displayed beneath its name to that exact value. Compare the user code, select continued access, keep registration selected, and grant **Read configuration**, **Update name and redirects**, and **Permanently delete** for that matching application only. Approve.

The browser submits the selected application ID with its operation permissions. If the app is missing, check that the verified browser wallet is the same owner used in D03 before proceeding.

Expected: the new authorization replaces this profile's prior grant after successful login. Other profiles remain independent. Record the new authorization ID and completion time; the refresh test uses this most recent successful main-profile login.

```bash
us00401_domain_cli list
us00401_domain_cli get "$US00401_DOMAIN_CLIENT_ID"
```

Expected: the disposable app is present with its name and redirects, without its client secret. Existing applications without selected read access remain absent.

## 5. Update and verify atomic rejection — D05

```bash
us00401_domain_cli update "$US00401_DOMAIN_CLIENT_ID" \
  --name 'US00401 domain app updated' \
  --redirect https://rp.example/updated-callback

us00401_domain_cli get "$US00401_DOMAIN_CLIENT_ID"
```

Expected: the new name and complete redirect set persist.

```bash
us00401_domain_cli update "$US00401_DOMAIN_CLIENT_ID" \
  --name 'Must not persist' \
  --redirect http://rp.example/invalid
```

Expected: exit 2. Then verify the rejected update changed nothing:

```bash
us00401_domain_cli get "$US00401_DOMAIN_CLIENT_ID"
```

Expected: still `US00401 domain app updated` and `https://rp.example/updated-callback`.

## 6. Denial, cancellation and pending expiry — D06–D08

For each case, start a separate attempt with the same main profile:

```bash
us00401_domain_cli login --device \
  --origin "$US00401_DOMAIN_ORIGIN" \
  --label 'US00401 domain manual test'
```

| Case | Action | Expected |
|---|---|---|
| D06 — Deny | Review the request in the browser, then select **Deny** | CLI exits 3; no replacement credentials are issued |
| D07 — Cancel | Press Ctrl+C before approval | Polling stops. The npm wrapper may report SIGINT/interruption rather than numeric exit 3 |
| D08 — Expire | Leave a new attempt unapproved for five minutes | CLI exits 3 with expiry; the old code cannot be approved |

After each failed attempt:

```bash
us00401_domain_cli list
```

Expected: the previous valid main-profile authorization still works. Do not approve an attempt you intend to deny, cancel or expire.

## 7. Guessing limit and recovery — D09

Use a private browser window so these attempts use a different SIWE session from your normal browser. Start a new CLI attempt, sign in with your wallet in the private window and open its plain verification URL.

1. Enter a nonempty invalid code such as `INVALID` and select **Review code** five times.
2. Try another lookup, including the real code from that attempt.

Expected: the first five invalid attempts are rejected; further lookups report a temporary limit. The limit is shared across codes and tabs in that authenticated session.

Wait until five minutes after the first incorrect submission. The original pending CLI attempt will also expire; start a **new** login attempt. In the same private browser session, enter the newly issued code.

Expected: lookup works again without a new SIWE session. Select **Deny** to finish the recovery check without creating another grant.

## 8. Switch wallets on an independent profile — D10, optional

Run this only if you have a second wallet available. Use a new profile, because replacing the main profile must retain its original wallet.

```bash
US00401_DOMAIN_SWITCH_PROFILE="domain-switch-$(date +%s)"

npm run cli -- login --device \
  --origin "$US00401_DOMAIN_ORIGIN" \
  --label 'US00401 domain wallet switch' \
  --state-dir "$US00401_DOMAIN_STATE_DIR" \
  --profile "$US00401_DOMAIN_SWITCH_PROFILE"
```

Review with wallet A. Select **Switch wallet**, sign in with wallet B, and review again. Expected: wallet B is shown, prior consent selections are cleared, and explicit code/continued-access consent is required again. Leave registration and application permissions unchecked for this extra grant, then approve.

Clean up that extra grant:

```bash
npm run cli -- logout \
  --state-dir "$US00401_DOMAIN_STATE_DIR" \
  --profile "$US00401_DOMAIN_SWITCH_PROFILE"
```

Expected: logout succeeds; the main profile's authorization is unaffected. If you lack a second wallet, record D10 as **Not run**, not passed.

## 9. Browser logout and actual automatic renewal — D11

Sign out through the domain's root page, then run:

```bash
us00401_domain_cli list
```

Expected: success. Browser sign-out does not revoke the independent CLI grant.

Wait slightly longer than **15 minutes after D04's successful main-profile login**, then run:

```bash
us00401_domain_cli list
```

Expected: success through automatic refresh. Denied/cancelled attempts do not restart the existing access token's lifetime. Do not edit the clock or credential file. Ordinary output does not reveal rotated tokens; report successful post-expiry access, not a token value.

## 10. Delete only the disposable app — D12

```bash
us00401_domain_cli delete "$US00401_DOMAIN_CLIENT_ID" --yes
us00401_domain_cli list
```

Expected: deletion succeeds and that app is absent. Check repeated deletion:

```bash
us00401_domain_cli delete "$US00401_DOMAIN_CLIENT_ID" --yes
```

Expected: exit 6 without claiming another deletion occurred. Do not substitute an existing integration's client ID.

## 11. Revoke the main authorization and logout — D13

Open https://wallet-auth.beeswarm.dev/#authorizations and sign in with the original wallet. If the browser still has the switched wallet, sign out at the root page first.

Find **US00401 domain manual test**, matching the authorization ID from D04. Select **Revoke**, then **Confirm revoke**.

```bash
us00401_domain_cli list
```

Expected: exit 3 requesting new authorization.

```bash
us00401_domain_cli logout
```

Expected: server revocation is confirmed and the local main-profile credential is removed. If the server is unreachable, logout instead reports incomplete revocation and retains the credential for retry.

No server shutdown or database cleanup is needed for this domain walkthrough. Once the disposable app and extra grants are removed, you may remove only the temporary CLI directory created in Step 1; it can still contain the disposable app's one-time secret file. Do not remove a normal credential directory or touch the deployed database.

## Record your observations

Fill in **Pass**, **Fail** or **Not run** after actually performing each case. Do not copy agent preflight outcomes into this table.

| Case | Your result | Nonsecret notes |
|---|---|---|
| D01 — Domain and discovery | Not run | |
| D02 — QR/complete URL, SIWE and consent | Not run | |
| D03 — Registration without implied read permission | Not run | |
| D04 — Manual code entry and selected-client consent | Not run | |
| D05 — Update and atomic rejection | Not run | |
| D06 — Denial preserves previous access | Not run | |
| D07 — Cancellation | Not run | |
| D08 — Real five-minute pending expiry | Not run | |
| D09 — Guessing limit and recovery | Not run | |
| D10 — Second-wallet switch | Not run | |
| D11 — Browser independence and real post-15-minute access | Not run | |
| D12 — Delete and repeated-delete rejection | Not run | |
| D13 — Browser revocation and CLI logout | Not run | |

Record test date, browser/OS/wallet versions, whether the browser was on a separate physical device, and whether you scanned a camera QR or used manual entry. For failures report case ID, visible nonsecret error and exit code. Never attach private keys, signatures, cookies, device codes, access/refresh tokens or secret-file contents.
