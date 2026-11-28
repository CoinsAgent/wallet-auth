# Delivery plan — US-004-01

## Story and scope

Human approved READY and then explicitly requested implementation on 2026-11-26. Implement approved AC-01–13 only. Preserve original approval metadata. No deployment, shared/deployed reset, upstream edits, dependency upgrade, PR/CI or acceptance is authorized.

## Architecture and declared paths

Branch `codex/us-004-01-device-auth`; intended base `f3f0e202037d47f3d7864d2c32537550d495fdeb` (human-merged PR12). Retained acceptance commit `68e7f06` and merge provenance from the current session are carried into this branch: CoinsAgent merged PR12 at 2026-11-26T01:37:17Z after both required jobs passed on b47b461 in run43867506668. US-004 is ACCEPTED; no other delivery WIP. Existing manual/retest edits in work/US-004/{manual-test,plan,evidence}.md remain unstaged and are excluded except the committed acceptance evidence. New story and map changes are approved shaping input.

Exact writable files (including tests, configuration, documentation and artifacts) are in scope.json, declared before product edits. Existing ownership: backend/oidc owns protocol/device consent/grant policy; wallet-auth composes providers and SIWE identity; bootstrap owns fresh schema; CLI owns initiation/polling/QR; frontend/authorization owns browser device consent, pages/bootstrap assemble it. New device.ts, cli/device.ts and frontend/authorization/device.tsx extend existing domains, with no new runtime directories/dependency direction. Document skeleton in PROJECT_STRUCTURE before implementation. Generic UI stays independent. Reset maintenance script consumes bootstrap initialization and refuses non-local/test invocation; only disposable fixtures are reset during delivery.

Use native oauthDeviceAuthorization with oauthProvider 1.7.15. Guard external entry points, reuse native code state/consume and provider issuance, and adapt token family binding through supported middleware/adapter composition. Preserve PKCE and third-party policies. Do not rebuild native RFC8628 or patch upstream.

## Baseline

`bash scripts/verify.sh > /tmp/us00401-baseline.log 2>&1` launched before product edits. Exited 1: harness43/43, structure41/41, application287/287, lint/types/build/lockfile/dependencies passed; all81 browser tests failed before launch because Chromium headless shell1248 was absent. `npx playwright install chromium` installed the required binaries without dependency-source changes. Later browser checks execute normally.

## Acceptance verification

| AC | Planned observed verification |
|---|---|
|01–02|Native actual-provider device initiation/token/discovery, wrong client/resource/scope and session-token alias denial|
|03,07|Spawn actual CLI with controlled HTTP provider: URL/QR/manual fallback, no callback, pending/slow_down/timeouts/cancellation/deadline/secret-safe output|
|04–06|Actual SIWE fixtures, authenticated code lookup, five guesses across tabs/code variants, explicit permissions/offline/code confirmation, bypass/session change/expiry/replay/race|
|08–11|Actual provider opaque credentials, grant binding, protected storage/restart/refresh/reuse/deadlines/logout/replacement/revocation isolation|
|12|Existing complete application/CLI/browser/OIDC regressions|
|13|Disposable fresh/legacy databases, startup refusal unchanged, explicit local reset and unsafe invocation rejection|
|UI|Browser keyboard/focus/announcements/axe, actual contrast, narrow/200% zoom, light/dark/reduced-motion, QR rendering/decoding; distinguish simulated proofs from physical wallet observations|

## Verification and handoff

Focused checks while developing; full bash scripts/verify.sh with complete committed scope before QA_PASSED, plus complete diff review and independent fresh technical review. Record actual results and gaps in evidence.md. Missing required checks prevent QA. Human finished-result review precedes PR/CI; human merge precedes ACCEPTED.

## Technical scope revision

Add backend/bootstrap/server.ts for the native /device verification page entry and backend/oidc/protocol.ts for server discovery advertisement, before those edits. Both reuse existing owners and approved interoperability scope. Baseline completed with failing browser launch checks; see Baseline above for totals. Required Chromium/headless-shell installation subsequently completed and actual browser tests run successfully.

Add scripts/reset-local-data.ts before editing: the existing identity-only reset must also clear pending device authorization so old requests cannot survive an explicit local reset. Device state cleanup stays owned and exported by oidc.

## Review corrections

Independent read-only reviewer found (1) wallet-switch release missing, (2) production native valid-review limiter sharing one IP fallback bucket, and (3) a late deadline recheck needed. Added explicit pending-claim release restricted to the reviewed session, preserving same-owner replacements; scoped native `/device` rate-rule override behind mandatory SIWE and durable incorrect-guess limiter, retaining all other native limits; final response-boundary guard and transaction rollback. Add production, stale-wallet and crossing-deadline regressions. Native approval/denial remains authoritative. Legacy full browser suites generate ignored screenshots in work/US-001-05/artifacts and work/US-004/artifacts; declare those execution paths before rerunning them, without changing older product/evidence files. New story screenshots stay in work/US-004-01/artifacts.

