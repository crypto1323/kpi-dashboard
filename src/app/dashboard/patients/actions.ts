"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/dal";
import type { ContractStatus, PatientGender } from "@/lib/types";

const CONTRACT_STATUSES: ContractStatus[] = ["pending", "contracted", "declined"];
const GENDERS: PatientGender[] = ["male", "female", "other"];

export async function createPatient(formData: FormData) {
  const profile = await getCurrentProfile();
  if (profile.role === "area_manager") {
    redirect("/dashboard/patients");
  }

  const storeId =
    profile.role === "admin"
      ? String(formData.get("storeId") ?? "")
      : profile.store_id;
  const channelId = String(formData.get("channelId") ?? "");
  const patientName = String(formData.get("patientName") ?? "").trim();
  const assigneeName = String(formData.get("assigneeName") ?? "").trim();
  const genderRaw = String(formData.get("gender") ?? "");
  const gender = GENDERS.includes(genderRaw as PatientGender)
    ? (genderRaw as PatientGender)
    : null;
  const visitDate = String(formData.get("visitDate") ?? "");
  const month = String(formData.get("month") ?? "");
  const monthQuery = month ? `&month=${month}` : "";

  if (!storeId || !channelId || !patientName || !assigneeName || !gender || !visitDate) {
    redirect(
      `/dashboard/patients?error=${encodeURIComponent("患者名・担当者・性別・流入媒体・初診日を入力してください。")}&storeId=${storeId ?? ""}${monthQuery}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("patients").insert({
    store_id: storeId,
    channel_id: channelId,
    patient_name: patientName,
    assignee_name: assigneeName,
    gender,
    visit_date: visitDate,
    created_by: profile.id,
  });

  if (error) {
    redirect(
      `/dashboard/patients?error=${encodeURIComponent(error.message)}&storeId=${storeId}${monthQuery}`,
    );
  }

  revalidatePath("/dashboard/patients");
  redirect(`/dashboard/patients?storeId=${storeId}${monthQuery}`);
}

/** One-tap toggle from the list — no form to expand, saves immediately. */
export async function toggleSecondVisit(id: string, formData: FormData) {
  await getCurrentProfile();

  const storeId = String(formData.get("storeId") ?? "");
  const month = String(formData.get("month") ?? "");
  const monthQuery = month ? `&month=${month}` : "";
  const nextValue = String(formData.get("nextValue") ?? "");

  const supabase = await createClient();
  const { error } = await supabase
    .from("patients")
    .update({ second_visit_date: nextValue || null })
    .eq("id", id);

  if (error) {
    redirect(
      `/dashboard/patients?error=${encodeURIComponent(error.message)}&storeId=${storeId}${monthQuery}`,
    );
  }

  revalidatePath("/dashboard/patients");
  redirect(`/dashboard/patients?storeId=${storeId}${monthQuery}`);
}

/** One-tap toggle from the list — collapses to 成約/未成約 (pending<->contracted).
 * The 不成約(declined) state still exists in the data model but isn't reachable
 * from this quick toggle; it was only ever set through the form this replaces. */
export async function toggleContractStatus(id: string, formData: FormData) {
  await getCurrentProfile();

  const storeId = String(formData.get("storeId") ?? "");
  const month = String(formData.get("month") ?? "");
  const monthQuery = month ? `&month=${month}` : "";
  const nextStatusRaw = String(formData.get("nextStatus") ?? "pending");
  const nextStatus = CONTRACT_STATUSES.includes(nextStatusRaw as ContractStatus)
    ? (nextStatusRaw as ContractStatus)
    : "pending";

  const supabase = await createClient();

  const { data: current } = await supabase
    .from("patients")
    .select("contracted_date")
    .eq("id", id)
    .single();

  const contractedDate =
    nextStatus === "contracted"
      ? current?.contracted_date || new Date().toISOString().slice(0, 10)
      : null;

  const { error } = await supabase
    .from("patients")
    .update({ contract_status: nextStatus, contracted_date: contractedDate })
    .eq("id", id);

  if (error) {
    redirect(
      `/dashboard/patients?error=${encodeURIComponent(error.message)}&storeId=${storeId}${monthQuery}`,
    );
  }

  revalidatePath("/dashboard/patients");
  redirect(`/dashboard/patients?storeId=${storeId}${monthQuery}`);
}

export async function deletePatient(id: string, formData: FormData) {
  await getCurrentProfile();
  const storeId = String(formData.get("storeId") ?? "");
  const month = String(formData.get("month") ?? "");
  const monthQuery = month ? `&month=${month}` : "";

  const supabase = await createClient();
  const { error } = await supabase.from("patients").delete().eq("id", id);

  if (error) {
    redirect(
      `/dashboard/patients?error=${encodeURIComponent(error.message)}&storeId=${storeId}${monthQuery}`,
    );
  }

  revalidatePath("/dashboard/patients");
  redirect(`/dashboard/patients?storeId=${storeId}${monthQuery}`);
}
