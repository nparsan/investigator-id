import fs from "fs"
import path from "path"
import csv from "csv-parser"
import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"

// Load environment variables (.env.local preferred)
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH ?? path.resolve(__dirname, "../../.env.local") })

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
  },
})

// Path to CSV (two levels up from this script: ../../raw_investigator_dump.csv)
const csvPath = path.resolve(__dirname, "../../raw_investigator_dump.csv")

if (!fs.existsSync(csvPath)) {
  console.error(`CSV file not found at ${csvPath}`)
  process.exit(1)
}

interface CsvRow {
  name: string
  role: string
  facility: string
  city: string
  state: string
  zip: string
  affiliation: string
  nct_id: string
  start_date: string
}

// Converts empty strings to null and trims whitespace
function cleanse<T extends Record<string, any>>(row: T): T {
  const cleaned: Record<string, any> = {}
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "string") {
      const trimmed = value.trim()
      cleaned[key] = trimmed === "" ? null : trimmed
    } else {
      cleaned[key] = value
    }
  }
  return cleaned as T
}

async function main() {
  const rows: CsvRow[] = []

  console.log(`Reading CSV from ${csvPath}...`)
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on("data", (data) => {
        rows.push(cleanse(data))
      })
      .on("end", () => resolve())
      .on("error", reject)
  })

  console.log(`Parsed ${rows.length} records. Uploading to Supabase...`)

  const chunkSize = 500 // Supabase insert limit per call
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)

    const { error } = await supabase.from("investigators").insert(chunk)
    if (error) {
      console.error(`Failed inserting chunk starting at index ${i}:`, error)
      process.exit(1)
    }

    console.log(`Inserted records ${i + 1}-${Math.min(i + chunkSize, rows.length)}`)
  }

  console.log("Import completed successfully ✨")
  process.exit(0)
}

main().catch((err) => {
  console.error("Unexpected error during import:", err)
  process.exit(1)
}) 