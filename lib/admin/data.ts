import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const month = () => { const n = new Date(); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1)).toISOString(); };
const ok = (error: { message: string } | null, label: string) => { if (error) throw new Error(`${label}: ${error.message}`); };

export async function getAdminDashboard() {
  const db = createSupabaseAdminClient(); const start = month();
  const [a,c,u,f] = await Promise.all([
    db.from("assinaturas").select("valor_centavos").eq("status","ativa"),
    db.from("casos").select("id,status,sla_ate").gte("criado_em",start),
    db.from("uso_tokens").select("custo_usd,input_tokens,output_tokens,cache_read_input_tokens,cache_creation_input_tokens").gte("criado_em",start).neq("status","cancelada"),
    db.from("feedback").select("nota").gte("criado_em",start),
  ]); ok(a.error,"MRR"); ok(c.error,"casos"); ok(u.error,"uso"); ok(f.error,"NPS");
  const scores=(f.data??[]).map(x=>Number(x.nota)); const now=Date.now();
  return { mrrCentavos:(a.data??[]).reduce((s,x)=>s+Number(x.valor_centavos),0), casesInMonth:c.data?.length??0,
    inProduction:(c.data??[]).filter(x=>x.status==="producao").length,
    slaAtRisk:(c.data??[]).filter(x=>x.sla_ate&&x.status!=="entregue"&&new Date(x.sla_ate).getTime()>=now&&new Date(x.sla_ate).getTime()<=now+86400000).length,
    spendUsd:(u.data??[]).reduce((s,x)=>s+Number(x.custo_usd),0), spendLimitUsd:Number(process.env.LIMITE_GASTO_MENSAL_USD??0),
    tokens:(u.data??[]).reduce((s,x)=>s+Number(x.input_tokens)+Number(x.output_tokens)+Number(x.cache_read_input_tokens)+Number(x.cache_creation_input_tokens),0),
    nps:scores.length?Math.round(((scores.filter(x=>x>=9).length-scores.filter(x=>x<=6).length)/scores.length)*100):null };
}

export async function getAdminCases(filters?: { office?: string; benefit?: string }) {
  const db=createSupabaseAdminClient(); let q=db.from("casos").select("id,escritorio_id,cliente_final,beneficio,tipo_peca,formato,status,prioridade,sla_ate,criado_em,escritorios(nome)").order("prioridade",{ascending:false}).order("criado_em",{ascending:true});
  if(filters?.office) q=q.eq("escritorio_id",filters.office); if(filters?.benefit) q=q.eq("beneficio",filters.benefit); const {data,error}=await q; ok(error,"fila"); return data??[];
}

export async function getAdminCase(id:string) {
  const db=createSupabaseAdminClient(); const [item,documents,deliveries,generations,audit]=await Promise.all([
    db.from("casos").select("id,escritorio_id,cliente_final,beneficio,tipo_peca,formato,pesquisou_juris,status,prioridade,fatos,pedidos,inputs,sla_ate,criado_em,escritorios(nome,oab,cidade)").eq("id",id).maybeSingle(),
    db.from("documentos").select("id,tipo,nome_original,mime_type,tamanho_bytes,versao,criado_em").eq("caso_id",id).order("criado_em",{ascending:false}),
    db.from("entregas").select("id,nome_arquivo,versao,qa_status,qa_checklist,qa_observacoes,revisado_em,enviado_em,criado_em").eq("caso_id",id).order("versao",{ascending:false}),
    db.from("geracoes").select("id,status,etapa_atual,revisao,custo_usd,custo_brl,erro_codigo,criado_em,finalizado_em").eq("caso_id",id).order("criado_em",{ascending:false}),
    db.from("auditoria").select("id,evento,autor,metadata,criado_em").eq("caso_id",id).order("criado_em",{ascending:false}).limit(30),
  ]); [item,documents,deliveries,generations,audit].forEach((r,i)=>ok(r.error,["caso","documentos","entregas","gerações","auditoria"][i]));
  return {item:item.data,documents:documents.data??[],deliveries:deliveries.data??[],generations:generations.data??[],audit:audit.data??[]};
}

export async function getAdminOffices() {
  const db=createSupabaseAdminClient(); const [o,u]=await Promise.all([
    db.from("escritorios").select("id,nome,oab,cidade,plano,status,timbrado_path,teto_token_mensal,teto_gasto_mensal_usd,franquia_pecas_mensal,data_onboarding,criado_em,assinaturas(status,valor_centavos,proximo_vencimento)").order("criado_em",{ascending:false}),
    db.from("uso_tokens").select("escritorio_id,custo_usd,input_tokens,output_tokens,cache_read_input_tokens,cache_creation_input_tokens").gte("criado_em",month()).neq("status","cancelada")]); ok(o.error,"escritórios");ok(u.error,"consumo");
  const map=new Map<string,{usd:number;tokens:number}>(); for(const x of u.data??[]){const v=map.get(x.escritorio_id)??{usd:0,tokens:0};v.usd+=Number(x.custo_usd);v.tokens+=Number(x.input_tokens)+Number(x.output_tokens)+Number(x.cache_read_input_tokens)+Number(x.cache_creation_input_tokens);map.set(x.escritorio_id,v);} return (o.data??[]).map(x=>({...x,consumption:map.get(x.id)??{usd:0,tokens:0}}));
}

export async function getAdminFinance(){const db=createSupabaseAdminClient();const [s,i]=await Promise.all([db.from("assinaturas").select("id,escritorio_id,valor_centavos,status,proximo_vencimento,escritorios(nome)").order("criado_em",{ascending:false}),db.from("faturas").select("id,escritorio_id,valor_centavos,tipo,status,vencimento,pago_em,competencia,escritorios(nome)").order("criado_em",{ascending:false}).limit(100)]);ok(s.error,"assinaturas");ok(i.error,"faturas");return{subscriptions:s.data??[],invoices:i.data??[],mrrCentavos:(s.data??[]).filter(x=>x.status==="ativa").reduce((n,x)=>n+Number(x.valor_centavos),0),overdueCentavos:(i.data??[]).filter(x=>x.status==="vencida").reduce((n,x)=>n+Number(x.valor_centavos),0),delinquentOffices:new Set((s.data??[]).filter(x=>x.status==="inadimplente").map(x=>x.escritorio_id)).size};}
