"use client";

import { useActionState, useState } from "react";

import {
  requestPasswordReset,
  signIn,
  signUp,
  type AuthState,
} from "@/app/auth/actions";

const initialState: AuthState = {};

export function AuthForm() {
  const [mode, setMode] = useState<"entrar" | "criar" | "recuperar">("entrar");
  const [loginState, loginAction, loginPending] = useActionState(signIn, initialState);
  const [signupState, signupAction, signupPending] = useActionState(signUp, initialState);
  const [resetState, resetAction, resetPending] = useActionState(
    requestPasswordReset,
    initialState,
  );
  const state = mode === "entrar" ? loginState : mode === "criar" ? signupState : resetState;
  const pending = loginPending || signupPending || resetPending;

  return (
    <div className="auth-card">
      <span className="eyebrow">Acesso seguro</span>
      <h1>{mode === "criar" ? "Crie seu escritório" : mode === "recuperar" ? "Recupere sua senha" : "Entre no Córtex"}</h1>
      <p className="muted">
        {mode === "criar"
          ? "Configure o timbrado e gere sua primeira peça em poucos passos."
          : mode === "recuperar"
            ? "Enviaremos um link de recuperação para seu e-mail."
            : "Suas peças e documentos ficam isolados por escritório."}
      </p>
      <form action={mode === "entrar" ? loginAction : mode === "criar" ? signupAction : resetAction} className="form-stack">
        {mode === "criar" ? (
          <>
            <label>Seu nome<input name="nome" autoComplete="name" required /></label>
            <label>Nome do escritório<input name="escritorio" autoComplete="organization" required /></label>
          </>
        ) : null}
        <label>E-mail<input name="email" type="email" autoComplete="email" required /></label>
        {mode !== "recuperar" ? (
          <label>Senha<input name="senha" type="password" minLength={8} autoComplete={mode === "criar" ? "new-password" : "current-password"} required /></label>
        ) : null}
        {state.error ? <p className="form-message error" role="alert">{state.error}</p> : null}
        {state.success ? <p className="form-message success" role="status">{state.success}</p> : null}
        <button className="primary-button" disabled={pending} type="submit">
          {pending ? "Aguarde…" : mode === "entrar" ? "Entrar" : mode === "criar" ? "Criar conta" : "Enviar link"}
        </button>
      </form>
      <div className="auth-switches">
        {mode !== "entrar" ? <button type="button" onClick={() => setMode("entrar")}>Já tenho conta</button> : null}
        {mode !== "criar" ? <button type="button" onClick={() => setMode("criar")}>Criar conta</button> : null}
        {mode === "entrar" ? <button type="button" onClick={() => setMode("recuperar")}>Esqueci a senha</button> : null}
      </div>
    </div>
  );
}

