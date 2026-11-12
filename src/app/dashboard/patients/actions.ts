"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/dal";
import { ensureBackingSession } from "@/lib/backing-session";
import { storeUnlockCookieName, storeUnlockToken } from "@/lib/store-lock";
import type { ContractStatus, PatientGender } from "@/lib/types";

const CONTRACT_STATUSES: ContractStatus[] = ["pending", "contracted", "declined"];
const GENDERS: PatientGender[] = ["male", "female", "other"];

function monthQueryFrom(formData: FormData) {
  const month = String(formData.get("month") ?? "");
  return month ? `&month=${month}` : "";
}

/** Checks the entered password against this store's access_password and, on
 * a match, sets a session cookie so reloads don't re-prompt. Works with no
 * prior login — establishes the app's backing session itself if needed. */
export async function unlockStore(formData: FormData) {
  const storeId = String(formData.get("storeId") ?? "");
  const password = String(formData.get("password") ?? "");
  const monthQuery = monthQueryFrom(formData);
  const redirectBase = `/dashboard/patients?storeId=${storeId}${monthQuery}`;

  const supabase = await ensureBackingSession();
  const { data: store } = await supabase
    .from("stores")
    .select("access_password")
    .eq("id", storeId)
    .single();

  if (!store?.access_password || password !== store.access_password) {
    redirect(`${redirectBase}&lockError=${encodeURIComponent("パスワードが正しくありません。")}`);
  }

  const cookieStore = await cookies();
  cookieStore.set(storeUnlockCookieName(storeId), storeUnlockToken(storeId, password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  redirect(redirectBase);
}

/** Shared tail for every inline-edit action: save one column, then bounce back
 * to the same store/month the row was being viewed from. */
async function saveField(
  id: string,
  storeId: string,
  monthQuery: string,
  patch: Record<string, unknown>,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("patients").update(patch).eq("id", id);

  if (error) {
    redirect(
      `/dashboard/patients?error=${encodeURIComponent(error.message)}&storeId=${storeId}${monthQuery}`,
    );
  }

  revalidatePath("/dashboard/patients");
  redirect(`/dashboard/patients?storeId=${storeId}${monthQuery}`);
}

export async function createPatient(formData: FormData) {
  const profile = await getCurrentProfile();

  const storeId = String(formData.get("storeId") ?? "");
  const channelId = String(formData.get("channelId") ?? "");
  const patientName = String(formData.get("patientName") ?? "").trim();
  const assigneeName = String(formData.get("assigneeName") ?? "").trim();
  // 任意。空のままなら集計上は担当者が成約者として扱われる。
  const closerName = String(formData.get("closerName") ?? "").trim();
  const genderRaw = String(formData.get("gender") ?? "");
  const gender = GENDERS.includes(genderRaw as PatientGender)
    ? (genderRaw as PatientGender)
    : null;
  const visitDate = String(formData.get("visitDate") ?? "");
  const monthQuery = monthQueryFrom(formData);

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
    closer_name: closerName,
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
  const monthQuery = monthQueryFrom(formData);
  const nextValue = String(formData.get("nextValue") ?? "");

  await saveField(id, storeId, monthQuery, { second_visit_date: nextValue || null });
}

/** One-tap toggle from the list — collapses to 成約/未成約 (pending<->contracted).
 * The 不成約(declined) state still exists in the data model but isn't reachable
 * from this quick toggle; it was only ever set through the form this replaces. */
export async function toggleContractStatus(id: string, formData: FormData) {
  await getCurrentProfile();
  const storeId = String(formData.get("storeId") ?? "");
  const monthQuery = monthQueryFrom(formData);
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

  await saveField(id, storeId, monthQuery, {
    contract_status: nextStatus,
    contracted_date: contractedDate,
  });
}

/** Inline-editable cell: 患者名. */
export async function updatePatientName(id: string, formData: FormData) {
  await getCurrentProfile();
  const storeId = String(formData.get("storeId") ?? "");
  const monthQuery = monthQueryFrom(formData);
  const patientName = String(formData.get("patientName") ?? "").trim();

  if (!patientName) {
    redirect(
      `/dashboard/patients?error=${encodeURIComponent("患者名を入力してください。")}&storeId=${storeId}${monthQuery}`,
    );
  }

  await saveField(id, storeId, monthQuery, { patient_name: patientName });
}

/** Inline-editable cell: 担当者. */
export async function updatePatientAssignee(id: string, formData: FormData) {
  await getCurrentProfile();
  const storeId = String(formData.get("storeId") ?? "");
  const monthQuery = monthQueryFrom(formData);
  const assigneeName = String(formData.get("assigneeName") ?? "").trim();

  if (!assigneeName) {
    redirect(
      `/dashboard/patients?error=${encodeURIComponent("担当者を入力してください。")}&storeId=${storeId}${monthQuery}`,
    );
  }

  await saveField(id, storeId, monthQuery, { assignee_name: assigneeName });
}

/** Inline-editable cell: 成約者. Blank is allowed — it means 担当者と同じ. */
export async function updatePatientCloser(id: string, formData: FormData) {
  await getCurrentProfile();
  const storeId = String(formData.get("storeId") ?? "");
  const monthQuery = monthQueryFrom(formData);
  const closerName = String(formData.get("closerName") ?? "").trim();

  await saveField(id, storeId, monthQuery, { closer_name: closerName });
}

/** Inline-editable cell: 性別. */
export async function updatePatientGender(id: string, formData: FormData) {
  await getCurrentProfile();
  const storeId = String(formData.get("storeId") ?? "");
  const monthQuery = monthQueryFrom(formData);
  const genderRaw = String(formData.get("gender") ?? "");

  if (!GENDERS.includes(genderRaw as PatientGender)) {
    redirect(
      `/dashboard/patients?error=${encodeURIComponent("性別を選択してください。")}&storeId=${storeId}${monthQuery}`,
    );
  }

  await saveField(id, storeId, monthQuery, { gender: genderRaw });
}

/** Inline-editable cell: 流入媒体. */
export async function updatePatientChannel(id: string, formData: FormData) {
  await getCurrentProfile();
  const storeId = String(formData.get("storeId") ?? "");
  const monthQuery = monthQueryFrom(formData);
  const channelId = String(formData.get("channelId") ?? "");

  if (!channelId) {
    redirect(
      `/dashboard/patients?error=${encodeURIComponent("流入媒体を選択してください。")}&storeId=${storeId}${monthQuery}`,
    );
  }

  await saveField(id, storeId, monthQuery, { channel_id: channelId });
}

/** Inline-editable cell: 初診日. Editing it to a different month moves the row
 * out of the currently viewed month once saved — that's expected, not a bug. */
export async function updatePatientVisitDate(id: string, formData: FormData) {
  await getCurrentProfile();
  const storeId = String(formData.get("storeId") ?? "");
  const monthQuery = monthQueryFrom(formData);
  const visitDate = String(formData.get("visitDate") ?? "");

  if (!visitDate) {
    redirect(
      `/dashboard/patients?error=${encodeURIComponent("初診日を入力してください。")}&storeId=${storeId}${monthQuery}`,
    );
  }

  await saveField(id, storeId, monthQuery, { visit_date: visitDate });
}

export async function deletePatient(id: string, formData: FormData) {
  await getCurrentProfile();
  const storeId = String(formData.get("storeId") ?? "");
  const monthQuery = monthQueryFrom(formData);

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
