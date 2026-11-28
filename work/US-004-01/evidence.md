# Verification evidence — US-004-01

Status: PASS

## Context and provenance

- Story: US-004-01, human-approved READY by CoinsAgent on 2026-11-26 (Asia/Shanghai), followed by explicit instruction to start implementation.
- Branch: `codex/us-004-01-device-auth`.
- Tested implementation/test revision: `0d09a4fa5dcdfe4938c19d21ab35002745cd86c4`; final lifecycle/evidence recording changes no product or test source.
- Complete-diff base: `f3f0e202037d47f3d7864d2c32537550d495fdeb`, human-merged US-004 PR #12. Retained acceptance commit `68e7f06` is an ancestor and carries `backlog/US-004.md` plus its committed acceptance evidence. Confirmed merge/check facts remain in that evidence; US-004 is ACCEPTED.
- Environment: Linux, Node v22.23.3, locked Better Auth/core/OAuth Provider 1.7.15; Playwright Chromium/headless-shell 1248 installed during baseline repair.
- CI/PR: not requested; explicit human finished-result approval is required first. No deployment, host change or shared/deployed database reset performed.

## Implementation and actual paths

Native `oauthDeviceAuthorization` owns code creation, polling state, denial/approval, atomic code consumption and OAuth issuance. WalletGate guards native endpoints with SIWE and exact consent, binds device token families through the supported adapter, and reuses management lifetime/refresh/revocation. Browser code lookup requires SIWE; durable per-session fixed-window guessing limits apply across codes/tabs. An explicit pending-claim release supports switching wallets before fresh review, without weakening same-owner profile replacement.

`cli/device.ts` adds explicit `login --device`, terminal QR/manual URL/code, trusted-origin checks, OAuth polling/backoff, cancellation and protected credential persistence. No callback server, browser launch, forwarding or hosted relay is used by that flow. Existing PKCE behavior remains available. Frontend authorization owns the new verification page and consent; bootstrap assembles it. Fresh schema initialization and an explicit local development/test-only reset command implement AC-13; ordinary startup remains read-only on incompatible storage. Repository skill and development instructions cover the complete flow.

All actual committed paths are within scope.json. Proposed exact files not needed: `backend/wallet-auth/identity.ts`, `cli/auth.ts`, `tests/e2e/management.spec.ts`, `config/project-structure.json`. Legacy browser suites write their existing ignored captures to declared prior-story artifact directories; new captures are under this story. The prior uncommitted US-004 manual/retest edits remain separate and are excluded from this story commit. Complete branch changes also carry the already-confirmed US-004 acceptance record, without an acceptance-only PR.

## Acceptance matrix

| AC | Observed executable coverage | Result | Reference |
|---|---|---|---|
|01|Actual native device initiation, OAuth redemption and discovery; generic session-token endpoint remains inaccessible|PASS|tests/app/device.test.ts; full-verify.log|
|02|System public client only; client/resource/scope substitutions and native aliases rejected; original PKCE/RP regressions|PASS|device.test.ts; management/oidc suites|
|03|Actual spawned headless CLI emits public URL/code and scannable terminal QR; QR decoded and opened in a separate browser context, manual fallback, no secret output|PASS|tests/e2e/device.spec.ts; device-cli.test.ts|
|04|Fresh SIWE UI proof, valid-session reuse, non-SIWE rejection, authentication before lookup, session change, explicit wallet release/review and stale-owner rejection|PASS|device.test.ts; device.spec.ts|
|05|Unchecked code/offline/permission controls, explicit approval/denial, exact owner/target selection, native bypass rejection; keyboard/focus/axe/contrast/light/dark/narrow/zoom/reduced-motion checks|PASS|device.test.ts; device.spec.ts; screenshots below|
|06|No preapproval tokens; denial/replay/wrong client, five incorrect guesses per fixed session window, exact300-second expiry/restart, one concurrent redemption, rollback when issuance crosses expiry|PASS|device.test.ts|
|07|Controlled pending/slow_down/connection retry polls at5/10/20/40 seconds, original deadline, terminal errors and cancellation; native cumulative backoff|PASS|device-cli.test.ts; device.test.ts|
|08|Opaque resource-bound native OAuth credentials; explicit continued-access consent required; protected directory0700/file0600, identity checks and no tokens in output|PASS|device.test.ts; device-cli.test.ts; device.spec.ts|
|09|Automatic refresh/strict rotation/reuse isolation; browser logout independence, device-to-PKCE and PKCE-to-device profile replacement, failure preservation|PASS|device.test.ts; existing management suite|
|10|Before/at/after access/inactivity/absolute/device deadlines across actual restart; successful renewal does not extend absolute expiry|PASS|device.test.ts; existing management boundary suite|
|11|Individual owner revocation rejects device access/refresh; unrelated PKCE grant survives; existing authorization listing/revocation UI and confirmed CLI logout tested|PASS|device.test.ts; management.spec.ts; device.spec.ts|
|12|Complete preexisting application/CLI/wallet/browser/OIDC regressions pass alongside new tests|PASS|full-verify.log|
|13|Fresh device schema; old storage refused unchanged; explicit disposable local reset invalidates stale connections; missing confirmation, wrong environment, relative/symlink/unrelated targets refused|PASS|tests/app/database.test.ts|

