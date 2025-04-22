# Vector / Semantic Search Integration Plan – PI‑Finder

> **Default Recommendation:** Use stateless, on-demand vector search (Option B) to semantically re-rank investigators after geo filtering, without persisting trial data or embeddings. This is ideal for early-stage, low-traffic, or rapidly changing datasets. Migrate to Option A (pgvector) only if scale or latency demands.

---

## 0. TL;DR (1‑Minute Read)

1. **Geo filter first** (zip/radius) to get a candidate list of investigators and their `nct_id`s.
2. **Fetch trial metadata on-the-fly** from ClinicalTrials.gov for those NCT IDs (≤100 per request).
3. **Generate OpenAI embeddings in memory** for each trial and the user query.
4. **Cosine similarity re-rank**: Sort investigators by the similarity of their trial(s) to the query.
5. **No Supabase storage or migrations required.**
6. **New API route** `/api/semantic-investigators` implements this flow; front-end calls this instead of `/api/investigators` for semantic search.

---

## 1. Stateless / On‑Demand Vector Search (Option B, Default)

### 1.1. Flow per Search Request

1. **Geo filter first** (existing route `/api/investigators` logic):
   * Input: `zip`, `radius`, `pageSize` (e.g. 100‑200 max rows).
   * Output: list of investigators + their `nct_id`s.
2. **Fetch trial metadata on‑the‑fly** (as in *Trial Filter Plan*):
   * Batch ClinicalTrials.gov v2 call with *unique* `nct_id`s ≤ 100 per request.
   * Extract `brief_title`, `brief_summary`, `conditions`, `interventions`.
3. **Generate embeddings in memory**
   * Build `content` string for every trial.
   * Call **OpenAI Embeddings** (`text‑embedding‑3‑small`) with up to 96 inputs / request.
   * Keep a low‑TTL `Map<string, number[]>` cache (or `lru-cache`) to avoid duplicate calls within the same Vercel lambda instance.
4. **Embed the user query** (single call).
5. **Cosine similarity + re‑rank**
   * Compute dot‑product between query embedding and each trial embedding (≈1 K ops – trivial).
   * Attach `similarity` to investigator (same value for investigators sharing NCT).
   * Sort descending; then apply pagination & return JSON.

### 1.2. Implementation Sketch – New route `/api/semantic-investigators`

```ts
import { getInvestigators } from "./investigatorsService"      // wraps existing geo query
import { fetchTrialsMeta } from "@/lib/trialsProxy"              // trial‑filter plan helper
import OpenAI from "openai"
import cosineSim from "cosine-similarity"                       // small util

export async function GET(req: NextRequest) {
  const qs = new URL(req.url).searchParams
  const zip = qs.get("zip") ?? "77030"
  const radius = Number(qs.get("radius") ?? 15)
  const query = qs.get("q") ?? ""
  if (!query) return NextResponse.json({ error: "Missing q" }, { status: 400 })

  // 1. geo filter
  const investigators = await getInvestigators({ zip, radius, limit: 200 })

  // 2. trials meta
  const trialMap = await fetchTrialsMeta([...new Set(investigators.map(i => i.nctId))])

  // 3. embeddings
  const openai = new OpenAI()
  const queryEmb = (await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  })).data[0].embedding

  const inputs = Object.values(trialMap).map(t => `${t.title}\n${t.summary}`)
  const resp = await openai.embeddings.create({ model: "text-embedding-3-small", input: inputs })

  const idToSim: Record<string, number> = {}
  resp.data.forEach((row, idx) => {
    const nct = Object.keys(trialMap)[idx]
    idToSim[nct] = cosineSim(queryEmb, row.embedding)
  })

  // 4. re‑rank investigators
  investigators.sort((a, b) => (idToSim[b.nctId!] ?? 0) - (idToSim[a.nctId!] ?? 0))
  return NextResponse.json({ physicians: investigators })
}
```

### 1.3. Advantages / Trade‑offs

| Aspect | Option B (Stateless, Default) | Option A (pgvector) |
|--------|------------------------------|---------------------|
| **Infra** | No DB migrations, works on Vercel only | Requires `pgvector`, migrations |
| **Latency** | `~300‑800 ms` (OpenAI) + `~500 ms` (CT API) | `~50 ms` (pure SQL once data present) |
| **Cost per Search** | OpenAI embeddings for *k* trials (≤ $0.002 if k≤50) | $0 after ingestion |
| **Freshness** | Always latest CT.gov data | Requires nightly sync |
| **Scaling** | Limited to ~200 trials/query due to embedding rate limits | Handles thousands instantly |

### 1.4. When to Prefer

Choose **Option B** if:
* The product is early‑stage / low traffic.
* You want instant access to newly added trials without a sync job.
* You're OK trading ~1 s latency & small per‑query cost.

Migrate to **Option A (pgvector)** once search traffic or dataset grows.

---

## 2. Advanced/Scaling Path: pgvector in Supabase (Option A)

> For high-traffic, low-latency, or large-scale use cases, pre-ingest all trial data and embeddings into Supabase with pgvector. This requires more infra and maintenance but enables instant, large-scale semantic search.

### 2.1. Database Schema Changes (Supabase / Drizzle)

