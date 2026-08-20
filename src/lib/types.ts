/**
 * Row shapes as returned by the Supabase client (snake_case, matching the
 * actual Postgres columns) — distinct from src/db/schema.ts, whose camelCase
 * fields exist only for drizzle-kit migration generation and are never sent
 * over the wire. Once a live Supabase project exists, prefer generating
 * these from the database with `supabase gen types typescript` instead of
 * hand-maintaining them.
 */

export type ProfileRole = "staff" | "area_manager" | "admin";
export type ContractStatus = "pending" | "contracted" | "declined";
export type PatientGender = "male" | "female" | "other";

export interface Area {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Store {
  id: string;
  area_id: string;
  code: string;
  name: string;
  opened_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Channel {
  id: string;
  name: string;
  category: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  role: ProfileRole;
  store_id: string | null;
  area_id: string | null;
  display_name: string;
  created_at: string;
  updated_at: string;
}

export interface Patient {
  id: string;
  store_id: string;
  channel_id: string;
  patient_name: string;
  gender: PatientGender;
  visit_date: string;
  second_visit_date: string | null;
  contract_status: ContractStatus;
  contracted_date: string | null;
  assignee_name: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChannelSpend {
  id: string;
  store_id: string;
  channel_id: string;
  period: string;
  amount: number;
  created_at: string;
  updated_at: string;
}

/** Row shape shared by the channel_performance_by_* views (some columns absent depending on grain). */
export interface ChannelPerformanceRow {
  store_id?: string;
  area_id?: string | null;
  channel_id: string;
  channel_name: string;
  month: string;
  patient_count: number;
  second_visit_count: number;
  contracted_count: number;
  spend_amount: number;
}

/** Row shape from patient_performance_by_staff — per-staff (assignee_name) totals within one store. */
export interface StaffPerformanceRow {
  store_id: string;
  staff_name: string;
  month: string;
  patient_count: number;
  second_visit_count: number;
  contracted_count: number;
}

/** Row shape from patient_performance_by_staff_channel. */
export interface StaffChannelPerformanceRow {
  store_id: string;
  staff_name: string;
  channel_id: string;
  channel_name: string;
  month: string;
  patient_count: number;
  second_visit_count: number;
  contracted_count: number;
}

/** Row shape from patient_performance_by_staff_gender. */
export interface StaffGenderPerformanceRow {
  store_id: string;
  staff_name: string;
  gender: PatientGender;
  month: string;
  patient_count: number;
  second_visit_count: number;
  contracted_count: number;
}

/** Row shape from patient_performance_by_gender (store-level). */
export interface GenderPerformanceRow {
  store_id: string;
  gender: PatientGender;
  month: string;
  patient_count: number;
  second_visit_count: number;
  contracted_count: number;
}

/** Row shape shared by patient_performance_by_staff_area / _company. */
export interface StaffRollupRow {
  area_id?: string;
  staff_name: string;
  month: string;
  patient_count: number;
  second_visit_count: number;
  contracted_count: number;
}

/** Row shape shared by patient_performance_by_gender_area / _company. */
export interface GenderRollupRow {
  area_id?: string;
  gender: PatientGender;
  month: string;
  patient_count: number;
  second_visit_count: number;
  contracted_count: number;
}
