import { NextRequest, NextResponse } from "next/server"
import { inArray, sql, and, gte, lte } from "drizzle-orm"
import zipcodes from "zipcodes" // eslint-disable-line @typescript-eslint/ban-ts-comment

import { db, investigators } from "@/db/client"
import { ITEMS_PER_PAGE, type Physician } from "@/lib/constants"

/**
 * /api/investigators?zip=77030&radius=15&page=1&indications=asthma,COPD
 *
 * For the MVP we do a naive geo search:
 *   1. Lookup the center ZIP → lat/lng
 *   2. Get all ZIPs within `radius` miles (in memory via the `zipcodes` package).
 *   3. Query investigators WHERE zip IN (...)
 *   4. Return paginated list along with totalCount.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const zip = searchParams.get("zip") ?? ""
  const radiusMiles = Number(searchParams.get("radius") ?? "15")
  const page = Math.max(Number(searchParams.get("page") ?? "1"), 1)

  // Optional date range filters – 4‑digit years
  const startYear = searchParams.get("startYear")
  const endYear = searchParams.get("endYear")

  const isValidYear = (y: string | null) => !y || /^[0-9]{4}$/.test(y)
  if (!isValidYear(startYear) || !isValidYear(endYear)) {
    return NextResponse.json({ error: "startYear/endYear must be 4‑digit numbers" }, { status: 400 })
  }

  // Swap if needed
  let startYearNum = startYear ? Number(startYear) : undefined
  let endYearNum = endYear ? Number(endYear) : undefined
  if (startYearNum && endYearNum && startYearNum > endYearNum) {
    ;[startYearNum, endYearNum] = [endYearNum, startYearNum]
  }

  // For now `indications` param is accepted but ignored (future feature)

  // ----- Validation -----
  if (!/^[0-9]{5}$/.test(zip)) {
    return NextResponse.json({ error: "Invalid zip" }, { status: 400 })
  }

  const center = zipcodes.lookup(zip)
  if (!center) {
    return NextResponse.json({ error: "Unknown zip" }, { status: 404 })
  }

  const zipList: string[] = zipcodes.radius(zip, radiusMiles) as string[]

  const offset = (page - 1) * ITEMS_PER_PAGE

  // ----- Dynamic where conditions -----
  const whereClauses = [inArray(investigators.zip, zipList)]

  if (startYearNum) {
    whereClauses.push(gte(investigators.startDate, `${startYearNum}-01-01`))
  }
  if (endYearNum) {
    whereClauses.push(lte(investigators.startDate, `${endYearNum}-12-31`))
  }

  const whereExpr = whereClauses.length > 1 ? and(...whereClauses) : whereClauses[0]

  // ----- DB queries -----
  const rowsPromise = db
    .select()
    .from(investigators)
    .where(whereExpr)
    .orderBy(sql`start_date desc`)
    .limit(ITEMS_PER_PAGE)
    .offset(offset)

  const countPromise = db
    .select({ count: sql<number>`count(*)` })
    .from(investigators)
    .where(whereExpr)

  const [rows, [{ count }]] = await Promise.all([rowsPromise, countPromise])

  // ----- Post‑processing -----
  const physicians: Physician[] = rows.map((row) => {
    const distance = typeof row.zip === "string" && /^[0-9]{5}$/.test(row.zip)
      ? (zipcodes.distance(zip, row.zip) as number)
      : Infinity

    return {
      // Ensure correct type conversions for the UI
      id: row.id,
      name: row.name,
      role: row.role,
      facility: row.facility,
      city: row.city,
      state: row.state,
      zip: row.zip,
      affiliation: row.affiliation,
      nctId: row.nctId,
      distance,
      startDate: row.startDate ? String(row.startDate) : "",
      // `trialTitle` will come from a join in the future; fallback for now:
      trialTitle: row.nctId ?? null,
    }
  })

  return NextResponse.json({ physicians, totalCount: count })
} 