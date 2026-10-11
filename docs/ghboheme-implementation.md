# GBoheme Intelligence implementation

This derivative retains World Monitor's AGPL-3.0-only license, attribution,
dashboard, maps, source access controls and account services. PR #1 remains the
delivery vehicle; merging and production deployment are not authorized.

## Audit and repairs

- Baseline head: `4d5bdbb1bf8b65d10e24200596d701df54ea9be6`.
- Baseline personal preferences could not load: the multiline `as` assertion
  was invalid TypeScript. Fixed before behavior checks.
- Exact article copies now use publisher, canonical HTTP(S) URL, precise
  publication time, title and snippet. Only tracking parameters are removed.
  Different URLs, content, times and publisher reports remain available.
- Important status from a duplicate copy is retained. Missing identities and
  invalid dates are conservatively kept, rather than arbitrarily merged.
- Preference edits work during a blocked-storage session and explicitly report
  that they were not persisted. External writes supersede this fallback.
- Preferences use existing cloud sync and backup keys. Old cloud rows omitting
  the new key preserve local choices; explicit defaults represent reset.
- News panels invalidate async enrichment after preference/input changes and
  destruction, remove listeners, and cannot resurrect externally filtered news.
- Settings and empty states use the existing translation catalog.
- Preflight runs npm through Node on Windows, without a shell or lifecycle
  scripts. The previous direct spawn of `npm` could not execute `npm.cmd`.

Focused checks: 29 preflight tests, 18 preferences/sync tests, 4 panel lifecycle
tests, 3 blocked-storage tests, existing flat-card/publisher tests, TypeScript
and import boundaries. UI evidence and complete platform builds are recorded
separately; these checks do not prove live provider availability.
