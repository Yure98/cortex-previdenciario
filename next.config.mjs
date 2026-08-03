/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    outputFileTracingIncludes: {
      "/api/gerar": [
        "./packages/cortex-agentes/BIBLIA-DE-PROMPTS-PREVIDENCIARIO.md",
        "./packages/cortex-agentes/commands/cnis.md",
        "./packages/cortex-agentes/commands/peticionar.md",
        "./packages/cortex-agentes/skills/calculos-previdenciarios/**/*",
        "./packages/cortex-agentes/skills/estagiario-peticoes/SKILL.md",
        "./packages/cortex-agentes/skills/estagiario-peticoes/agents/analista.md",
        "./packages/cortex-agentes/skills/estagiario-peticoes/agents/redator.md",
        "./packages/cortex-agentes/skills/estagiario-peticoes/agents/revisor.md",
      ],
    },
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
};

export default nextConfig;
