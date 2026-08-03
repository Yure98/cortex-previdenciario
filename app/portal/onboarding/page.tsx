import { OnboardingWizard } from "@/components/portal/onboarding-wizard";
import { requireSessionContext } from "@/lib/auth/session";

export default async function OnboardingPage() {
  const context = await requireSessionContext();
  return <><header className="page-heading compact"><div><p className="eyebrow">{context.escritorio.data_onboarding ? "Configurações" : "Primeiro acesso"}</p><h1>Prepare seu escritório.</h1><p>Esses dados serão usados na montagem das peças.</p></div></header><OnboardingWizard context={context} /></>;
}

