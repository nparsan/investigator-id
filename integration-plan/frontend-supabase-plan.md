# Frontend Integration Plan: Supabase + Drizzle + Next.js (PI‑Finder)

> Goal: Replace mock data with live data from the `investigators` table in Supabase and render them in the existing card‑based UI that supports ZIP‑code & radius search (plus free‑text indications filter) with pagination.

---

## 0. TL;DR

For the **MVP** we will now:

- [x] **Keep the database exactly as‑is** (no new columns or extensions).
- [x] Use the `zipcodes` npm package to translate the user's ZIP code into lat/lng.
- [x] Compute **all ZIP codes within the requested radius** in memory.
- [x] Query Supabase with a simple `WHERE zip IN (…)` clause.
- [x] Return the paginated investigators list (no keyword / indications filter for now, but the API contract already supports an `indications` param so we can add it later without breaking the client).
- [x] Build out the **Physician Card** UI to show facility, city/state/ZIP, and primary affiliation (implemented in `components/result-card.tsx`).
- [x] Expose the live `/api/investigators` endpoint to the React front‑end via `lib/api.ts` and TanStack Query.
- [x] Add **date‑range filtering** (Start Year → End Year) parameters that limit `start_date` in the backend query and surface a simple **year range picker** in the search panel (details below).

---

## 1. High‑Level Architecture

1. **Database (Supabase Postgres)**
   • Table `investigators` already exists, managed by Drizzle migrations.
   • (Optional) Enable `postgis` or `earthdistance` + `cube` extensions for efficient distance queries.
2. **Backend Layer (Next.js App Router)**
   • **Route Handlers** (`/app/api/investigators/route.ts`) will run on the server, use Drizzle to query Supabase and act as a thin REST endpoint for the React front‑end.
   • Alternatively, use **Server Actions** if staying inside App Router only.
3. **Frontend Layer (React / TanStack Query)**
   • Keep existing search form & card components.
   • `fetchResults` implementation will hit the new route handler instead of returning mock data.

```
[Browser]
   ↕ fetch `/api/investigators?zip=77030&radius=15&indications=asthma, copd&page=2`
[Next.js Route Handler]
   ↔ Drizzle (Supabase) → `investigators`
   ↔ (Optional) external geocoding API for zip→lat/lng
```

---

## 2. Detailed Steps

### 2.1. Environment & Dependencies

1. **Supabase credentials**
   * `.env.local`
     ```env
     DATABASE_URL=postgresql://...supabase....
     SUPABASE_ANON_KEY=...
     SUPABASE_URL=https://YOUR_PROJECT.supabase.co
     ```
2. Add libraries if missing:
   ```bash
   pnpm add @supabase/supabase-js drizzle-orm drizzle-kit @tanstack/react-query
   pnpm add -D @types/geojson  # if postgis types are needed
   ```

### 2.2. Database Enhancements  
_No changes required for MVP—this section is intentionally left blank.  We keep it here in case we revisit DB‑level geo queries later._

---

### 2.3. Backend (Next.js Route Handler)

#### 2.3.1. ZIP + Radius (existing – completed)

Implementation lives in `app/api/investigators/route.ts`.

#### 2.3.2. Date Range Filter (NEW)

* **Query params**: `startYear` and `endYear` (both optional, 4‑digit).  Example:

```
+/api/investigators?zip=10016&radius=25&startYear=2018&endYear=2024&page=1
```

* **Validation**
  * Must be 4 digits; if only one is provided we treat the missing bound as open‑ended.
  * Swap the values if `startYear > endYear`.

* **SQL filter**
  ```ts
  const startDateGte = startYear ? `${startYear}-01-01` : undefined
  const startDateLte = endYear   ? `${endYear}-12-31` : undefined

  query.where(and(
    inArray(investigators.zip, zipList),
    startDateGte ? gte(investigators.startDate, startDateGte) : undefined,
    startDateLte ? lte(investigators.startDate, startDateLte) : undefined,
  ))
  ```

