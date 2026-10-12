# GBoheme Intelligence — confirmed engineering audit

Date: 2026-10-12. Scope: existing `ghboheme-custom` branch and PR #1, starting at `7715efcf9fb5015ca02ab223d6a2cea011271a50`. Original archive/checkout preserved. The low-resource source archive, patch and previous audit named in the request were absent from the available attachment and targeted local directories; no unseen patch is claimed as integrated. The existing branch already contained the branded workspace and native wrappers. Its source was compared with the fetched base and reviewed before execution.

## Confirmed defects and repairs

| Priority | Path / cause | Evidence | Repair and risk control |
|---|---|---|---|
| P0 | `public/offline.html`: the GBoheme inline bootstrap was omitted from the deployed strict CSP trust mechanism | Saved news would not render under CSP; the extended production SW test now runs with the exact global header | Add the existing static-bootstrap nonce, retaining the original hash-trusted offline script and safe text/link rendering |
| P1 | `IntelligenceWorkspace.refresh`: each poll reclassified/rebuilt articles even when connector TTL/backoff returned cached results | Failing regression before repair; 600-article production workload spent 5.3–30.4 seconds of task time on three cache-only clicks | Use the connector's single `isDue` authority before busy/render work; same source intervals, concurrency and alert policy |
| P1 | Failed-source last-good cache was appended again to workspace articles | Failure/backoff regression demonstrated growing duplicate articles | Collect only successful ready results; keep existing articles for failed/uncompleted sources |
| P1 | `MapContainer.setRenderPaused` forwarded only to Deck; globe animation continued when a panel was paused | Prototype lifecycle regression failed before repair | Forward/store paused state across renderer replacement; stop/resume globe and decorative RAFs, retaining pending data |
| P1 | Hidden-tab state could be confused with independent panel pause | Visibility/resume regression covers both gates | Suspend animation without rewriting the panel gate; wake refuses hidden, paused, lost-context or destroyed states |
| P1 | `Map.ts` opened a WebGL context solely to clear an empty cluster canvas; cluster data actually renders as HTML markers | Consumer inspection found no GL draw calls; existing marker stress/cleanup tests passed | Remove the unused context setup/clear path; keep clustering, SVG and HTML markers |
| P1 | Optional map/panel/media bundles were fetched by PWA install despite lazy JS imports | Precache inventory: 13,348,451 bytes; real SW cache inspection | Selectively exclude heavy chunks; keep core shell precache and add a bounded 160-entry/30-day cache for hash-named same-origin assets |
| P1 | Shared device policy absent at this branch head | Browser and original settings lacked Auto/Economy/Full | One persisted policy using coarse supported hints; SVG defaults without removing explicit 3D; release probe WebGL contexts |
| P1 | Economy boot should not start opted-in local AI automatically, but explicit summaries must remain usable | New explicit-action tests cover opt-in, Arabic exclusion, worker failure fallback | Defer boot/embedding work; English summary action honors existing local opt-in and starts the existing worker on demand |

The first refresh and globe regressions failed on the original code before the repairs. No dependency or product renderer was removed speculatively. The standalone GL helper remains because its independent capability contract still has tests; only its unused SVG consumer was removed.

An additional confirmed preference defect in the pre-existing summary action ignored the
web cloud/local provider toggles. It now passes both opt-outs into the existing provider
chain and re-reads preferences after asynchronous startup, terminating the worker when local authorization was revoked. Five explicit-action tests
cover opt-in, Arabic exclusion, failure fallback, both providers disabled, and an opt-out
during startup. This does not add a provider or bypass entitlement checks.

## Security, dependencies and architecture

- TypeScript production build and typecheck passed. Import boundaries passed; no server/browser boundary or generated RPC code was edited.
- Full lint and safe-HTML guard passed (existing lint warnings retained). Locale parity passed for all 27 additional locales; Arabic/English performance strings are authored, other locales use the repository's English fallback convention.
- Existing 39 intelligence tests cover conservative URL identity, safe source evidence, alert deduplication/admission, quota/backoff, abort behavior and future publishing policy. Browser offline XSS fixture remains escaped text; unsafe URLs are excluded.
- Strict Vite secret scan and desktop environment checks passed. No provider secrets were added to source, screenshots, JSON evidence or distribution.
- Current npm audit: four moderate transitive findings, zero high/critical. `fengari → sprintf-js` has no available fix; `exceljs → uuid` is tied to a suggested major downgrade. No forced incompatible dependency change was applied.
- Build still reports the pre-existing circular chunk relations between proxy/persistent-cache and App/checkout and mixed static/dynamic imports. Successful boot does not prove those harmless in every scenario. They require a separate consumer-aware chunk investigation, not blind splitting.

## Verification scope

Controlled browser fixtures exercise real application modules, navigation, requests, persistence, Arabic/English, responsive settings and SW recovery. They do not prove live social OAuth, licensed API availability, physical GPU behavior or production freshness. The full repository's unrelated API/worker/market suites were not claimed as run. This is a confirmed-path audit, not an exhaustive dead-code or security certification.

A stale deploy assertion was aligned with the existing intelligence PWA start URL, and the Bash test launcher now accepts `WM_BASH_BIN` on Windows while retaining `/bin/bash` by default. Source attribution was regenerated solely to record the new loopback benchmark reference; license/credits/provider counts remain intact.

Revert the performance/offline/provider-preference commits to return to the original PR head's behavior; no merge, deployment, data migration or external publishing occurred. See [measurements](gboheme-performance.md) and [delivery status](gboheme-delivery-status.md).
