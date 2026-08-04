export function centsToAsaasValue(cents: number): number {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("VALOR_CENTAVOS_INVALIDO");
  return Number((cents / 100).toFixed(2));
}

export function asaasValueToCents(value: string | number): number {
  const text = typeof value === "number" ? value.toFixed(2) : value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error("VALOR_ASAAS_INVALIDO");
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error("VALOR_ASAAS_INVALIDO");
  return cents;
}

export function addonPriceCents(quantity: 1 | 5 | 10, unitCents = 2900): number {
  if (!Number.isSafeInteger(unitCents) || unitCents < 0) throw new Error("VALOR_CENTAVOS_INVALIDO");
  return quantity * unitCents;
}
