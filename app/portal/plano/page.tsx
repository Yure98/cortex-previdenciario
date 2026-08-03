import { requireSessionContext } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function PlanPage() {
  const context = await requireSessionContext();
  const supabase = await createSupabaseServerClient();
  const month = new Date(); month.setUTCDate(1); month.setUTCHours(0, 0, 0, 0);
  const [{ data: usage }, { data: subscriptions }, { data: invoices }] = await Promise.all([
    supabase.from("consumos_peca").select("tipo,status").gte("criado_em", month.toISOString()).in("status", ["reservado", "concluido"]),
    supabase.from("assinaturas").select("status,valor_centavos,proximo_vencimento").order("criado_em", { ascending: false }).limit(1),
    supabase.from("faturas").select("id,tipo,status,valor_centavos,vencimento").order("criado_em", { ascending: false }).limit(8),
  ]);
  const used = usage?.length ?? 0;
  const included = usage?.filter((item) => item.tipo === "franquia").length ?? 0;
  const excess = usage?.filter((item) => item.tipo === "excedente").length ?? 0;
  const percentage = Math.min(100, (included / context.escritorio.franquia_pecas_mensal) * 100);
  return <><header className="page-heading compact"><div><p className="eyebrow">Conta</p><h1>Plano e uso</h1><p>Controle a franquia e acompanhe as cobranças do escritório.</p></div></header><section className="plan-card"><div><span className="eyebrow">Córtex mensal</span><h2>R$ 397 <small>/mês</small></h2><p>25 peças incluídas · excedente a R$ 29 por peça paga</p></div><span className={`status status-${subscriptions?.[0]?.status === "ativa" ? "entregue" : "recebido"}`}>{subscriptions?.[0]?.status ?? context.escritorio.status}</span></section><section className="usage-card"><div className="section-heading"><div><p className="eyebrow">Uso no mês</p><h2>{used} de {context.escritorio.franquia_pecas_mensal} peças</h2></div><strong>{Math.max(0, context.escritorio.franquia_pecas_mensal - included)} disponíveis</strong></div><div className="usage-track"><span style={{ width: `${percentage}%` }} /></div><div className="usage-breakdown"><span>Incluídas usadas: <strong>{included}</strong></span><span>Excedentes pagos usados: <strong>{excess}</strong></span></div></section><section className="content-section"><p className="eyebrow">Histórico</p><h2>Faturas recentes</h2><div className="invoice-list">{invoices?.length ? invoices.map((invoice) => <div className="invoice-row" key={invoice.id}><span>{invoice.tipo === "setup" ? "Setup" : invoice.tipo === "mensal" ? "Mensalidade" : "Peça excedente"}</span><strong>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(invoice.valor_centavos / 100)}</strong><span className={`status status-${invoice.status === "paga" ? "entregue" : "recebido"}`}>{invoice.status}</span><time>{invoice.vencimento ? new Intl.DateTimeFormat("pt-BR").format(new Date(`${invoice.vencimento}T12:00:00`)) : "—"}</time></div>) : <div className="empty-state"><p>Nenhuma fatura registrada ainda.</p></div>}</div></section></>;
}
