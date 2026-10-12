# GBoheme Intelligence — delivery and remaining gates

Updated: 2026-10-12. Existing PR: https://github.com/GBoheme/worldmonitor/pull/1.

هذه دفعة هندسية مثبتة وقابلة للمراجعة، وليست إعلان اكتمال جميع معايير المنتج أو جاهزيته للإنتاج. بقيت الشيفرة الأصلية والتراخيص، واستمر العمل على الفرع وطلب الدمج الموجودين.

## Delivered source behavior

- One Auto / Economy / Full preference shared by both settings surfaces, persistent across reload and storage changes, with a disclosed session-only fallback for failed writes.
- Economy SVG default, optional real 3D transition, bounded existing marker clustering, paused/hidden animation suspension and probe-context release. Advanced renderers remain emitted.
- TTL-aware news refresh that avoids repeated classification and failed-cache duplication; original important-only alert policy and source intervals retained.
- Optional local AI deferred at startup; explicit English summaries honor local/cloud opt-outs and tolerate worker failure. Arabic retains source text when no appropriate provider exists.
- Selective PWA precache, bounded on-demand asset cache, and CSP-compatible safe offline saved/cached news.
- Existing GBoheme Cairo/Arabic/English/RTL workspace: ten default interests, source/date evidence, country/time/source filters, saved news, editable draft-only publisher and explicit device notification permission.

## Verification recorded

| Check | Result / scope |
|---|---|
| Production web build | Passed, TypeScript + Vite + generated SW; strict secret scan |
| Intelligence unit suite | 39 passed, preferences/processing/alerts/connectors/publisher policy |
| Selected data/deploy/map guards | 321 passed, 6 existing skips, 0 failures; 327 reported tests |
| Selected DOM suites | 39 passed across ten files: new regressions plus existing contracts below |
| Existing DOM contracts | 27 passed across worker recovery, map persistence, storage, mobile isolation, premium gate and priority |
| Workspace E2E | 5 passed: Arabic/English, mobile, settings sharing, saving/drafts, safe offline source text |
| Strict SVG E2E | 3 passed: desktop/mobile stress budgets and destroyed flash cleanup |
| Actual map transition E2E | 1 passed: economy SVG → explicitly requested 3D → SVG → reload |
| Built PWA E2E | 1 passed under deployed CSP: no eager globe asset, on-demand cache, offline asset fetch and saved-news navigation |
| Typecheck / boundaries / lint / locale parity | Passed; pre-existing lint warnings retained |
| Audit | Four moderate transitive npm findings, no high/critical; incompatible forced downgrade not applied |

Local logs and screenshots are retained in the checkout cache and the delivery outputs directory. Production fixture measurements and methodology are committed in [the performance report](gboheme-performance.md). These checks do not constitute the complete repository suite or production acceptance.

## Platform status

- **Web/PWA:** production assets built locally; no deployment performed.
- **Android frontend:** `npm run build:intelligence:mobile -- --outDir dist-gboheme-mobile` passed. The output contains the native `index.html` entry and is isolated from web `dist`. An APK is blocked: Java JDK, Android SDK/platform-tools and NDK are absent. The existing minimal Tauri host excludes the desktop Node sidecar. Install the official prerequisites, run `npm run android:gboheme:init`, then `npm run android:gboheme:build`; verify a real-device install, back navigation, offline/resume and notification behavior separately. No APK or Android device result is claimed.
- **Windows:** final `desktop:gboheme:build` passed with source `883864f22ab4c1f784081bb910133c3b3fcd9703`; x64 EXE and MSI installers were produced. Installer execution/installed-app smoke and signing remain unverified. Original stable Rust registration lacked the physical cargo.exe. An isolated official Rust 1.90.0 toolchain was installed in `.cache/rustup-gboheme`; compiler and Cargo work. Its optional Rustup self-update download timed out, but the installed components are usable. Packaging uses the original desktop overlay, official checksum-verified Node and notices; the final build completed after the provider race fix, including both installer formats.

## Product gates still open

1. Facebook/X official OAuth, account reads and scheduled/automatic publishing are not implemented. Developer applications, provider plans/scopes, server-side token storage, a queue/receipt backend and explicit account publishing authorization are prerequisites. UI remains honest authorization-required/draft-only; no external posts were sent.
2. Native Android APK/device proof and background push/native delivery are missing. A PWA cached-news screen is not native background processing.
3. Physical low-memory Android/Windows hardware, GPU/FPS/battery/slow-cellular measurements and a long-running retention soak remain unverified. The four lab profiles inject hints and throttle CPU; they do not cap machine RAM.
4. Live RSS freshness, API quotas, provider entitlements/Ollama inference and signed-in cloud account sync were not established by controlled browser fixtures. The existing provider/reconciler paths remain optional.
5. Full semantic/cross-language event grouping, comprehensive fact verification and full-repository dead-code/security certification are not claimed. Current exact-title/time-window grouping and evidence labels retain their documented limits.
6. The four moderate audit findings and pre-existing chunk warnings need compatible, separately verified follow-up; they were not hidden or force-fixed.
7. Production signing, store submission, merge and deployment have no current authorization and were not performed.

## Resume and rollback

The source commits are kept on `ghboheme-custom`. Resume from that branch and PR #1; never replace it with the original archive or open another PR. Use Node 24 and the documented preflight. The isolated Rust toolchain can be selected in PowerShell with `$env:RUSTUP_HOME = Join-Path $PWD '.cache\rustup-gboheme'` and `$env:RUSTUP_TOOLCHAIN = '1.90.0'` for the build process.

Revert the authored repair commits to restore the previous PR behavior. No destructive migration, production seed, merge or deployment occurred. See [confirmed audit](gboheme-engineering-audit.md), [measurement JSON and tables](gboheme-performance.md), and [run instructions](ghboheme-running.md).
