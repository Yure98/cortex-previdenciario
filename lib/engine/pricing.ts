export interface AnthropicPricing {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

export interface AnthropicUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export function estimateTokenUpperBound(...texts: string[]): number {
  const characters = texts.reduce((total, value) => total + value.length, 0);
  return Math.max(1, Math.ceil(characters / 2.5) + 64);
}

export function estimateAnthropicReservationUsd(
  inputTokens: number,
  maxOutputTokens: number,
  pricing: AnthropicPricing,
): number {
  return (
    (inputTokens * pricing.inputUsdPerMillion * 1.25 +
      maxOutputTokens * pricing.outputUsdPerMillion) /
    1_000_000
  );
}

export function calculateAnthropicCostUsd(
  usage: AnthropicUsage,
  pricing: AnthropicPricing,
): number {
  const inputCost = usage.inputTokens * pricing.inputUsdPerMillion;
  const outputCost = usage.outputTokens * pricing.outputUsdPerMillion;
  const cacheWriteCost = usage.cacheCreationInputTokens * pricing.inputUsdPerMillion * 1.25;
  const cacheReadCost = usage.cacheReadInputTokens * pricing.inputUsdPerMillion * 0.1;

  return (inputCost + outputCost + cacheWriteCost + cacheReadCost) / 1_000_000;
}

export function calculateEmbeddingCostUsd(tokens: number, usdPerMillion: number): number {
  return (tokens * usdPerMillion) / 1_000_000;
}