## Verification

Final exact-revision command:

```sh
STRUCTURE_SCOPE_BASE=f3f0e202037d47f3d7864d2c32537550d495fdeb STRUCTURE_SCOPE_HEAD=0d09a4fa5dcdfe4938c19d21ab35002745cd86c4 STRUCTURE_SCOPE_FILE=work/US-004-01/scope.json bash scripts/verify.sh > work/US-004-01/artifacts/full-verify.log 2>&1
```

Exit code **0**. Observed results: **43 Python harness tests**, **41 structure fixtures**, **331 application/CLI tests across12 files**, **88 browser tests**. Lockfile/download-source, lint, TypeScript, build, dependency and complete committed path-scope checks passed. Final log: `artifacts/full-verify.log`. No check was disabled or replaced. Post-record metadata/whitespace and final-commit complete scope output: `artifacts/final-record-check.log`.

Baseline command `bash scripts/verify.sh > /tmp/us00401-baseline.log 2>&1` exited1:43 harness,41 structure and287 application tests plus lint/types/build/lockfile/dependencies passed; all81 browser tests failed before launch because the required Chromium binary was absent. Log: `artifacts/baseline.log`. `npx playwright install chromium` exited0 and installed required binaries. Initial device integration also exposed a missing native adapter schema; adding the native schema-only plugin fixed it without upstream changes. The first full postimplementation run passed331 app/88 browser checks but overlapped final test edits; it is retained as `artifacts/full-verify-intermediate.log` and is superseded by the exact-revision result above.

Focused development commands included `npm run test -- tests/app/device.test.ts tests/app/management.test.ts tests/app/database.test.ts` (73 intermediate tests passed), `npm run test -- tests/app/device-cli.test.ts` (9 passed), and build plus `npx playwright test tests/e2e/device.spec.ts` (5 initial browser tests passed before adding expiry/switch regressions). Final suite contains all later additions.

Production limiter regression runs `tests/app/device-production.ts` in an isolated process with NODE_ENV=production before module imports. It asserts native rate limiting is enabled, six valid reviews return200, five incorrect submissions return400, the next lookup is429, and another authenticated session still returns200. An earlier in-process env stub was replaced because Better Auth caches production state at import.

Screenshots visually inspected in light/dark at narrow width: `artifacts/device-consent-light.png`, `artifacts/device-consent-dark.png`; manual fallback capture: `artifacts/device-manual.png`. Actual terminal QR output is decoded by the browser fixture and used as the separate-context verification destination. Axe includes rendered contrast checks; keyboard focus,200% CSS zoom, overflow and reduced motion are exercised.

## Review

Independent read-only reviewer `device_review` inspected full implementation and corrected paths. Findings fixed and regression-tested: pending owner claim prevented wallet switching; native production /device lookup limiter shared an IP fallback bucket across valid reviews; late asynchronous response work needed a final device-deadline guard. The reviewer also caught the ineffective in-process production test, now replaced with a genuine production subprocess. Denial now ignores stale target selections. Final recheck: **no unresolved material findings**. Reviewer made no edits and did not act as human approver.

