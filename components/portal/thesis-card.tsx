type Thesis = {
  titulo: string; resumo: string | null; requisitos: unknown; provas_necessarias: unknown;
  base_legal: unknown; jurisprudencia_chave: unknown;
};

function items(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => typeof item === "string" ? item : JSON.stringify(item)) : [];
}

export function ThesisCard({ thesis, order }: { thesis: Thesis; order: number }) {
  return <article className="thesis-card"><div className="thesis-heading"><span>{String(order).padStart(2, "0")}</span><div><p className="eyebrow">Tese aplicada</p><h3>{thesis.titulo}</h3></div></div>{thesis.resumo ? <p className="thesis-summary">{thesis.resumo}</p> : null}<div className="checklist-grid"><section><h4>Requisitos</h4>{items(thesis.requisitos).map((item) => <label className="check-item" key={item}><input type="checkbox" /> <span>{item}</span></label>)}</section><section><h4>Provas</h4>{items(thesis.provas_necessarias).map((item) => <label className="check-item" key={item}><input type="checkbox" /> <span>{item}</span></label>)}</section></div><details><summary>Base legal e jurisprudência</summary><ul>{[...items(thesis.base_legal), ...items(thesis.jurisprudencia_chave)].map((item) => <li key={item}>{item.includes("[CONFERIR]") ? <mark>{item}</mark> : item}</li>)}</ul></details></article>;
}
