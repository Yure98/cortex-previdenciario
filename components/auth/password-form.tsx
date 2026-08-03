"use client";

import { useActionState } from "react";

import { updatePassword, type AuthState } from "@/app/auth/actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, {} as AuthState);
  return (
    <form action={action} className="form-stack">
      <label>Nova senha<input name="senha" type="password" minLength={8} autoComplete="new-password" required /></label>
      {state.error ? <p className="form-message error" role="alert">{state.error}</p> : null}
      {state.success ? <p className="form-message success" role="status">{state.success}</p> : null}
      <button className="primary-button" disabled={pending} type="submit">{pending ? "Salvando…" : "Salvar nova senha"}</button>
    </form>
  );
}

