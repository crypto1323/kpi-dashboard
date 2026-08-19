"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/dal";
import type { ContractStatus } from "@/lib/types";

const CONTRACT_STATUSES: ContractStatus[] = ["pending", "contracted", "declined"];

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
  const visitDate = String(formData.get("visitDate") ?? "");

  if (!storeId || !channelId || !patientName || !visitDate) {
    redirect(
      `/dashboard/patients?error=${encodeURIComponent("患者名・流入媒体・初診日を入力してください。")}&storeId=${storeId ?? ""}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("patients").insert({
    store_id: storeId,
    channel_id: channelId,
    patient_name: patientName,
    visit_date: visitDate,
    created_by: profile.id,
  });

  if (error) {
    redirect(
      `/dashboard/patients?error=${encodeURIComponent(error.message)}&storeId=${storeId}`,
    );
  }

  revalidatePath("/dashboard/patients");
  redirect(`/dashboard/patients?storeId=${storeId}`);
}

export async function updatePatient(id: string, formData: FormData) {
  await getCurrentProfile();

  const storeId = String(formData.get("storeId") ?? "");
  const secondVisitDate = String(formData.get("secondVisitDate") ?? "").trim();
  const contractStatusRaw = String(formData.get("contractStatus") ?? "pending");
  const contractStatus = CONTRACT_STATUSES.includes(
    contractStatusRaw as ContractStatus,
  )
    ? (contractStatusRaw as ContractStatus)
    : "pending";

  const supabase = await createClient();

  const { data: current } = await supabase
    .from("patients")
    .select("contract_status, contracted_date")
    .eq("id", id)
    .single();

  const contractedDate =
    contractStatus !== "contracted"
      ? null
      : (current?.contract_status === "contracted" && current.contracted_date) ||
        new Date().toISOString().slice(0, 10);

  const { error } = await supabase
    .from("patients")
    .update({
      second_visit_date: secondVisitDate || null,
      contract_status: contractStatus,
      contracted_date: contractedDate,
    })
    .eq("id", id);

  if (error) {
    redirect(
      `/dashboard/patients?error=${encodeURIComponent(error.message)}&storeId=${storeId}`,
    );
  }

  revalidatePath("/dashboard/patients");
  redirect(`/dashboard/patients?storeId=${storeId}`);
}

export async function deletePatient(id: string, formData: FormData) {
  await getCurrentProfile();
  const storeId = String(formData.get("storeId") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.from("patients").delete().eq("id", id);

  if (error) {
    redirect(
      `/dashboard/patients?error=${encodeURIComponent(error.message)}&storeId=${storeId}`,
    );
  }

  revalidatePath("/dashboard/patients");
  redirect(`/dashboard/patients?storeId=${storeId}`);
}