Review follow-up: declare tests/app/device-production.ts before adding an isolated production process. Better Auth caches NODE_ENV at import, so an in-process environment stub cannot prove production limiter behavior. Replace it with actual production initialization, asserting rate limiting is enabled.

## Final local result

Exact tested revision `0d09a4fa5dcdfe4938c19d21ab35002745cd86c4` passed full verification with complete-diff scope:43 harness tests,41 structure fixtures,331 application/CLI tests and88 browser tests, plus lint/types/build/lockfile/dependency checks. Independent reviewer rechecked corrections and reported no unresolved material findings. Light/dark screenshots visually inspected; physical device/camera/remote-host testing remains explicitly unobserved. See evidence.md for actual commands and AC matrix. Record QA_PASSED directly; human finished-result approval precedes PR/CI and human merge precedes acceptance. No deployment or shared/deployed reset performed.

- [x] Approved ACs implemented and meaningfully tested
- [x] Full local verification and complete scope checks
- [x] Independent technical review and corrections
- [x] Evidence and limitations recorded for exact revision
- [x] Human finished-result approval before PR/CI
- [ ] Required checks and human merge before ACCEPTED

## Human-requested manual walkthrough preflight

Human requested running the proposed manual walkthrough first and adding manual-test.md only if successful. Preserve the current QA_PASSED product revision and prior US-004 dirty docs. Narrow writable paths: this plan, work/US-004-01/evidence.md, work/US-004-01/manual-test.md after successful checks, and ignored work/US-004-01/artifacts/manual-preflight/ for runner/log/result/screenshots. All are within the existing scope directory. No product/test-source change or QA transition is planned. Start a fresh isolated local instance and invoke the real CLI with browser UI SIWE/consent via generated-wallet fixtures. Test registration, selected-target reauthorization, get/update/delete, revocation/logout, denial/cancellation/guessing/wallet switch, real five-minute pending expiry and real15-minute automatic refresh. Do not modify clocks or credential expiry. Distinguish automated observation from physical wallet/camera/remote-host testing. Only disposable data/clients are created or deleted; no deployment or shared/deployed reset.

### Manual walkthrough outcome

Main operational runner exited0 after real-time pending expiry and access renewal; supplemental manual URL/code and actual npm process-group cancellation checks exited0. The run covered registration, selected-target consent, CRUD atomicity, guessing/recovery, wallet switching, browser independence, deletion, revocation/logout and cleanup. Added manual-test.md only after success. Numeric CLI interruption assumptions were corrected to the observed npm SIGINT behavior. Preliminary failures were runner-fixture/URL issues only, retained separately; no product changes. Physical wallet/camera/remote-host checks remain unperformed. Only this story’s manual, plan and evidence are tracked changes for this maintenance task; prior US-004 dirty docs stay separate. Focused document validation applies; no new QA transition or hosted CI.

## Explicitly authorized fresh port-3001 release and database reset

The human requested removing the database and a fresh release at http://127.0.0.1:3001. Inspection identified the current port3001 listener as user service wallet-auth.service, cwd /home/btc/code/wallet-auth, configured for https://wallet-auth.beeswarm.dev with NODE_ENV=production and database /home/btc/code/wallet-auth/data/walletgate.sqlite. After this impact was explained, the human explicitly confirmed: “reset that database and replace the service with the requested http://127.0.0.1:3001 issuer”. This authorizes that specific deployed/shared reset and service/issuer replacement for this operation, superseding the prior local-only operation boundary; approved product ACs and QA/acceptance status do not change. No further permission is needed for this confirmed operation. No proxy/tunnel/TLS/host-protection changes are authorized or planned.

Narrow execution paths declared before mutations: this plan, work/US-004-01/evidence.md, ignored work/US-004-01/artifacts/release-3001/; runtime release and private rollback storage beneath /home/btc/.local/share/wallet-auth/{releases,backups}/; existing target /home/btc/code/wallet-auth/data/walletgate.sqlite and its SQLite sidecars; the existing wallet-auth.service configuration or a narrow user-systemd drop-in as identified by inspection. Preserve unrelated prior work/US-004 dirty documentation. Prepare exact committed source in an immutable release, verify its locked build and disposable actual-release native OAuth device smoke before stopping the service. Keep the existing auth secret protected and unchanged unless configuration requires otherwise; never print it. Make a private consistent rollback backup before resetting, record its retention transparently, then stop old service, replace the authorized database with freshly initialized storage, update only runtime release/origin configuration, restart and verify readiness, metadata, auth boundaries, browser entry and native CLI/device denial/cancellation. Ensure fresh counts at switch are zero users/owner clients/grants with one system public CLI. Do not leave fixture registrations in the reset target.

