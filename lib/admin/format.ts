export const moneyFromCents=(v:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v/100);
export const usd=(v:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"USD"}).format(v);
export const dateTime=(v:string|null)=>v?new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(v)):"—";
export function officeName(r:unknown){if(Array.isArray(r))return String(r[0]?.nome??"—");if(r&&typeof r==="object"&&"nome" in r)return String(r.nome);return "—";}
