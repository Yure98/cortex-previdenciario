"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type CreateResult = { ok?: boolean; casoId?: string; erro?: string };

function uploadCase(form: HTMLFormElement, onProgress: (value: number) => void): Promise<CreateResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/casos"); xhr.responseType = "json";
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100));
    xhr.onload = () => resolve(xhr.response ?? { erro: "Resposta inválida." });
    xhr.onerror = () => resolve({ erro: "Falha de conexão durante o envio." });
    xhr.send(new FormData(form));
  });
}

export function NewCaseWizard() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(1);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("Enviando CNIS…");
  const [error, setError] = useState<string | null>(null);

  function next() {
    const controls = formRef.current?.querySelectorAll<HTMLElement>("section:not([hidden]) input, section:not([hidden]) select, section:not([hidden]) textarea");
    if (controls && [...controls].every((control) => !("reportValidity" in control) || (control as HTMLInputElement).reportValidity())) setStep((current) => Math.min(3, current + 1));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(null); setStage("Enviando CNIS…");
    const created = await uploadCase(event.currentTarget, setProgress);
    if (!created.ok || !created.casoId) { setPending(false); setError(created.erro ?? "Não foi possível criar o caso."); return; }
    setStage("Analisando o CNIS e selecionando teses…");
    const generation = await fetch("/api/gerar", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ caso_id: created.casoId, tipo_operacao: "peticao" }),
    });
    const body = await generation.json() as { erro?: { mensagem?: string } };
    if (!generation.ok) { setPending(false); setError(body.erro?.mensagem ?? "O caso foi salvo, mas a geração não pôde ser iniciada."); router.push(`/portal/casos/${created.casoId}?geracao=erro`); return; }
    setStage("Documento pronto. Abrindo a revisão…");
    router.push(`/portal/casos/${created.casoId}`); router.refresh();
  }

  return <form ref={formRef} onSubmit={submit} className="wizard-card case-wizard">
    <div className="wizard-progress"><span style={{ width: `${(step / 3) * 100}%` }} /></div>
    <p className="eyebrow">Etapa {step} de 3</p>
    <section hidden={step !== 1}><h2>Benefício e cliente</h2><div className="form-grid"><label>Nome do segurado<input name="clienteFinal" required minLength={2} /></label><label>Benefício<select name="beneficio" required defaultValue=""><option value="" disabled>Selecione</option><option>Aposentadoria por idade</option><option>Aposentadoria por incapacidade</option><option>Auxílio por incapacidade temporária</option><option>BPC/LOAS</option><option>Pensão por morte</option><option>Salário-maternidade</option><option>Aposentadoria rural</option></select></label><label>Tipo de peça<select name="tipoPeca" defaultValue="peticao_inicial"><option value="peticao_inicial">Petição inicial</option><option value="recurso_administrativo">Recurso administrativo</option><option value="recurso_judicial">Recurso judicial</option></select></label><label>CNIS em PDF<input name="cnis" type="file" accept="application/pdf,.pdf" required /></label></div></section>
    <section hidden={step !== 2}><h2>Contexto do caso</h2><div className="form-stack"><label>Fatos relevantes<textarea name="fatos" rows={7} minLength={10} maxLength={50000} required placeholder="Descreva datas, indeferimento, atividade e demais fatos relevantes." /></label><label>Pedidos — um por linha<textarea name="pedidos" rows={5} required placeholder="Concessão do benefício&#10;Pagamento das parcelas vencidas" /></label></div></section>
    <section hidden={step !== 3}><h2>Preferências da peça</h2><fieldset><legend>Pesquisar jurisprudência?</legend><label className="choice"><input type="radio" name="pesquisouJuris" value="sim" required /> Sim</label><label className="choice"><input type="radio" name="pesquisouJuris" value="nao" required /> Não</label></fieldset><fieldset><legend>Formato</legend><label className="choice"><input type="radio" name="formato" value="tradicional" defaultChecked required /> Tradicional</label><label className="choice"><input type="radio" name="formato" value="visual_law" required /> Visual Law</label></fieldset><div className="review-warning"><strong>Revisão profissional obrigatória</strong><span>O Córtex entrega uma minuta assistida por IA. Confira fatos, fundamentos, jurisprudência e cálculos antes do protocolo.</span></div></section>
    {pending ? <div className="generation-state"><div className="spinner" aria-hidden="true" /><div><strong>{stage}</strong><span>{progress < 100 ? `Upload ${progress}%` : "Isso pode levar alguns minutos. Não feche esta página."}</span></div></div> : null}
    {error ? <p className="form-message error" role="alert">{error}</p> : null}
    <div className="wizard-actions">{step > 1 ? <button type="button" className="secondary-button" onClick={() => setStep(step - 1)} disabled={pending}>Voltar</button> : <span />}{step < 3 ? <button type="button" className="primary-button" onClick={next}>Continuar</button> : <button type="submit" className="primary-button" disabled={pending}>{pending ? "Gerando…" : "Criar caso e gerar peça"}</button>}</div>
  </form>;
}
