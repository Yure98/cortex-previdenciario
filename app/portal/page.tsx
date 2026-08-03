import Link from "next/link";
import { redirect } from "next/navigation";

import { RealtimeCases } from "@/components/portal/realtime-cases";
import { requireSessionContext } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const statusLabels: Record<string, string> = { recebido: "Recebido", producao: "Em produção", qa: "Pronto para revisão", entregue: "Entregue" };

export default async function DashboardPage() {
  const context = await requireSessionContext();
  if (context.escritorio.status === "onboarding" || !context.escritorio.timbrado_path) redirect("/portal/onboarding");
  const supabase = await createSupabaseServerClient();
  const month = new Date(); month.setUTCDate(1); month.setUTCHours(0, 0, 0, 0);
  const [{ data: cases }, { count: used }] = await Promise.all([
    supabase.from("casos").select("id,cliente_final,beneficio,status,criado_em").order("criado_em", { ascending: false }).limit(5),
    supabase.from("consumos_peca").select("id", { count: "exact", head: true }).gte("criado_em", month.toISOString()).in("status", ["reservado", "concluido"]),
  ]);
  const consumed = used ?? 0;
  return <><RealtimeCases escritorioId={context.escritorio.id} /><header className="page-heading"><div><p className="eyebrow">Visão geral</p><h1>Olá, {context.usuario.nome?.split(" ")[0] ?? "colega"}.</h1><p>Acompanhe o trabalho do mês e comece uma nova peça.</p></div><Link className="primary-button link-button" href="/portal/casos/novo">Novo caso</Link></header><section className="metric-grid" aria-label="Resumo do escritório"><article><span>Peças no mês</span><strong>{consumed}</strong><small>de {context.escritorio.franquia_pecas_mensal} incluídas</small></article><article><span>Disponíveis</span><strong>{Math.max(0, context.escritorio.franquia_pecas_mensal - consumed)}</strong><small>antes de excedentes</small></article><article><span>Status da conta</span><strong className="metric-word">{context.escritorio.status === "ativo" ? "Ativa" : context.escritorio.status}</strong><small>R$ 397/mês</small></article></section><section className="content-section"><div className="section-heading"><div><p className="eyebrow">Atividade recente</p><h2>Últimos casos</h2></div><Link href="/portal/casos">Ver todos</Link></div><div className="case-list">{cases?.length ? cases.map((item) => <Link className="case-row" href={`/portal/casos/${item.id}`} key={item.id}><div><strong>{item.cliente_final}</strong><span>{item.beneficio}</span></div><span className={`status status-${item.status}`}>{statusLabels[item.status] ?? item.status}</span><time>{new Intl.DateTimeFormat("pt-BR").format(new Date(item.criado_em))}</time></Link>) : <div className="empty-state"><h3>Nenhum caso ainda</h3><p>Crie o primeiro caso para acompanhar o fluxo aqui.</p></div>}</div></section></>;
}

