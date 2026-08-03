import { redirect } from "next/navigation";

import { NewCaseWizard } from "@/components/portal/new-case-wizard";
import { requireSessionContext } from "@/lib/auth/session";

export default async function NewCasePage() {
  const context = await requireSessionContext();
  if (context.escritorio.status !== "ativo" || !context.escritorio.timbrado_path) redirect("/portal/onboarding");
  return <><header className="page-heading compact"><div><p className="eyebrow">Novo caso</p><h1>Conte o essencial.</h1><p>O CNIS é processado em código; somente o resumo de-identificado é usado no RAG.</p></div></header><NewCaseWizard /></>;
}

