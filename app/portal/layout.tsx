import Link from "next/link";
import type { ReactNode } from "react";

import { signOut } from "@/app/auth/actions";
import { PortalNav } from "@/components/portal/portal-nav";
import { requireSessionContext } from "@/lib/auth/session";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const context = await requireSessionContext();
  return <div className="portal-shell"><header className="portal-header"><div className="portal-header-inner"><Link className="brand" href="/portal">Córtex Previdenciário</Link><PortalNav /><div className="account-menu"><span>{context.usuario.nome ?? context.escritorio.nome}</span><form action={signOut}><button type="submit">Sair</button></form></div></div></header><main className="portal-main">{children}</main></div>;
}

