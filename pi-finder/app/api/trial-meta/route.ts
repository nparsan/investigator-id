import { NextRequest, NextResponse } from "next/server"

// Max number of NCT IDs to include in a single ClinicalTrials.gov request.
// The v2 REST API safely accepts ~100 IDs or ~8 KB URL length.
const MAX_BATCH = 100

// ---------------- CT.gov v2 constants ---------------- //
// Base path (no query params) – we add everything via URLSearchParams.
const CT_BASE_URL = "https://clinicaltrials.gov/api/v2/studies"

// Only request the JSON paths our UI needs to build filters → keeps payloads tiny.
const KEEP_FIELDS = [
  "protocolSection.identificationModule.nctId",
  "protocolSection.designModule.phases",
  "protocolSection.sponsorCollaboratorsModule.leadSponsor.class",
  "protocolSection.statusModule.overallStatus",
].join(",")

type CtStudy = {
  protocolSection: {
    identificationModule: {
      nctId: string
    }
    designModule?: {
      phases?: string[]
    }
    sponsorCollaboratorsModule?: {
      leadSponsor?: {
        class?: string
      }
    }
    statusModule?: {
      overallStatus?: string
    }
  }
}

// Helper that performs batched fetches to CT.gov and trims the response
async function fetchTrialMeta(ids: string[]) {
  const out: CtStudy[] = []

  // ----- Batch by ID count (≤ MAX_BATCH) -----
  for (let i = 0; i < ids.length; i += MAX_BATCH) {
    const batch = ids.slice(i, i + MAX_BATCH)

    // Some defensive paging logic – usually a single page when pageSize === batch.length.
    let pageToken: string | undefined = undefined
    do {
      const params = new URLSearchParams({
        "filter.ids": batch.join(","),
        fields: KEEP_FIELDS,
        format: "json",
        pageSize: String(batch.length),
      })
      if (pageToken) params.set("pageToken", pageToken)

      const url = `${CT_BASE_URL}?${params.toString()}`

      const res = await fetch(url, {
        headers: { accept: "application/json" },
        // Cache for 60 s at the edge to cut latency.
        next: { revalidate: 60 },
      })

      if (!res.ok) {
        throw new Error(`ClinicalTrials.gov request failed (${res.status})`)
      }

      const json = (await res.json()) as { studies: CtStudy[]; nextPageToken?: string }
      if (json?.studies?.length) out.push(...json.studies)

      pageToken = json.nextPageToken // undefined when no more pages
    } while (pageToken)
  }

  // Trim shape – keep only what UI needs.
  return out.map((s) => ({
    nctId: s.protocolSection.identificationModule.nctId,
    // Normalize phase string (e.g., "Phase 1", "Phase 2/Phase 3") → "1" | "2" | "3" | "4" | "NA"
    phase: (() => {
      const raw = s.protocolSection.designModule?.phases?.[0] ?? "NA"
      const m = raw.match(/[1-4]/)
      return m ? m[0] : "NA"
    })(),
    fundedBy: s.protocolSection.sponsorCollaboratorsModule?.leadSponsor?.class ?? null,
    overallStatus: s.protocolSection.statusModule?.overallStatus ?? null,
  }))
}

// ------------------------------- GET ------------------------------- //
export async function GET(req: NextRequest) {
  try {
    const idsParam = req.nextUrl.searchParams.get("ids") ?? ""
    const ids = idsParam
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0)

    if (!ids.length) {
      return NextResponse.json({ error: "Missing ids query parameter" }, { status: 400 })
    }

    const trimmed = await fetchTrialMeta(ids)
    return NextResponse.json(trimmed)
  } catch (err: any) {
    console.error("/api/trial-meta GET error", err)
    const status = err?.message?.includes("ClinicalTrials") ? 502 : 500
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status })
  }
}

// ------------------------------ POST ------------------------------ //
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { ids?: string[] }
    const ids = Array.isArray(body?.ids) ? body.ids.filter(Boolean) : []

    if (!ids.length) {
      return NextResponse.json({ error: "Request body must include 'ids' array" }, { status: 400 })
    }

    const trimmed = await fetchTrialMeta(ids)
    return NextResponse.json(trimmed)
  } catch (err: any) {
    console.error("/api/trial-meta POST error", err)
    const status = err?.message?.includes("ClinicalTrials") ? 502 : 500
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status })
  }
} 