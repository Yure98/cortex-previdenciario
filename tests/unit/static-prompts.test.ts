import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildCachedPromptBlocks } from "@/lib/engine/anthropic";
import { loadStaticPrompt } from "@/lib/engine/static-prompts";

describe("prompts jurídicos estáticos", () => {
  it("inclui literalmente a skill e a referência sem dados do caso", async () => {
    const sourcePath = path.join(
      process.cwd(),
      "packages/cortex-agentes/skills/calculos-previdenciarios/references/regras-calculo.md",
    );
    const source = await readFile(sourcePath, "utf8");
    const prompt = await loadStaticPrompt("analise");

    expect(prompt).toContain(source);
    expect(prompt).toContain("ENVELOPE DE EXECUCAO DO CORTEX PREVIDENCIARIO");
    expect(prompt).not.toContain("123.456.789-00");
    expect(prompt.length).toBeGreaterThan(10_000);
  });

  it("marca somente o bloco estático como ephemeral", () => {
    const blocks = buildCachedPromptBlocks("skill estática", "caso dinâmico");
    expect(blocks.system[0]).toMatchObject({
      text: "skill estática",
      cache_control: { type: "ephemeral" },
    });
    expect(blocks.messages[0].content[0]).toEqual({
      type: "text",
      text: "caso dinâmico",
    });
    expect(blocks.messages[0].content[0]).not.toHaveProperty("cache_control");
  });
});
