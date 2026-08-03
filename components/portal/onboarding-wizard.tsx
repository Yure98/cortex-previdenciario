"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import type { SessionContext } from "@/lib/auth/session";

function uploadWithProgress(form: HTMLFormElement, onProgress: (value: number) => void): Promise<{ ok: boolean; erro?: string; avisos?: string[] }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/onboarding");
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100));
    xhr.onload = () => resolve(xhr.response ?? { ok: false, erro: "Resposta inválida." });
    xhr.onerror = () => resolve({ ok: false, erro: "Falha de conexão durante o envio." });
    xhr.send(new FormData(form));
  });
}

export function OnboardingWizard({ context }: { context: SessionContext }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(1);
  const [progress, setProgress] = useState(0);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function next() {
    const controls = formRef.current?.querySelectorAll<HTMLElement>("section:not([hidden]) input");
    if (controls && [...controls].every((control) => !("reportValidity" in control) || (control as HTMLInputElement).reportValidity())) setStep((current) => Math.min(3, current + 1));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage(null);
    const result = await uploadWithProgress(event.currentTarget, setProgress);
    setPending(false);
    if (!result.ok) return setMessage(result.erro ?? "Não foi possível salvar.");
    if (result.avisos?.length) setMessage(`Timbrado salvo. Atenção: ${result.avisos.join(" ")}`);
    router.push("/portal"); router.refresh();
  }

  return <form ref={formRef} onSubmit={submit} className="wizard-card">
    <div className="wizard-progress"><span style={{ width: `${(step / 3) * 100}%` }} /></div>
    <p className="eyebrow">Etapa {step} de 3</p>
    <section hidden={step !== 1}><h2>Dados do escritório</h2><div className="form-grid"><label>Seu nome<input name="nomeUsuario" defaultValue={context.usuario.nome ?? ""} required /></label><label>Nome do escritório<input name="nome" defaultValue={context.escritorio.nome} required /></label><label>OAB<input name="oab" defaultValue={context.escritorio.oab ?? ""} placeholder="OAB/UF 000.000" /></label><label>Cidade<input name="cidade" defaultValue={context.escritorio.cidade ?? ""} /></label><label className="full">NotebookLM (opcional)<input name="notebooklmUrl" type="url" defaultValue={context.escritorio.notebooklm_url ?? ""} placeholder="https://notebooklm.google.com/…" /></label></div></section>
    <section hidden={step !== 2}><h2>Identidade visual</h2><p className="muted">Usamos estas cores nos elementos de Visual Law. O timbrado não será redesenhado.</p><div className="color-grid"><label>Primária<input name="corPrimaria" type="color" defaultValue={context.escritorio.cor_primaria} /></label><label>Secundária<input name="corSecundaria" type="color" defaultValue={context.escritorio.cor_secundaria} /></label><label>Acento<input name="corAcento" type="color" defaultValue={context.escritorio.cor_acento} /></label></div></section>
    <section hidden={step !== 3}><h2>Timbrado do escritório</h2><p className="muted">Envie um DOCX de até 50 MB com <code>{"{{CONTEUDO_PETICAO}}"}</code>. Preservaremos cabeçalho, rodapé, logo e margens.</p><label className="dropzone">Arquivo DOCX<input name="timbrado" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required /></label><p className="warning-note">Se o cabeçalho já sobrepõe o corpo no arquivo original, avisaremos sem alterar o design automaticamente.</p></section>
    {pending ? <div className="upload-state"><progress max="100" value={progress} /><span>Enviando e validando… {progress}%</span></div> : null}
    {message ? <p className="form-message error" role="alert">{message}</p> : null}
    <div className="wizard-actions">{step > 1 ? <button type="button" className="secondary-button" onClick={() => setStep(step - 1)} disabled={pending}>Voltar</button> : <span />}{step < 3 ? <button type="button" className="primary-button" onClick={next}>Continuar</button> : <button type="submit" className="primary-button" disabled={pending}>{pending ? "Validando…" : "Concluir configuração"}</button>}</div>
  </form>;
}
