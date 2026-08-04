"use client";

import { useState } from "react";

export function AddonPurchase() {
  const [pending, setPending] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  async function buy(quantity: 1 | 5 | 10) {
    setPending(quantity); setMessage(null);
    const response = await fetch("/api/billing/addons", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quantidade: quantity }) });
    const result = await response.json(); setPending(null);
    if (!response.ok) return setMessage(result.erro ?? "Não foi possível criar a cobrança.");
    if (result.pagamento_url) window.open(result.pagamento_url, "_blank", "noopener,noreferrer");
    setMessage("Cobrança criada. O crédito será liberado automaticamente após a confirmação do pagamento.");
  }
  return <section className="content-section"><p className="eyebrow">Peças extras</p><h2>Comprar peças extras</h2><p>R$ 29 por peça. O crédito não expira e só é liberado após o pagamento.</p><div className="wizard-actions">{([1, 5, 10] as const).map(quantity => <button key={quantity} className="secondary-button" type="button" disabled={pending !== null} onClick={() => buy(quantity)}>{pending === quantity ? "Criando…" : `${quantity} peça${quantity > 1 ? "s" : ""}`}</button>)}</div>{message ? <p className="form-message" role="status">{message}</p> : null}</section>;
}
