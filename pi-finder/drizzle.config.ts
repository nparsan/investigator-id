import { config } from "dotenv"
import { defineConfig } from "drizzle-kit"

// Prefer .env.local (Next.js & Vercel convention). Fallback to .env if it doesn't exist.
config({ path: process.env.DOTENV_CONFIG_PATH ?? ".env.local" })

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
}) 