Parent reviewed the complete committed diff, declared versus actual paths and remaining working-tree edits. The only remaining unstaged files are preserved prior US-004 documentation maintenance. No unrelated product changes, new dependency version, check weakening or upstream patch is included.

## Known limitations

- Cross-device behavior is exercised through actual CLI processes and isolated browser contexts with real cryptographic SIWE signatures behind simulated wallet providers. No physical wallet, phone camera scan or separate remote host was observed for this story; no broader wallet/platform certification is claimed.
- At the original QA checkpoint the implementation had not been deployed. The later explicitly authorized release/reset and public-issuer correction are recorded below; proxy/tunnel/TLS settings were not changed.
- Local credentials retain US-004’s unencrypted owner-only storage policy. The new reset command is destructive and limited to explicitly selected local development/test use; environment flags are operator assertions, not proof that a selected filesystem path is nonproduction. Only disposable fixture databases were reset during delivery.
- Browser discovery/consent and native provider behavior are verified for the pinned stack; no general OIDC certification or production-readiness claim is made.

## Human acceptance

PENDING human review of this locally verified result, explicit PR/CI approval, required current-head checks and human merge. QA_PASSED is local engineering completion, not ACCEPTED. No PR, deployment or acceptance is inferred from these tests.

## Human-requested manual walkthrough preflight — 2026-11-26

The human requested executing the proposed manual tests first and adding `manual-test.md` only on success. Product/test source remains unchanged from QA revision `5b1ecfca99bcc4d6d285009f0422a0a528d61e3c` (product/tests match full-verified `0d09a4f`). Narrow paths were declared in the plan before execution. No story status transition, deployment, shared/deployed reset or PR/CI occurred.

Actual commands and outcomes:

- `npm run build > work/US-004-01/artifacts/manual-preflight/build.log 2>&1` exited 0.
- `node --import tsx work/US-004-01/artifacts/manual-preflight/run.mjs > work/US-004-01/artifacts/manual-preflight/run.log 2>&1` exited 0. Its successful run used a built isolated server at http://localhost:3201, a newly initialized temporary SQLite database, actual `npm run cli` processes and browser UI SIWE/consent via generated-wallet fixtures. Result: `artifacts/manual-preflight/result.json`, with 78 recorded passing checkpoints. Started 2026-11-26T05:58:25.280Z; completed 2026-11-26T06:13:46.461Z.
- Successful main observations: actual terminal QR decoded and opened in a browser context; SIWE/code/offline/registration consent; protected files; create/list-empty-before-read; selected-target reauthorization; list/get/update; invalid redirect update rejected atomically; denial and cancellation preserve prior credentials; five invalid codes followed by429; wallet A switches to B with fresh consent; browser logout leaves main CLI usable; native expiry, renewal, delete, revoke and logout.
- The pending attempt expired after **300 actual seconds**. After the same guessing session’s real five-minute window elapsed, a new code could be reviewed and denied without creating a new session.
- The main token’s server-issued access deadline was **2026-11-26T06:13:41Z**. The runner waited until 06:13:42.506Z, then actual CLI `list` exited0 at06:13:43.208Z. Protected credentials had new access/refresh values, the same authorization ID and a future access deadline. No server clock, browser clock or credential expiry was modified. The elapsed918-second value in the rotation checkpoint is measured from runner start, not from token issuance.
- Disposable client deletion succeeded, list excluded it, repeated deletion exited6. Browser individual revocation made CLI list exit3; confirmed CLI logout exited0 and removed the profile credential. Expired device review returned410.
- `node --import tsx work/US-004-01/artifacts/manual-preflight/manual-fallback.mjs > work/US-004-01/artifacts/manual-preflight/manual-fallback.log 2>&1` exited0: plain verification URL had an empty code field, manually entering the printed code opened the matching review, explicit consent completed actual CLI login, and CLI logout revoked that supplemental grant. Screenshot: `artifacts/manual-preflight/manual-url-fallback.png`.
- `node work/US-004-01/artifacts/manual-preflight/npm-cancel.mjs > work/US-004-01/artifacts/manual-preflight/npm-cancel.log 2>&1` exited0: SIGINT to the actual detached npm CLI process group stopped polling, printed cancellation and created no credential. The wrapper close event reported signal SIGINT rather than a numeric exit; the guide documents that distinction instead of requiring numeric3 for terminal interruption.
- The documented `curl --fail --silent --show-error http://localhost:3201/api/auth/.well-known/openid-configuration` returned the expected issuer/device endpoint; public-only discovery is retained in `artifacts/manual-preflight/discovery.json`.
- Cleanup stopped the temporary server and removed all generated-wallet database/credential files. `ss -ltn 'sport = :3201'` showed no listener afterward. Only disposable app data was created/deleted; no user database or deployed service was used.