```ts
// db/schema.ts
export const trials = pgTable("trials", {
  id: serial("id").primaryKey(),
  nctId: text("nct_id").notNull().unique(),
  title: text("title"),      // brief_title
  summary: text("summary"),  // brief_summary
  conditions: text("conditions"),
  interventions: text("interventions"),
  // 1 536‑dim vector for OpenAI "text‑embedding‑3‑small"
  embedding: vector("embedding", { dimensions: 1536 }),
  insertedAt: timestamp("inserted_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
  // Approximate K‑NN index (HNSW) – works after pgvector ≥ 0.5.0
  embeddingIdx: index("trials_embedding_idx").using("hnsw").on(t.embedding),
}))
```

*RLS*: same as `investigators` – if data is public you can allow read‑only `anon`.

### 2.2. Supabase Extension

```sql
-- SQL editor > new migration
create extension if not exists vector;
```

Verify version ≥ `0.5.0` to use HNSW indexes.  (Supabase offers this by default.)

### 2.3. Data Ingestion & Embedding Pipeline

We need **two scripts** in `pi-finder/scripts/` (run locally or in a GitHub Action):

1. `syncNctTrials.ts`
   * Fetch **unique** `nct_id`s from `investigators` (via Supabase REST or Drizzle).
   * For each unknown id, call **ClinicalTrials.gov API**:  
     `https://clinicaltrials.gov/api/v2/studies?filter.nct_id=${nctId}`.
   * Parse fields (`brief_title`, `brief_summary`, `conditions`, `interventions`).
   * Upsert into `trials` (without embedding yet).

2. `embedTrials.ts`
   * Select from `trials` where `embedding IS NULL`.
   * Build `content` string = *title + summary + conditions + interventions*.
   * Call **OpenAI Embeddings** (`POST https://api.openai.com/v1/embeddings`).
   * Convert response array (length 1536) → Postgres `vector` (`[f1,f2,…]`).
   * Batch‑update rows (≤ 500 at once).

Both scripts mirror the existing pattern in `importInvestigators.ts` – use `createClient` with **service‑role key** so we bypass RLS.

### 2.4. Search Algorithm (SQL)

```sql
WITH top_trials AS (
  SELECT nct_id, embedding <-> $1 AS distance
  FROM trials
  ORDER BY embedding <-> $1
  LIMIT 20   -- tune k
)
SELECT i.*, t.distance
FROM investigators i
JOIN top_trials t USING (nct_id)
ORDER BY t.distance, i.start_date DESC;
```

*Notes*
- `$1` = `vector` parameter holding query embedding.
- Add optional `WHERE i.zip IN (…)` to keep geo filtering logic already implemented.

### 2.5. Backend Implementation (Next.js Route)

`app/api/search/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server"
import { db, investigators, trials } from "@/db/client"
import { sql } from "drizzle-orm"
import OpenAI from "openai"  // edge‑safe wrapper
import { DEFAULT_RADIUS, ITEMS_PER_PAGE } from "@/lib/constants"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const query = searchParams.get("q") ?? ""
  const zip = searchParams.get("zip") ?? "77030"
  const radius = Number(searchParams.get("radius") ?? DEFAULT_RADIUS)
  const page = Math.max(Number(searchParams.get("page") ?? "1"), 1)

  if (!query) return NextResponse.json({ error: "Missing q" }, { status: 400 })

  // 1) Embed the query
  const openai = new OpenAI()
  const {
    data: [{ embedding: queryEmbedding }],
  } = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  })

  // 2) SQL KNN + join (geo filter identical to current implementation)
  const result = await db.execute(sql`
    WITH top_trials AS (
      SELECT nct_id, embedding <-> ${queryEmbedding} AS distance
      FROM trials
      ORDER BY embedding <-> ${queryEmbedding}
      LIMIT 50
    )
    SELECT i.*, t.distance
    FROM ${investigators} i
    JOIN top_trials t ON i.nct_id = t.nct_id
  `)

  // paginated + post‑processed exactly like today …

  return NextResponse.json({ physicians /*, totalCount */ })
}
```

The geo‑radius logic from `/api/investigators` can be reused by adding a `WHERE i.zip IN (…)` clause before the join.

### 2.6. When to Prefer

Choose **Option A** if:
* You need to support thousands of trials per search, or sub-100ms latency.
* You want to avoid per-query OpenAI costs.
* You are ready to maintain a nightly sync pipeline and migrations.

---

## 3. Tasks Checklist

| # | Task | Owner |
|---|------|-------|
| B1 | Implement `lib/trialsProxy.ts` (CT.gov fetch & cache) | `@backend` |
| B2 | Build `/api/semantic-investigators` route (stateless re‑rank) | `@backend` |
| B3 | Add LRU in‑memory cache for embeddings during lambda life | `@backend` |
| B4 | FE: call new route instead of `/api/investigators` | `@frontend` |
| A1 | Enable `pgvector` extension | `@devops` |
| A2 | Add `trials` table & HNSW index (Drizzle migration) | `@backend` |
| A3 | Implement `scripts/syncNctTrials.ts` | `@backend` |
| A4 | Implement `scripts/embedTrials.ts` | `@backend` |
| A5 | Run both scripts locally & verify rows/embeddings | `@backend` |
| A6 | Build `/api/search` route (vector + geo join) | `@backend` |
| A7 | Front‑end hook‑up (`lib/api.ts` new function) | `@frontend` |
| A8 | Docs update & deploy to Vercel | `@frontend` |

---

*Prepared by ChatGPT on YYYY‑MM‑DD* 