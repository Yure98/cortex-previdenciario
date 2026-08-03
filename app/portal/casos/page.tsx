import Link from "next/link";

import { RealtimeCases } from "@/components/portal/realtime-cases";
import { requireSessionContext } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const labels: Record<string, string> = { recebido: "Recebido", producao: "Em produção", qa: "Pronto para revisão", entregue: "Entregue" };

export default async function CasesPage() {
  const context = await requireSessionContext();
  const supabase = await createSupabaseServerClient();
  const { data: cases } = await supabase.from("casos").select("id,cliente_final,beneficio,tipo_peca,formato,status,criado_em").order("criado_em", { ascending: false });
  return <><RealtimeCases escritorioId={context.escritorio.id} /><header className="page-heading"><div><p className="eyebrow">Produção</p><h1>Meus casos</h1><p>Status atualizado em tempo real, do recebimento à entrega.</p></div><Link className="primary-button link-button" href="/portal/casos/novo">Novo caso</Link></header><div className="case-list full-list">{cases?.length ? cases.map((item) => <Link className="case-row" href={`/portal/casos/${item.id}`} key={item.id}><div><strong>{item.cliente_final}</strong><span>{item.beneficio} · {item.tipo_peca.replaceAll("_", " ")}</span></div><span className={`status status-${item.status}`}>{labels[item.status] ?? item.status}</span><span>{item.formato === "visual_law" ? "Visual Law" : "Tradicional"}</span><time>{new Intl.DateTimeFormat("pt-BR").format(new Date(item.criado_em))}</time></Link>) : <div className="empty-state"><h3>Você ainda não criou casos</h3><Link className="primary-button link-button" href="/portal/casos/novo">Criar primeiro caso</Link></div>}</div></>;
}