* **Performance** – keep the simple date filter on the same index used for `order by start_date desc`.

* **Edge cases** – if both years are missing we skip the date filter entirely (back‑compat).

### 2.4. Frontend Changes

#### 2.4.1. Existing (completed)
* Replaced mock API calls.
* Added richer Investigator card.

#### 2.4.2. Year Range Picker (NEW)

1. **UI** – below the Radius slider, add two small inputs (`Input` component) labelled "Start Year" and "End Year".  Accept 4‑digit numbers (e.g., 2015).  Leave blank for "any".
2. **State** – in `pi-finder/app/pi-finder/page.tsx` add `startYear` and `endYear` pieces of state.
3. **Search params** – extend the `searchParams` object passed to React Query to include these years.
4. **API call** – update `fetchResults()` signature to accept the two optional years and append them to the query string if provided.
5. **Validation** – disable the **Search** button if either field is non‑blank and not 4 digits or if `startYear > endYear`.
6. **Accessibility** – announce errors similarly to the ZIP‑code alert.

The picker is deliberately simple (no date‑picker libraries) since trials only expose `start_date` by year granularity at this stage.

### 2.5. Caching & Performance

1. **TanStack Query**
   * Configure `staleTime` (e.g., 5 min) for fetched result sets.
2. **Route Handler**
   * Set `cache-control: s-maxage=60` or use `revalidateTag()` if using Next.js 14 caching.

### 2.6. Security & RLS

1. **Row Level Security (RLS)**
   * If data is public, enable `SELECT *` for anon role.
   * Otherwise, secure route handler with Supabase service key or NextAuth.
2. Never expose Supabase service key to browser; all server calls happen in route handler.

### 2.8. Deployment

1. Ensure Vercel env vars are set (`DATABASE_URL`, `SUPABASE_ANON_KEY`, etc.).
2. Use `vercel postgresql` integration for secrets if desired.
3. Verify that Postgres IP allowlists include Vercel.

---

## 3. Future Improvements

1. **Full‑text search** on indications & trial titles using PostgreSQL `tsvector`.
2. **Infinite scrolling** instead of paginated pages.
3. **Map view** using Mapbox GL showing investigator locations.
4. **Analytics**: Track search metrics with PostHog.
5. **Auth**: Allow user sign‑in and saving favorite investigators.

---

_This document outlines the steps required to integrate live Supabase data into the PI‑Finder UI. It aims to replace the current mock implementation with production‑ready functionality while maintaining accessibility, performance, and security standards._

## Implementation Log

> _This section is a running log of integration work performed. Add new entries at the top._

### ✅ Day‑1 – Initial Hook‑up (YYYY‑MM‑DD)

1. Installed runtime & type dependencies:
   ```bash
   pnpm add zipcodes
   pnpm add -D @types/zipcodes
   ```
2. Created `app/api/investigators/route.ts` implementing the ZIP‑radius search using Drizzle ORM and the investigators table.  Returns `{ physicians, totalCount }`.
3. Refactored `lib/api.ts` to call the new route handler instead of returning mock data.
4. Extended `Physician` and `ApiResponse` types in `lib/constants.ts` to mirror DB schema.
5. Tweaked `components/result-card.tsx` for safe fallbacks (distance & trialTitle).
6. Updated linter errors and ensured build compiles.

_Progress: End‑to‑end search now hits Supabase and renders real data in the UI._ 

### ✅ Day‑2 – Date Range Filter & UI Polish (2024‑06‑10)

1. Planned and implemented `startYear`/`endYear` filtering on both backend and frontend.
2. Added year range inputs to the search panel with validation & a11y messaging.
3. Extended `lib/api.ts` and TanStack Query keys to include the new params.
4. Updated Drizzle query with `gte` / `lte` constraints on `start_date`.
5. Updated test data and verified that filtering works as expected. 