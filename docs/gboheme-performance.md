# GBoheme Intelligence — قياس الأداء الفعلي

Date: 2026-10-12. Production build, Chromium 153.0.8010.12. Baseline: `7715efcf9fb5015ca02ab223d6a2cea011271a50`. Improved source: `883864f22ab4c1f784081bb910133c3b3fcd9703`.

انخفض العمل المتكرر عند تحديث الأخبار قبل انتهاء مدة المصدر، دون تقليل عدد البطاقات أو تغيير سياسة التنبيهات. انخفض التنزيل المسبق للـPWA؛ حجم JavaScript الكامل لم ينخفض. هذه نتائج مختبر بمحاكاة إشارات الأجهزة، وليست اختبارات هواتف فعلية بذاكرة محددة.

## Workload and method

Run `npm run build:intelligence`, then `node scripts/benchmark-gboheme.mjs <label>`. Each profile gets a fresh browser context, Arabic UI, the stated viewport and injected browser CPU/memory hints. CDP applies CPU throttling. Thirty controlled GitHub repositories supply twenty releases each (600 articles); the UI retains 100 visible cards. External requests outside those fixtures return 204. Three real Refresh button clicks occur before the source TTL expires. Both versions make zero additional connector requests during those clicks.

Startup is navigation-to-ready/cards/refresh-complete wall time, **not FCP or LCP**. Refresh task time is the change in CDP main-thread TaskDuration, **not CPU percentage**. Heap is the unforced-GC JSHeapUsedSize snapshot after the clicks, **not process RAM, retained heap, or a leak proof**. Service workers are blocked during these CPU/heap runs; the generated precache file inventory is measured separately. The real service worker is tested independently under the deployed CSP.

One sample per profile; no statistical significance is claimed. The inputs, harness, browser version and recorded limitations are included in the raw evidence.

## Results

All times in ms; heap in MiB. Arrows are before → after.

| Simulated profile | CPU throttle | Auto result | Startup | Three-click task time | Three-click wall time | Heap after clicks |
|---|---:|---|---:|---:|---:|---:|
| phone-2gb-signals | 4x | economy | 12969.2 → 13927.0 | 30087.6 → 324.4 | 30095.9 → 340.2 | 19.66 → 7.91 |
| phone-4gb-signals | 4x | economy | 12545.7 → 14693.3 | 30362.1 → 366.6 | 30385.8 → 368.9 | 16.80 → 7.91 |
| desktop-4gb-signals | 2x | economy | 5237.5 → 5437.5 | 13572.7 → 110.3 | 13584.9 → 169.4 | 14.18 → 7.33 |
| desktop-8gb-signals | 1x | full | 2099.9 → 2073.5 | 5330.7 → 45.5 | 5351.1 → 107.1 | 6.95 → 7.33 |

Across these samples, refresh task time fell 98.8–99.2%. DOM mutations associated with those refreshes fell from 60 to 0 in every profile. All profiles retained 100 cards, had no horizontal overflow, and emitted no page errors. The 8 GB-signals heap snapshot rose slightly; these results do not support a universal RAM reduction claim.

**Cold startup did not consistently improve:** both phone samples and the 4 GB-signals desktop sample were slower in the final run. One sample per profile cannot isolate the cause. The proven wins are cache-only refresh work and PWA installation bytes; no general startup-speed claim is made.

| Production artifact | Before | After |
|---|---:|---:|
| Generated precache entries | 306 | 287 |
| Precache file bytes | 13,348,451 (12.73 MiB) | 5,922,352 (5.65 MiB) |
| All emitted JS bytes, including optional chunks | 17,479,016 | 17,496,569 |
| All emitted JS gzip bytes | 5,283,471 | 5,290,304 |

Precache bytes fell **55.6%**. Total JS grew 17,553 bytes (0.10%) for the shared policy and translations. Raw main-page transfer and request counts are in the JSON; they vary slightly and are not claimed as a network reduction. Heavy maps and secondary panels remain emitted and available on demand.

## Independent behavior evidence

- Actual browser control path: economy SVG → explicit 3D globe → SVG → reload, without page errors. Headless software GL proves behavior, not hardware GPU performance.
- Existing strict SVG tests: desktop/mobile marker ceilings and flash timer/node destruction passed.
- PWA: a fresh cache excludes the globe bundle; requesting it populates the bounded runtime cache; offline fetch succeeds. Offline navigation then displays the retained source article under the real global CSP.
- DOM regression: no classification/card rebuilding before TTL, due sources still refresh, failed sources retain last-good articles without duplication; paused/hidden globe RAF suspension and resumption pass.

## Limits and raw evidence

No physical 2/4/8 GB device, OS RAM cap, GPU utilization, FPS, battery drain, slow-cellular shaping, forced-GC retention series, long-session soak, or production deployment was measured. Important-alert policy tests passed, but background push/native notifications are not implemented. Development E2E timings are not substituted for these production measurements.

[Before JSON](evidence/gboheme-2026-10-12/before.json) · [After JSON](evidence/gboheme-2026-10-12/after.json). Local screenshots/logs remain in `.cache/gboheme-benchmark` and the delivery outputs folder. See [audit](gboheme-engineering-audit.md) and [remaining delivery gates](gboheme-delivery-status.md).