Technical documentation path addition before editing: work/US-004-01/manual-test.md will identify the now-running authorized localhost release and explain skipping isolated server setup when testing it. Its existing fresh-isolated walkthrough remains valid. No product or approved-AC changes.

Port3001 operation completed: release `ed2b0cf800ec7f193fdd7c278af678045d8ab4c3` installed offline/built;60 actual-release focused tests passed. Authorized database reset and WorkingDirectory switch succeeded, service running with inherited NoNewPrivileges/UMask and unchanged secret/other configuration.21 live HTTP/browser/CLI checks passed; own unapproved smoke request removed; active DB has users0, owner clients0, grants0, pending devices0 and system CLI1. Private consistent rollback backup retained at `/home/btc/.local/share/wallet-auth/backups/20261126T064253Z-before-local3001/previous.sqlite`. No rollback, proxy/TLS/tunnel change, hosted CI or acceptance transition. Updated manual and evidence; prior US-004 dirty docs remain separate.

## Human-approved public issuer correction

After the public URL returned Untrusted host, inspection confirmed the requested localhost origin returned200 and the former public Host/public HTTPS URL returned403. The human explicitly answered “yes please” to switching the canonical issuer to https://wallet-auth.beeswarm.dev while preserving port3001 and the existing fresh database. This authorizes only the origin correction and service restart, not another database reset, proxy/tunnel/TLS changes, weaker host checks, PR/CI or acceptance.

Narrow paths before edits: this plan, evidence.md, manual-test.md and ignored work/US-004-01/artifacts/public-origin/; active release .env at /home/btc/.local/share/wallet-auth/releases/20261126T064253Z-ed2b0cf-local3001/.env; a private configuration-only backup beneath /home/btc/.local/share/wallet-auth/backups/. Change only TRUSTED_ORIGIN, preserve secret/PORT/DATABASE_PATH and all other settings, atomically update the private env file, restart wallet-auth.service and verify public HTTPS root/assets/discovery/JWKS and browser/native CLI device entry. Use only an anonymous pending smoke request and remove that exact unapproved request; do not reset existing data. Restore the prior origin config only if readiness fails. Keep existing service protections and strict Host validation.

Public issuer correction completed: only TRUSTED_ORIGIN changed; service restarted with backend port3001 and unchanged DB/reset generation, secret and protections. Public HTTPS root200 and correct public issuer/device metadata observed.21 public HTTP/browser/CLI smoke checks passed; own unapproved request cleaned without resetting existing data. Updated manual/evidence and preserved previous dirty US-004 work docs. Config rollback stored privately at `/home/btc/.local/share/wallet-auth/backups/20261126T070417780504Z-before-public-origin/previous.env`. No code, proxy/TLS/tunnel, PR/CI or acceptance changes.

## Domain-only manual requested by the human

The human requested first creating work/US-004-01/manual-test-domain.md and then updating its cases with the domain release details for their own testing. Narrow writable paths: the new domain manual, this plan and evidence.md; ignored work/US-004-01/artifacts/domain-manual/ for read-only readiness/document-check output. Existing work/US-004-01 directory scope already covers them. Create the file first, then populate domain-only setup and expected outcomes for https://wallet-auth.beeswarm.dev, issuer /api/auth, actual deployed source ed2b0cf, isolated CLI profiles, separate-browser/device consent and lifecycle/CRUD/revocation checks. Preserve the existing combined local manual and prior US-004 dirty docs. No server setup/build, .env change, reset, deployment, product implementation or human-test-result claim. Verify public read-only readiness and shell syntax/metadata/whitespace/scope only.

Domain manual completed: created the requested file first, then populated domain-only D01–D13 instructions and a Not run human-results table. Live root/discovery and active release identity verified;21 shell blocks passed syntax check; metadata/whitespace checks passed. Existing combined local manual and prior US-004 dirty docs preserved. Only domain manual, this plan and evidence changed; no new product or runtime mutation.

Domain manual clarification: human noted no client ID argument in D04. Narrow paths: manual-test-domain.md, this plan and evidence.md. Clarify existing behavior only: device login uses system OAuth client walletgate-cli; browser consent shows owned application names/IDs and records selected target IDs. Add an explicit comparison to the public client ID saved in D03, without inventing a CLI --client-id option or changing ownership/permissions. No product/runtime change; focused document checks only.

## Finished-result approval and PR publication — 2026-11-28

The human explicitly instructed: “Approve us-004-01 the finished result to authorize PR/CI”. This authorizes publishing the reviewed branch at 1f49487 plus this approval/evidence record and opening its PR to main. Narrow writable paths for this step: this plan and work/US-004-01/evidence.md, already declared in scope.json. Preserve unstaged US-004 documentation; stage only these two files. Product/test source is unchanged from full-verified 0d09a4f. Run focused metadata, whitespace and complete-diff scope checks; existing PR workflow supplies required hosted checks. No merge or ACCEPTED transition is authorized.
