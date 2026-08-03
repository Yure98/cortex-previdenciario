"use client"; import Link from "next/link"; import {usePathname} from "next/navigation";
const items=[["Dashboard","/admin"],["Fila","/admin/fila"],["Escritórios","/admin/escritorios"],["Financeiro","/admin/financeiro"]] as const;
export function AdminNav(){const p=usePathname();return <nav className="portal-nav" aria-label="Administração">{items.map(([l,h])=><Link key={h} href={h} aria-current={p===h||(h!=="/admin"&&p.startsWith(`${h}/`))?"page":undefined}>{l}</Link>)}</nav>}
