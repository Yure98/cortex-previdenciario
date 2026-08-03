import { PasswordForm } from "@/components/auth/password-form";
import Link from "next/link";

export default function ResetPasswordPage() {
  return <main className="auth-shell"><Link className="brand" href="/">Córtex Previdenciário</Link><div className="auth-card"><span className="eyebrow">Segurança</span><h1>Defina uma nova senha</h1><PasswordForm /></div></main>;
}
