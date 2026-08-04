import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getNotificationEnvironment } from "@/lib/env/server";

export type NotificationKind = "onboarding_concluido" | "peca_pronta" | "peca_entregue" | "franquia_80" | "franquia_esgotada" | "fatura_vencida";

const copy: Record<NotificationKind, { subject: string; title: string; body: string; path: string }> = {
  onboarding_concluido: { subject: "Seu escritório está configurado", title: "Configuração concluída", body: "A cobrança de setup foi criada no ambiente de testes. Acesse o portal para acompanhar os próximos passos.", path: "/portal/plano" },
  peca_pronta: { subject: "Sua peça está pronta para revisão", title: "Peça pronta para revisão", body: "Uma nova peça está disponível no portal para revisão de qualidade.", path: "/portal/casos" },
  peca_entregue: { subject: "Sua peça foi entregue", title: "Entrega disponível", body: "A versão aprovada está disponível no portal. O documento não é enviado por e-mail.", path: "/portal/casos" },
  franquia_80: { subject: "Você utilizou 80% da franquia", title: "Franquia próxima do limite", body: "Seu escritório alcançou 80% das peças incluídas neste mês.", path: "/portal/plano" },
  franquia_esgotada: { subject: "Sua franquia mensal foi utilizada", title: "Franquia esgotada", body: "Você pode comprar peças extras no portal. Créditos pagos não expiram.", path: "/portal/plano" },
  fatura_vencida: { subject: "Há uma fatura vencida", title: "Regularize sua cobrança", body: "A geração de novas peças fica bloqueada enquanto houver inadimplência. Consulte a cobrança no portal.", path: "/portal/plano" },
};

function html(title: string, body: string, url: string) {
  return `<!doctype html><html><body style="margin:0;background:#fff;color:#111;font-family:Inter,Arial,sans-serif"><main style="max-width:560px;margin:0 auto;padding:40px 24px"><p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase">Córtex Previdenciário</p><h1 style="font-size:28px">${title}</h1><p style="line-height:1.6">${body}</p><a href="${url}" style="display:inline-block;margin-top:16px;padding:12px 18px;background:#111;color:#fff;text-decoration:none;border-radius:8px">Acessar portal</a><p style="margin-top:32px;color:#666;font-size:12px">Por segurança, este e-mail não contém dados de casos nem documentos.</p></main></body></html>`;
}

export async function sendOfficeNotification(input: { kind: NotificationKind; escritorioId: string; admin: SupabaseClient; fetcher?: typeof fetch }): Promise<boolean> {
  const { kind, escritorioId, admin } = input;
  try {
    const env = getNotificationEnvironment();
    const { data: owner, error } = await admin.from("usuarios").select("id").eq("escritorio_id", escritorioId).eq("papel", "proprietario").order("criado_em").limit(1).maybeSingle();
    if (error || !owner) throw error ?? new Error("DESTINATARIO_NAO_ENCONTRADO");
    const user = await admin.auth.admin.getUserById(owner.id);
    if (user.error || !user.data.user?.email) throw user.error ?? new Error("EMAIL_NAO_ENCONTRADO");
    const template = copy[kind];
    const url = new URL(template.path, env.APP_URL).toString();
    const response = await (input.fetcher ?? fetch)("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ from: env.RESEND_FROM_EMAIL, to: [user.data.user.email], subject: template.subject, html: html(template.title, template.body, url), tags: [{ name: "event", value: kind }] }), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`RESEND_HTTP_${response.status}`);
    await admin.from("auditoria").insert({ escritorio_id: escritorioId, evento: `email.${kind}.enviado`, autor: "sistema", metadata: {} });
    return true;
  } catch (error) {
    await admin.from("auditoria").insert({ escritorio_id: escritorioId, evento: `email.${kind}.falhou`, autor: "sistema", metadata: { codigo: error instanceof Error ? error.message.slice(0, 120) : "ERRO_DESCONHECIDO" } });
    return false;
  }
}

export async function notifyUsageThreshold(escritorioId: string, admin: SupabaseClient): Promise<void> {
  const month = new Date(); month.setUTCDate(1); month.setUTCHours(0, 0, 0, 0);
  const [{ data: office }, { count }] = await Promise.all([
    admin.from("escritorios").select("franquia_pecas_mensal").eq("id", escritorioId).single(),
    admin.from("consumos_peca").select("id", { count: "exact", head: true }).eq("escritorio_id", escritorioId).eq("tipo", "franquia").in("status", ["reservado", "concluido"]).gte("criado_em", month.toISOString()),
  ]);
  if (!office || count === null) return;
  const kind = count >= office.franquia_pecas_mensal ? "franquia_esgotada" : count >= Math.ceil(office.franquia_pecas_mensal * 0.8) ? "franquia_80" : null;
  if (!kind) return;
  const eventId = `${kind}:${escritorioId}:${month.toISOString().slice(0, 7)}`;
  const { data } = await admin.from("auditoria").select("id").eq("evento_externo_id", eventId).maybeSingle();
  if (data) return;
  const reservation = await admin.from("auditoria").insert({ escritorio_id: escritorioId, evento: `email.${kind}.agendado`, autor: "sistema", evento_externo_id: eventId, metadata: {} });
  if (reservation.error) return;
  await sendOfficeNotification({ kind, escritorioId, admin });
}
