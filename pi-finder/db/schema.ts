import { pgTable, serial, text, date, timestamp, index } from "drizzle-orm/pg-core"

export const investigators = pgTable("investigators", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role"),
  facility: text("facility"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  affiliation: text("affiliation"),
  nctId: text("nct_id"),
  startDate: date("start_date"),
  insertedAt: timestamp("inserted_at", { withTimezone: true }).defaultNow(),
}, (table) => {
  return {
    nctIdIdx: index("investigators_nct_id_idx").on(table.nctId),
  }
}) 