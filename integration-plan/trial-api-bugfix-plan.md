# Fix Plan – ClinicalTrials.gov v2 Request Bug

Date: 2024‑06‑XX

---

## TL;DR «Why does the bug occur?»

Our `/api/trial-meta` endpoint still talks to ClinicalTrials.gov **as if it were the old "classic" API**: it appends `&ids=nct1,nct2` to the query string.  The modern v2 service **does not recognise that parameter**; the correct way is either

* `GET /api/v2/studies/{nctId}` – one study at a time, **or**
* `GET /api/v2/studies?filter.ids=nct1,nct2,…` – many-at-once (≈100 IDs per call).

Because we hit the retired path, CT.gov answers **HTTP 404**, the handler swallows the error, and the UI ends up with an empty `studies` array ‑→ no filtering options.

---

## 1 Problem Statement

File affected: `pi-finder/app/api/trial-meta/route.ts`

```ts
const CT_BASE_URL =
  "https://clinicaltrials.gov/api/v2/studies?fields=nctId,phase,fundedBy,overallStatus";
…
const url = `${CT_BASE_URL}&ids=${chunk.join(',')}`;
```

* `ids=` was valid only for the legacy XML/JSON API.
* The v2 REST interface expects `filter.ids` **and** puts every other option (`fields`, `format`, `pageSize`, …) in top‑level query parameters.
* The field list currently asks for flat keys (`nctId,phase,…`) that don't exist in v2 responses; the real data lives under `protocolSection.*` paths.

Result: every request fails (404) or returns an empty payload.

---

## 2 Fix Overview

1. Use the correct base path: `https://clinicaltrials.gov/api/v2/studies`.
2. Pass **all** request modifiers via `URLSearchParams`:
   * `filter.ids=nct1,nct2,…` (≤~100 IDs, or watch URL length)
   * `fields={path1},{path2},…` (only what we need)
   * `format=json`
   * `pageSize={batchSize}`
3. Loop over `nextPageToken` if CT.gov paginates.
4. Parse the returned JSON exactly like the working Python helper.
5. Keep the existing GET/POST interface and the return shape so the front‑end stays untouched.

---

## 3 Step‑by‑Step Implementation

### 3.1 Constants

```ts
const CT_BASE = "https://clinicaltrials.gov/api/v2/studies";
const KEEP_FIELDS = [
  "protocolSection.identificationModule.nctId",
  "protocolSection.designModule.phases",
  "protocolSection.sponsorCollaboratorsModule.leadSponsor.class",
  "protocolSection.statusModule.overallStatus",
].join(',');
const MAX_BATCH = 100; // safe URL length
```

### 3.2 fetchTrialMeta()

```ts
async function fetchTrialMeta(ids: string[]) {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += MAX_BATCH) {
    const batch = ids.slice(i, i + MAX_BATCH);
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        "filter.ids": batch.join(','),
        fields: KEEP_FIELDS,
        format: "json",
        pageSize: String(batch.length),
      });
      if (pageToken) params.set("pageToken", pageToken);

      const res = await fetch(`${CT_BASE}?${params.toString()}`, {
        headers: { accept: "application/json" },
        next: { revalidate: 60 },
      });
      if (!res.ok) throw new Error(`CT.gov ${res.status}`);
      const json: any = await res.json();

      out.push(...json.studies);
      pageToken = json.nextPageToken;
    } while (pageToken);
  }
  return out.map(normalizeStudy);
}
```

### 3.3 normaliseStudy()

Replicate the logic from `clintrials_api_testing.ipynb` to extract `nctId`, first phase digit, `fundedBy`, `overallStatus`.

### 3.4 Route handlers

`GET` and `POST` logic stays the same; they just call the new helper.

---

## 4 Testing

1. Unit test `fetchTrialMeta` with a fixture list `["NCT04379570", "NCT01772004"]`.
2. Check that the response matches:

```json
[{"nctId":"NCT04379570","phase":"3","fundedBy":"INDUSTRY","overallStatus":"COMPLETED"},
 {"nctId":"NCT01772004","phase":"2","fundedBy":"OTHER","overallStatus":"TERMINATED"}]
```
3. Hit the full `/api/trial-meta?ids=…` endpoint in dev and verify the drawer renders phase & sponsor filters.

---

## 5 Roll‑out Notes

* No database migrations.
* Front‑end hook (`useTrialMeta`) unchanged.
* Watch prod logs for rate‑limit (429) responses; respect `Retry‑After` if needed.
* Consider caching successful responses in Vercel's edge cache or Redis to cut latency.

---

## 6 Future‑Proofing

* Expose `/api/v2/version` once a day to detect schema changes.
* Move parse helpers into a dedicated `lib/ctgov.ts` with unit tests.
* Re‑evaluate batch size vs. URL length limits every 6 months. 