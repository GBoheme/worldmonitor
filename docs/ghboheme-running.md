# GBoheme Intelligence: run and review

GBoheme is an additive news workspace at `/dashboard?intelligence=1`. The original
World Monitor dashboard remains at `/dashboard`. The source license and original
credits remain in place. This is a reviewable beta, not a completed production release.

## Local web

Use Node 22 or newer and the existing installation/preflight instructions.
Run `npm ci`, then `npm run dev`, and open the intelligence URL on the printed local
address. `npm run build:intelligence` builds the shared SPA/PWA without rebuilding
the independent blog and Pro marketing surfaces. `npm run preview` serves that build.
The original complete distribution scripts remain available.

Optional settings are described in `.env.gboheme.example` and the original
`.env.example`. No provider key is needed for rules, saved news, source extracts,
public GitHub releases or drafts. Optional translation and source-grounded AI
summaries invoke the existing providers only when requested; unavailable providers
leave the source extract readable. Generated summaries retain provider provenance,
require review and never replace source evidence. Arabic requests do not substitute
the existing English browser model for an Arabic model.

## News and alerts

- Ten interest categories start enabled; changes apply immediately and persist.
- Exact article copies are collapsed conservatively. Event grouping uses an exact
  normalized headline and a six-hour window; it does not claim semantic equivalence
  across languages or identify every evolving event automatically.
- Cards retain the original extracts, article dates, source links, publisher families
  and a timeline. Syndicated copies do not create independent coverage.
- Importance combines declared source tier, impact, recency, interests, coverage and
  major official releases. Explicit Arabic/English country names add a small
  geographic-context score; these are text mentions, not verified impact locations.
  Country-mention and day/week/unknown-date filters are available.
- Official repository releases and independent coverage are separate from truth.
  The labels are not a fact-checking guarantee. Rule classification has a disclosed
  confidence value and can reuse upstream model classifications when present.
- Foreground alerts admit only recent verified high/critical events, respect source
  and topic exclusions and quiet hours, suppress repeated/timestamp-only updates,
  and cap bursts at three per ten minutes. Browser/device permission is explicit.
  Background push, scheduled refresh and native Android notification delivery are
  not implemented by this workspace.

## Sources and storage

RSS/Atom reuse the existing bounded read-only RSS pipeline and its source controls.
GitHub reads stable public releases, tag-only references, official repository search
and comparisons of the latest two published releases through the official REST API.
Search results sorted by stars are discovery results, not a claimed trending metric.
Tags without source dates remain undated. Comparisons retain source commit messages
and link to the official comparison; they do not infer compatibility from commit counts.
YouTube supports official channel RSS using a channel ID. Each connector has an
interval, bounded request timeout, last-good cache, quota/error state and backoff.
Two connectors run concurrently. X/Facebook display authorization-required status;
they do not have a fabricated login or publish endpoint. The user explicitly chose
drafts only because developer applications are not available.

Saved stories retain their event evidence. Cache, connectors, alert history and
editable drafts use bounded local storage. Blocked writes report session-only state.
Interests and saved news join the existing account-sync/backup key list, with
old-client absence tolerance. Cloud syncing requires the original account flow and
its feature flag; this workspace starts the existing reconciler for signed-in
accounts when enabled and unsubscribes when destroyed. This workspace does not add
a second account backend. Drafts and
connector settings are local. Offline PWA navigation shows a self-contained,
safely rendered snapshot of saved/cached news; reconnecting restores the full UI.

## Intelligence Publisher

Cards prepare editable X/Facebook source-based drafts with links, dates and warnings.
Arabic/English templates do not automatically translate original source text. An
explicitly requested, reviewed source summary can seed the Facebook draft, marked
for review. Copy,
edit and delete are implemented. A policy function checks authorization, verification,
recency, source URLs, length and prior receipts for a future server publisher.
No server publisher calls that function yet. OAuth account connection, automatic
publishing, scheduling and licensed-image selection are not active. The user chose
drafts only; social API access is not a prerequisite for this delivery.

## Native packaging

`npm run desktop:gboheme:build` adds a GBoheme name, identity and icons through a
Tauri overlay while preserving the original desktop config and sidecar. Native
build output includes SHA256-verified official Node and its license. Native frontend
output is isolated in `dist-gboheme-desktop`; web builds remain in `dist`.

Android has a separate minimal Tauri host under `mobile/src-tauri`, sharing the
same frontend. It deliberately does not start the desktop Node sidecar or expose
its secret-management commands. Its frontend uses the existing authorized web API.
`npm run android:gboheme:init` initializes the official Android project after Java,
SDK and NDK checks. `npm run android:gboheme:build` requests APK output. Native
Android compilation/device behavior remains unverified until those prerequisites are
available. The shared frontend builds in `dist-gboheme-mobile`; host-platform Rust
checks validate the wrapper and scoped official URL opener, not an APK or Android
hardware back/notification behavior. Reference: [Tauri Android prerequisites](https://tauri.app/start/prerequisites/#android).
No private keys belong in APKs or Vite-prefixed variables. Signing and production
release are separate, unauthorized actions in this task.

## Reproducible verification

- `npm run test:intelligence`: preferences, processing, alert and connector/publisher policy.
- `npm run test:dom -- tests/dom/intelligence-store.test.mts tests/dom/gboheme-mobile-runtime.test.mts`.
- `npx playwright test e2e/intelligence-workspace.spec.ts --project=chromium`:
  controlled official-release fixtures and one failing source, real settings,
  saved/draft persistence, Arabic/English, mobile navigation and safe offline text.
- After the web build:
  `npx playwright test --config playwright.intelligence-pwa.config.ts --project=chromium`.
  This exercises the actual generated service worker and an offline reload.
- Existing TypeScript, import boundaries, safe-HTML, locale/source attribution and
  audit checks remain part of delivery. Browser fixtures do not prove social
  permissions, live RSS availability, full native behavior or production deployment.

The four remaining moderate dependency audit findings involve `fengari`/`sprintf-js`
and `exceljs`/`uuid`. Compatible updates reduced the original 24 findings; the remaining
suggested ExcelJS downgrade changes a major API. No high/critical finding remained
in that audit. Do not force downgrade or call the complete original suite verified
without exercising its additional paths.
