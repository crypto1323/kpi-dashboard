import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Source of truth for table shapes and types used across the app.
 * The executable migration lives in supabase/migrations/0001_init.sql —
 * keep the two in sync when either changes.
 */

export const profileRoleEnum = pgEnum("profile_role", [
  "staff",
  "area_manager",
  "admin",
]);

export const contractStatusEnum = pgEnum("contract_status", [
  "pending",
  "contracted",
  "declined",
]);

export const areas = pgTable("areas", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    areaId: uuid("area_id")
      .notNull()
      .references(() => areas.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    openedAt: date("opened_at"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    uniqueIndex("stores_code_key").on(table.code),
    index("stores_area_id_idx").on(table.areaId),
  ],
);

export const channels = pgTable("channels", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  category: text("category"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

/** Mirrors auth.users 1:1. Row is created by a trigger on signup. */
export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey(),
    role: profileRoleEnum("role").notNull().default("staff"),
    storeId: uuid("store_id").references(() => stores.id, {
      onDelete: "set null",
    }),
    areaId: uuid("area_id").references(() => areas.id, {
      onDelete: "set null",
    }),
    displayName: text("display_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index("profiles_store_id_idx").on(table.storeId),
    index("profiles_area_id_idx").on(table.areaId),
  ],
);

export const patients = pgTable(
  "patients",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "restrict" }),
    patientName: text("patient_name").notNull(),
    visitDate: date("visit_date").notNull(),
    secondVisitDate: date("second_visit_date"),
    contractStatus: contractStatusEnum("contract_status")
      .notNull()
      .default("pending"),
    contractedDate: date("contracted_date"),
    createdBy: uuid("created_by").references(() => profiles.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index("patients_store_id_idx").on(table.storeId),
    index("patients_channel_id_idx").on(table.channelId),
    index("patients_visit_date_idx").on(table.visitDate),
  ],
);

export const channelSpends = pgTable(
  "channel_spends",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "restrict" }),
    period: date("period").notNull(),
    amount: integer("amount").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    uniqueIndex("channel_spends_store_channel_period_key").on(
      table.storeId,
      table.channelId,
      table.period,
    ),
    index("channel_spends_store_id_idx").on(table.storeId),
    index("channel_spends_channel_id_idx").on(table.channelId),
  ],
);

export type Area = typeof areas.$inferSelect;
export type Store = typeof stores.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type Patient = typeof patients.$inferSelect;
export type NewPatient = typeof patients.$inferInsert;
