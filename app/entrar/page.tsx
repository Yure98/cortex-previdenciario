import { AuthForm } from "@/components/auth/auth-form";
import Link from "next/link";

export default function LoginPage() {
  return <main className="auth-shell"><Link className="brand" href="/">Córtex Previdenciário</Link><AuthForm /><p className="legal-note">Minutas assistidas por IA exigem revisão profissional antes do protocolo.</p></main>;
}
