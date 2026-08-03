import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import Link from "next/link";

const foundations = [
  {
    title: "Isolamento por escritório",
    description: "RLS ativo no schema e caminhos de Storage separados pelo escritório autenticado.",
  },
  {
    title: "Custos controlados",
    description: "Reservas atômicas de custo e telemetria ativas para Haiku, Sonnet e prompt caching.",
  },
  {
    title: "LGPD desde a origem",
    description: "O contrato do RAG aceita apenas benefício e palavras-chave de um vocabulário controlado.",
  },
];

export default function HomePage() {
  return (
    <main>
      <header className="top-nav">
        <div className="container nav-content">
          <span className="brand">Córtex Previdenciário</span>
          <Badge>Fases 1–4 concluídas</Badge>
        </div>
      </header>

      <section className="hero container">
        <div className="hero-copy">
          <Badge>Motor e entrega DOCX validados</Badge>
          <h1>Peças previdenciárias com a identidade do escritório.</h1>
          <p>
            O motor gera, revisa e entrega documentos privados sem cruzar dados entre escritórios.
          </p>
          <Link className="primary-button link-button" href="/entrar">Acessar o portal</Link>
        </div>

        <Card className="status-card">
          <span className="eyebrow">Status da construção</span>
          <strong>Portal do advogado disponível</strong>
          <ul>
            <li>Next.js 15, React 19 e TypeScript</li>
            <li>pgvector com 1.024 dimensões</li>
            <li>Buckets privados</li>
            <li>RLS por escritório</li>
            <li>DOCX tradicional e Visual Law</li>
          </ul>
        </Card>
      </section>

      <section className="container foundation-section" aria-labelledby="fundacoes">
        <h2 id="fundacoes">Fundações do produto</h2>
        <div className="card-grid">
          {foundations.map((foundation) => (
            <Card key={foundation.title}>
              <h3>{foundation.title}</h3>
              <p>{foundation.description}</p>
            </Card>
          ))}
        </div>
      </section>

      <footer>
        <div className="container footer-content">
          <strong>Córtex Previdenciário</strong>
          <span>Minutas assistidas por IA sempre exigem revisão profissional.</span>
        </div>
      </footer>
    </main>
  );
}
