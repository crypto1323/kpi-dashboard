import { defineConfig } from "drizzle-kit";

// Used only for `drizzle-kit generate` to diff future schema.ts changes
// into new SQL migrations under supabase/migrations. The initial schema
// (supabase/migrations/0001_init.sql) was hand-written to control RLS
// policies precisely — run `drizzle-kit generate` for changes after that.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./supabase/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
