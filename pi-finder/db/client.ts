import "dotenv/config"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

// Create a single Postgres.js pool connected to Supabase database URL
// `ssl: 'require'` is mandatory for Supabase
export const queryClient = postgres(process.env.DATABASE_URL!, {
  ssl: "require",
  max: 10,
})

// Drizzle ORM instance bound to our schema
export const db = drizzle(queryClient, { schema })

// Re‑export schema helpers so consumers can `import { investigators } from '../db/client'`
export * from "./schema" 