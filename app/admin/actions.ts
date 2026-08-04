"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";

import { requirePlatformAdmin } from "@/lib/auth/session";
import { sendOfficeNotification } from "@/lib/notifications/email";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function updateCaseStatus(fd: FormData) {
  await requirePlatformAdmin();
  const input = z.object({ caseId: z.string().uuid(), status: z.enum(["recebido", "producao", "qa", "entregue"]) }).parse({ caseId: fd.get("caseId"), status: fd.get("status") });
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("admin_atualizar_status_caso", { p_caso_id: input.caseId, p_status: input.status });
  if (error) throw new Error("Não foi possível atualizar o status.");
  revalidatePath("/admin"); revalidatePath("/admin/fila"); revalidatePath(`/admin/casos/${input.caseId}`);
}

export async function reviewDelivery(fd: FormData) {
  await requirePlatformAdmin();
  const input = z.object({ caseId: z.string().uuid(), deliveryId: z.string().uuid(), qaStatus: z.enum(["pendente", "aprovado", "ajustes"]), observations: z.string().max(5000), intent: z.enum(["save", "deliver"]) }).parse({ caseId: fd.get("caseId"), deliveryId: fd.get("deliveryId"), qaStatus: fd.get("qaStatus"), observations: fd.get("observations") ?? "", intent: fd.get("intent") });
  const keys = ["identificacao", "fatos", "fundamentacao", "pedidos", "citacoes", "campos_conferir"];
  const checklist = Object.fromEntries(keys.map(key => [key, fd.get(key) === "on"]));
  const notificationAdmin = input.intent === "deliver" ? createSupabaseAdminClient() : null;
  const deliveryBefore = notificationAdmin ? await notificationAdmin.from("entregas").select("escritorio_id,enviado_em").eq("id", input.deliveryId).single() : null;
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("admin_revisar_entrega", { p_entrega_id: input.deliveryId, p_qa_status: input.qaStatus, p_checklist: checklist, p_observacoes: input.observations || null, p_entregar: input.intent === "deliver" });
  if (error) throw new Error("Não foi possível registrar o QA.");
  if (notificationAdmin && deliveryBefore?.data && !deliveryBefore.data.enviado_em) {
    await sendOfficeNotification({ kind: "peca_entregue", escritorioId: deliveryBefore.data.escritorio_id, admin: notificationAdmin });
  }
  revalidatePath("/admin"); revalidatePath("/admin/fila"); revalidatePath(`/admin/casos/${input.caseId}`);
}
