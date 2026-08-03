import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod/v4";

import { RealtimeCases } from "@/components/portal/realtime-cases";
import { ThesisCard } from "@/components/portal/thesis-card";
import { requireSessionContext } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const labels: Record<string, string> = { recebido: "Recebido", producao: "Em produção", qa: "Pronto para revisão", entregue: "Entregue" };

export default async function CaseDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ geracao?: string }> }) {
  const context = await requireSessionContext();
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createSupabaseServerClient();
  const [{ data: item }, { data: links }, { data: deliveries }] = await Promise.all([
    supabase.from("casos").select("id,cliente_final,beneficio,tipo_peca,formato,pesquisou_juris,status,fatos,pedidos,criado_em").eq("id", id.data).maybeSingle(),
    supabase.from("caso_teses").select("ordem,similaridade,tese_id,teses(titulo,resumo,requisitos,provas_necessarias,base_legal,jurisprudencia_chave)").eq("caso_id", id.data).order("ordem"),
    supabase.from("entregas").select("id,nome_arquivo,versao,qa_status,criado_em").eq("caso_id", id.data).order("versao", { ascending: false }),
  ]);
  if (!item) notFound();
  const generationFailed = (await searchParams).geracao === "erro";
  return <><RealtimeCases escritorioId={context.escritorio.id} /><div className="breadcrumb"><Link href="/portal/casos">Meus casos</Link><span>/</span><span>{item.cliente_final}</span></div><header className="case-header"><div><span className={`status status-${item.status}`}>{labels[item.status] ?? item.status}</span><h1>{item.cliente_final}</h1><p>{item.beneficio} · {item.tipo_peca.replaceAll("_", " ")} · {item.formato === "visual_law" ? "Visual Law" : "Tradicional"}</p></div>{deliveries?.[0] ? <a className="primary-button link-button" href={`/api/entregas/${deliveries[0].id}/download`}>Baixar DOCX</a> : null}</header>{generationFailed ? <p className="form-message error" role="alert">O caso foi salvo, mas a geração foi bloqueada ou falhou. Verifique plano, curadoria das teses e limites antes de tentar novamente.</p> : null}<div className="review-warning prominent"><strong>Minuta assistida por IA</strong><span>Revise integralmente os fatos, cálculos, fundamentos e precedentes antes de protocolar.</span></div><div className="detail-grid"><main><section className="content-section no-padding"><p className="eyebrow">Estratégia jurídica</p><h2>Teses aplicadas</h2>{links?.length ? <div className="thesis-list">{links.map((link) => { const thesis = Array.isArray(link.teses) ? link.teses[0] : link.teses; return thesis ? <ThesisCard key={link.tese_id} order={link.ordem} thesis={thesis} /> : null; })}</div> : <div className="empty-state"><h3>{item.status === "recebido" ? "Geração não concluída" : "Teses em processamento"}</h3><p>As teses aparecem aqui assim que o RAG concluir a seleção.</p></div>}</section></main><aside className="case-aside"><section><p className="eyebrow">Status</p><strong>{labels[item.status] ?? item.status}</strong></section><section><p className="eyebrow">Jurisprudência</p><strong>{item.pesquisou_juris ? "Solicitada" : "Não solicitada"}</strong></section><section><p className="eyebrow">Entregas</p>{deliveries?.length ? deliveries.map((delivery) => <a key={delivery.id} href={`/api/entregas/${delivery.id}/download`}>Versão {delivery.versao} · {delivery.qa_status}</a>) : <span>Aguardando geração</span>}</section><section><p className="eyebrow">Criado em</p><strong>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(item.criado_em))}</strong></section></aside></div></>;
}
