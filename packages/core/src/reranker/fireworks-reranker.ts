import {
  Reranker,
  RerankDocument,
  RerankResult,
  RerankOptions,
} from "./base-reranker";

export interface FireworksRerankerConfig {
  apiKey: string;
  model?: string;
  baseURL?: string;
}

export class FireworksReranker extends Reranker {
  private apiKey: string;
  private model: string;
  private baseURL: string;

  private static readonly DEFAULT_MODEL = "fireworks/qwen3-reranker-8b";
  private static readonly DEFAULT_BASE_URL =
    "https://api.fireworks.ai/inference/v1";

  constructor(config: FireworksRerankerConfig) {
    super();
    this.apiKey = config.apiKey;
    this.model = config.model || FireworksReranker.DEFAULT_MODEL;
    this.baseURL = config.baseURL || FireworksReranker.DEFAULT_BASE_URL;
  }

  async rerank(
    query: string,
    documents: RerankDocument[],
    options?: RerankOptions,
  ): Promise<RerankResult[]> {
    if (documents.length === 0) {
      return [];
    }

    const topN = options?.topN || documents.length;
    const threshold = options?.threshold;

    try {
      console.log(
        `[FireworksReranker] 🔄 Reranking ${documents.length} documents with ${this.model}`,
      );

      const response = await fetch(`${this.baseURL}/rerank`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          query: query,
          documents: documents.map((doc) => doc.content),
          top_n: topN,
          return_documents: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Rerank API error: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as {
        data: Array<{ index: number; relevance_score: number }>;
      };

      // Map results back to our format
      const results: RerankResult[] = data.data.map((result) => ({
        document: documents[result.index],
        relevanceScore: result.relevance_score,
        index: result.index,
      }));

      // Filter by threshold if specified
      const filteredResults = threshold
        ? results.filter((r) => r.relevanceScore >= threshold)
        : results;

      console.log(
        `[FireworksReranker] ✅ Reranked to ${filteredResults.length} results (top score: ${filteredResults[0]?.relevanceScore.toFixed(4) || "N/A"})`,
      );

      return filteredResults;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[FireworksReranker] ❌ Reranking failed: ${errorMessage}`);
      throw new Error(`Failed to rerank documents: ${errorMessage}`);
    }
  }

  getProvider(): string {
    return "Fireworks";
  }

  getModel(): string {
    return this.model;
  }

  /**
   * Get list of supported Fireworks reranker models
   */
  static getSupportedModels(): Record<string, { description: string }> {
    return {
      "fireworks/qwen3-reranker-8b": {
        description:
          "Qwen3 Reranker 8B - highest quality reranking (recommended)",
      },
      "fireworks/qwen3-reranker-4b": {
        description: "Qwen3 Reranker 4B - balanced quality and speed",
      },
      "fireworks/qwen3-reranker-0p6b": {
        description: "Qwen3 Reranker 0.6B - fast and lightweight",
      },
    };
  }
}
