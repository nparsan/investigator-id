# Trial‑Based Filter Integration Plan (PI‑Finder)

> Goal: Allow users to narrow the investigator list by properties of the **clinical trials** they are working on (sponsor type, phase, status, etc.) using the existing `nct_id` that already lives on each investigator record.

---

## 0. TL;DR (Option B ‑ on‑demand)

‣ **No new tables, no cron jobs.**  We fetch trial metadata only for the
   `nct_id`s included in the current investigator search.
‣ One extra API route (`/api/trial-meta`) that proxies those IDs to the
   ClinicalTrials.gov v2 endpoint in batches of ≤100.
‣ Front‑end receives the trial meta once and applies filters entirely in
   memory (phase, sponsor, recruiting status).

---

## 1. Filters Supported in v0

Field | UI Widget | Returned JSON key
----- | ---------- | -----------------
Phase | Chips 1 · 2 · 3 · 4 | `phase`
Sponsor Type | Radio **Any / Industry** | `fundedBy`
Recruiting Status | Checkbox **Recruiting** | `overallStatus`

(The API call already gives us these three fields – keep scope tight.)

---

## 2. Backend ‑ `/api/trial-meta`

Location: `app/api/trial-meta/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server"

const CT_URL =
  "https://clinicaltrials.gov/api/v2/studies?fields=nctId,phase,fundedBy,overallStatus"

export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get("ids")?.split(",") ?? []
  const batches = []
  for (let i = 0; i < ids.length; i += 100) batches.push(ids.slice(i, i + 100))

  const all: any[] = []
  for (const chunk of batches) {
    const url = `${CT_URL}&ids=${chunk.join(",")}`
    const res = await fetch(url)
    const json = await res.json()
    all.push(...json.studies)
  }

  // shrink to the shape the UI needs
  const trimmed = all.map((s) => ({
    nctId: s.protocolSection.identificationModule.nctId,
    phase: s.protocolSection.designModule.phases?.[0] ?? "NA",
    fundedBy: s.protocolSection.sponsorCollaboratorsModule.leadSponsor?.class,
    overallStatus: s.protocolSection.statusModule.overallStatus,
  }))

  return NextResponse.json(trimmed)
}
```
• Worst‑case 1 000 IDs → 10 requests → ≈4 s.
• No persistence; everything happens per request.

---

## 3. Front‑End Hook & Sidebar

```ts
// hooks/useTrialMeta.ts
export function useTrialMeta(ids: string[]) {
  return useQuery(['trialMeta', ids.sort().join(',')], async () => {
    if (!ids.length) return []
    const res = await fetch(`/api/trial-meta?ids=${ids.join(',')}`)
    return res.json() as Promise<TrialMeta[]>
  })
}
```

```tsx
// components/TrialFilterDrawer.tsx (sketch)
const { data, isLoading } = useTrialMeta(allNctIds)
// build unique phase/sponsor/status sets → render checkboxes
// when user toggles, filter the investigators array on the client
```

No additional API calls after the first fetch.

---

## 4. Minimal Code Touchpoints

1. `app/api/trial-meta/route.ts` ← new
2. `hooks/useTrialMeta.ts` ← new
3. `components/TrialFilterDrawer.tsx` + small additions to the search page
4. Tiny extension to `lib/types.ts` (`TrialMeta` interface)

That's all that's required for the MVP.

---

## 5. Later (post‑MVP)

If we need instant filters or advanced fields, we can graduate to the
pre‑ingestion strategy (separate `trials` table + nightly sync) without
changing the front‑end contract.

---

## 6. Implementation Log (2024‑06‑XX)

The following pieces have been **implemented in the repository**.  File paths are relative to `pi-finder/` unless otherwise noted.

| Area | File | Status | Notes |
|------|------|--------|-------|
| **Types** | `lib/types.ts` | **UPDATED** | Added `TrialMeta` interface ( `nctId`, `phase`, `fundedBy?`, `overallStatus?`). |
| **Data‑fetching Hook** | `hooks/use-trial-meta.ts` | **NEW** | React Query hook that requests `/api/trial-meta?ids=…` and caches by a stable, sorted ID list. |
| **UI – Filter Drawer** | `components/trial-filter-drawer.tsx` | **NEW** | Drawer containing Phase chips, Sponsor radio, Recruiting checkbox. Emits `TrialFilters`. |
| **UI – Query Provider** | `components/query-provider.tsx` | **NEW** | Registers a `QueryClientProvider` at the app root. |
| **Page Wiring** | `app/pi-finder/page.tsx` | **UPDATED** | ① Collects all NCT IDs from current physician results → `useTrialMeta` → `metaMap`. ② Applies client‑side filtering via `TrialFilterDrawer`. |
| **API Route** | `app/api/trial-meta/route.ts` | **NEW** | Implemented batched fetch to CT.gov with error handling. |
| **URL Length Safety** | `app/api/trial-meta/route.ts`, `hooks/use-trial-meta.ts` | **UPDATED** | Added POST support and automatic POST fallback when URL exceeds 1800 chars. |

### ✅ Day‑3 – Client‑Side Filtering Completed (2024‑06‑15)

1. Integrated `TrialFilterDrawer` into results header with active filter state.
2. Added `useMemo` filter pipeline in `app/pi-finder/page.tsx` to apply Phase, Sponsor, and Recruiting filters to physicians using `metaMap`.
3. Implemented normalized phase parsing in `app/api/trial-meta/route.ts` to convert raw CT.gov phase strings → "1"–"4"/"NA".
4. Added inline Alert banner when `/api/trial-meta` fails, closing **Surface errors in the UI** item.

---

## 7. Next Steps for Full Functionality

- ~~Surface errors in the UI~~ ✅ Implemented via alert banner on `metaError`.
- URL length safety – ✅ Completed.
- Optional caching – *(still optional)*
- Unit tests / Contract tests – *(todo)*
- Documentation upkeep – ongoing.

---

_(Last updated: 2024‑06‑XX)_ 