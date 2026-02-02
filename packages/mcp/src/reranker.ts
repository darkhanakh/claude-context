import { FireworksReranker, Reranker } from "@zilliz/claude-context-core";
import { ContextMcpConfig } from "./config.js";

/**
 * Create a reranker instance based on configuration
 * Currently only supports Fireworks reranker (uses same API key as Fireworks embedding)
 */
export function createRerankerInstance(
  config: ContextMcpConfig,
): Reranker | undefined {
  if (!config.rerankerEnabled) {
    console.log(`[RERANKER] Reranking is disabled`);
    return undefined;
  }

  console.log(`[RERANKER] Creating reranker instance...`);

  // Reranker requires Fireworks API key (same as Fireworks embedding)
  if (!config.fireworksApiKey) {
    console.error(
      `[RERANKER] ❌ Fireworks API key is required for reranking but not provided`,
    );
    console.error(
      `[RERANKER] ❌ Set FIREWORKS_API_KEY environment variable to enable reranking`,
    );
    throw new Error(
      "FIREWORKS_API_KEY is required for reranking. Reranker uses Fireworks Qwen3 Reranker models.",
    );
  }

  const model = config.rerankerModel || "fireworks/qwen3-reranker-8b";
  console.log(`[RERANKER] 🔧 Configuring Fireworks reranker with model: ${model}`);

  const reranker = new FireworksReranker({
    apiKey: config.fireworksApiKey,
    model: model,
  });

  console.log(`[RERANKER] ✅ Fireworks reranker instance created successfully`);
  return reranker;
}

export function logRerankerInfo(
  config: ContextMcpConfig,
  reranker: Reranker | undefined,
): void {
  if (!reranker) {
    console.log(`[RERANKER] ℹ️ Reranking is disabled`);
    return;
  }

  console.log(
    `[RERANKER] ✅ Successfully initialized ${reranker.getProvider()} reranker`,
  );
  console.log(
    `[RERANKER] Reranker details - Provider: ${reranker.getProvider()}, Model: ${reranker.getModel()}`,
  );
}