Two preliminary standalone harness attempts exited1 and are not counted as passing runs. The first timed out at simulated-wallet signing; standalone tsx-transformed wallet fixture code contained `__name` references, and providing that fixture-only browser helper allowed signing. The second failed on a relative browser URL without a configured base URL; absolute test-origin URLs fixed it. Logs: `first-attempt.log` and `second-attempt.log` in the same artifact directory. These corrections changed only the local runner, not product/test source.

After all main/supplemental results confirmed success, added `work/US-004-01/manual-test.md`. It contains fresh isolated setup, commands, expected results, timing checks, negative/recovery cases and the physical-device follow-up boundary. Screenshots of manual entry and authorization states were captured; manual entry screenshot was visually inspected. All use generated test wallets, not human-owned credentials.

Limits remain explicit: browser automation with real fixture signatures is not physical-wallet/camera/remote-host observation. No feature deployment was performed. Full verification was not repeated for documentation/artifact-only maintenance; existing QA_PASSED status is unchanged. Post-write structural/shell-syntax/whitespace/scope validation output: `artifacts/manual-preflight/document-checks.log`.


## Explicitly authorized fresh port-3001 release and reset — 2026-11-26

The human initially requested removing the database and a fresh release at http://127.0.0.1:3001. Read-only inspection identified that port as production-configured user service `wallet-auth.service`, with cwd `/home/btc/code/wallet-auth`, public origin https://wallet-auth.beeswarm.dev and database `/home/btc/code/wallet-auth/data/walletgate.sqlite`. After this public-service impact was explained, the human explicitly confirmed: “reset that database and replace the service with the requested http://127.0.0.1:3001 issuer”. This authorizes the specific destructive operation and release; it does not change approved ACs, story QA status, PR/CI permission or acceptance. Earlier no-deployment/local-only records remain historical checkpoints.

Execution:

- Archived committed source `ed2b0cf800ec7f193fdd7c278af678045d8ab4c3` into `/home/btc/.local/share/wallet-auth/releases/20261126T064253Z-ed2b0cf-local3001`. Only committed source was released; prior dirty US-004 documentation was preserved separately. Runtime `.env` is private0600; only TRUSTED_ORIGIN, PORT and the absolute target DATABASE_PATH changed. The original auth secret and other configuration were retained without printing values.
- `npm ci --offline --no-audit --no-fund` exited0, installing332 packages from the lockfile. `npm run build` exited0; `node scripts/check-lockfile.mjs` exited0. Logs: `artifacts/release-3001/install.log`, `build.log`, `lockfile-check.log`.
- On the actual isolated release, `npm run test -- tests/app/device.test.ts tests/app/device-cli.test.ts tests/app/database.test.ts` exited0: **60 tests passed across3 files**. These used disposable fixtures, not the target database. Log: `actual-release-tests.log`.
- `python3 work/US-004-01/artifacts/release-3001/deploy.py` exited0. Prepared fresh schema before stopping the old service; stopped `wallet-auth.service`; created a consistent private SQLite backup with integrity check; replaced the authorized database and stale SQLite sidecars with freshly initialized storage; wrote only the declared user-systemd WorkingDirectory drop-in and restarted. Service entry command, restart behavior, NoNewPrivileges and UMask0077 remain inherited. Existing main service definition, workspace `.env`, proxy/tunnel/TLS configuration and host protections were not changed.
- New working directory: `/home/btc/.local/share/wallet-auth/releases/20261126T064253Z-ed2b0cf-local3001`. Runtime origin/issuer: `http://127.0.0.1:3001` / `http://127.0.0.1:3001/api/auth`. Fresh-at-switch counts: users0, owner application clients0, management grants0, system public CLI1. Post-start counts matched. Rollback was prepared but not performed. Private rollback data: `/home/btc/.local/share/wallet-auth/backups/20261126T064253Z-before-local3001/previous.sqlite`; the same private0700 backup directory retains previous service/env configuration. The old data is removed from active storage, with this rollback copy transparently retained.
- `node --import tsx work/US-004-01/artifacts/release-3001/smoke.mjs` exited0: **21 live HTTP/browser/CLI checks passed**. Root/assets200; discovery/new issuer/device endpoint; fresh public-only RS256 JWKS; CSP/nosniff; anonymous and invalid-bearer denials; ineligible device client denial; former public Host403; narrow sign-in/device UI with no uncaught JavaScript errors; actual released CLI device initiation and cancellation with no credentials. Screenshots `local-sign-in.png` and `local-device-sign-in.png` are retained; the device sign-in screen was visually inspected.
- Removed only the smoke test’s unapproved request, matching its own unique user code/label and verifying no owner, reviewed session or grant. Database integrity/foreign-key checks passed. Final counts: users0, owner clients0, grants0, pending device requests0, system CLI1. No fixture wallet authenticated against the target service, and no application was created in its reset database.
- The first smoke attempt used Node fetch to override the Host header and failed that assertion; actual curl with an explicit former Host returned403, while the requested loopback Host returned200. Replacing that harness probe with curl produced the passing complete smoke above. Initial output is retained in `smoke-initial-host-probe.log`; no product or protection change was made to satisfy it.

Artifact directory: `work/US-004-01/artifacts/release-3001/` contains stage/deployment/smoke JSON, reproducible scripts and logs. Updated `manual-test.md` to test the running release without initializing another database, while retaining its isolated port3201 walkthrough. Physical-wallet/camera checks remain unobserved. Full repository verification was not repeated for runtime/documentation-only operation; exact source product/tests remain those already verified. No PR/CI, merge or ACCEPTED transition occurred.


## Human-approved public issuer correction — 2026-11-26

Following the explicitly requested localhost issuer, the human reported Untrusted host at https://wallet-auth.beeswarm.dev. Direct checks confirmed localhost200, former public Host403 and public HTTPS403. The human then answered “yes please” to switching the canonical issuer to https://wallet-auth.beeswarm.dev while keeping port3001 and preserving the existing fresh database. This separately authorizes the origin change/restart; the Host guard remains enabled.

- Declared paths in the plan before changes. Changed only TRUSTED_ORIGIN in the active release’s private .env. Port, absolute DATABASE_PATH, auth secret and every other env setting remain identical. Config-only rollback copy: `/home/btc/.local/share/wallet-auth/backups/20261126T070417780504Z-before-public-origin/previous.env`. The prior database backup was not restored or replaced.
- `python3 work/US-004-01/artifacts/public-origin/configure-origin.py > work/US-004-01/artifacts/public-origin/configure.log 2>&1` exited0. Restarted wallet-auth.service; public discovery readiness confirmed issuer `https://wallet-auth.beeswarm.dev/api/auth` and device endpoint `https://wallet-auth.beeswarm.dev/api/auth/device/code`. The existing reset-generation marker was unchanged. User/client/grant counts before and after: `{"grants": 0, "ownerClients": 0, "users": 1}` / `{"grants": 0, "ownerClients": 0, "users": 1}`. No database reset or deletion was performed.
- An initial inline snapshot helper closed its read-only connection before its transaction context exited and stopped before changing configuration; using contextlib.closing corrected that driver error. No product change was involved.
- `node --import tsx work/US-004-01/artifacts/public-origin/smoke.mjs > work/US-004-01/artifacts/public-origin/smoke.log 2>&1` exited0: **21 public HTTP/browser/CLI checks passed**. Public root and built assets200; correct discovery/issuer/device endpoint; public-only RS256 JWKS; retained CSP/nosniff; anonymous/invalid bearer/ineligible-client denials; browser sign-in/device page with no uncaught JavaScript errors; released CLI initiates native device flow over public HTTPS and cancels without saving credentials. Direct localhost Host now403 as expected; canonical public Host200. Database integrity/foreign-key checks passed and only the smoke’s own unapproved request was removed, preserving existing data.
- Current service protections remain NoNewPrivileges=yes and UMask0077. Source/release remains `ed2b0cf800ec7f193fdd7c278af678045d8ab4c3`; no product, dependency, proxy/tunnel/TLS or host-guard code change. Public readiness and native entry are observed, not physical-wallet/camera certification. No PR/CI, merge or acceptance transition occurred.

