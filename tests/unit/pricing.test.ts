import { describe, expect, it } from "vitest";

import {
  calculateAnthropicCostUsd,
  estimateAnthropicReservationUsd,
} from "@/lib/engine/pricing";

const pricing = { inputUsdPerMillion: 2, outputUsdPerMillion: 10 };

describe("custos do motor", () => {
  it("reserva com o pior caso de cache write e saída máxima", () => {
    expect(estimateAnthropicReservationUsd(1_000, 1_000, pricing)).toBeCloseTo(0.0125, 10);
  });

  it("contabiliza input, output, cache write e cache read separadamente", () => {
    const cost = calculateAnthropicCostUsd(
      {
        inputTokens: 1_000,
        outputTokens: 500,
        cacheCreationInputTokens: 2_000,
        cacheReadInputTokens: 3_000,
      },
      pricing,
    );

    // 1000*2 + 500*10 + 2000*2*1.25 + 3000*2*0.1 = 12.600 USD/MTok
    expect(cost).toBeCloseTo(0.0126, 10);
  });
});
