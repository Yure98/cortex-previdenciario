"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  ["Visão geral", "/portal"],
  ["Meus casos", "/portal/casos"],
  ["Plano e uso", "/portal/plano"],
  ["Escritório", "/portal/onboarding"],
] as const;

export function PortalNav() {
  const pathname = usePathname();
  return <nav className="portal-nav" aria-label="Portal">{items.map(([label, href]) => <Link key={href} href={href} aria-current={pathname === href || (href === "/portal/casos" && pathname.startsWith(`${href}/`)) ? "page" : undefined}>{label}</Link>)}</nav>;
}