Artifacts: `work/US-004-01/artifacts/public-origin/` contains scripts, configure/result/smoke JSON and logs, plus screenshots. Manual now names the public URL and explains the backend/local Host distinction. Focused metadata, shell syntax, whitespace and complete-diff scope checks validate the documentation-only record; the existing QA_PASSED status is unchanged.

## Separate domain manual requested by the human — 2026-11-26

The human requested creating `manual-test-domain.md` first, then updating its cases with domain-release details for their own testing. Created the new file with its title/target first, then populated it with the current public release and domain-only instructions. The existing combined local manual was not edited by this task.

The new guide names https://wallet-auth.beeswarm.dev, issuer /api/auth, native device/token endpoints, backend port3001 and deployed source ed2b0cf. It uses a new private CLI state directory/profile, requires no server build/setup/env/database reset, and covers D01–D13: readiness, QR/complete URL, manual code entry, SIWE/consent, IAT registration, selected-target CRUD, invalid update, denial/cancellation/pending expiry, guessing/recovery, optional second-wallet switch, browser independence/real refresh, deletion and individual revocation/logout. Human observations are all **Not run**, with space for actual results; previous generated-wallet and public-entry smoke results are explicitly distinguished.

Actual documentation checks: curl public root returned200; live discovery issuer/device/token endpoints matched the guide; active systemd WorkingDirectory matched the recorded deployed release. All21 Bash blocks passed `bash -n` (syntax only, not execution of those manual cases). `python3 scripts/check_harness.py` passed13 story records; `git diff --check` passed. Read-only readiness/check output is retained under `artifacts/domain-manual/`. No authenticated case was executed for this request, no application/user data changed, and no product/deployment/status/PR/CI/acceptance change occurred. Full product verification was not repeated for this documentation-only addition.

## Domain manual D04 client-ID clarification — 2026-11-26

The human noted that D04 has no client-ID command argument. Read-only source inspection confirms cli/device.ts sends client_id=walletgate-cli for device login, while frontend/authorization/device.tsx displays owned clients by name/ID and submits permissions keyed by each selected clientId. Updated D04 to distinguish the fixed CLI identity from the target application, print the public ID saved in D03, and require matching that ID beneath the browser application's name before selecting permissions. No CLI flag, ownership behavior, product code or runtime configuration changed. Shell syntax, metadata, whitespace and final complete-diff scope checks apply to this documentation-only clarification; human domain case outcomes remain Not run.

## Human finished-result approval — 2026-11-28

The human explicitly instructed in chat: “Approve us-004-01 the finished result to authorize PR/CI”. This approves the presented finished result on branch codex/us-004-01-device-auth at 1f49487 and authorizes PR publication and required CI under PROCESS. Product/tests remain identical to full-verified revision 0d09a4f; later commits contain lifecycle/evidence/manual documentation only. Physical-wallet/camera/remote-host limitations remain as documented; approval does not claim those manual checks ran. Status remains QA_PASSED, acceptance fields empty; human merge after successful current-head checks is still required. Prior no-PR/CI statements above describe historical checkpoints. Unstaged US-004 documentation is excluded from publication.

Pre-publication focused checks: `python3 scripts/check_harness.py` exited0 (13 story records); `python3 scripts/check_scope.py --base f3f0e202037d47f3d7864d2c32537550d495fdeb --head HEAD --scope work/US-004-01/scope.json` exited0; `git diff --check` exited0. Comparison against 0d09a4f confirms only story/evidence/manual documentation changed since full product verification. No new QA transition or redundant full local suite was run for this documentation-only approval record.
