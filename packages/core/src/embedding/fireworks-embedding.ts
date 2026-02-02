import { OpenAIEmbedding } from "./openai-embedding";

export interface FireworksEmbeddingConfig {
  model?: string;
  apiKey: string;
}

export class FireworksEmbedding extends OpenAIEmbedding {
  private static readonly FIREWORKS_BASE_URL =
    "https://api.fireworks.ai/inference/v1";
  private static readonly DEFAULT_MODEL = "fireworks/qwen3-embedding-8b";

  constructor(config: FireworksEmbeddingConfig) {
    super({
      apiKey: config.apiKey,
      baseURL: FireworksEmbedding.FIREWORKS_BASE_URL,
      model: config.model || FireworksEmbedding.DEFAULT_MODEL,
    });
  }

  getProvider(): string {
    return "Fireworks";
  }

  getDimension(): number {
    const model = this.getModelName();
    const knownModels = FireworksEmbedding.getSupportedModels();

    if (knownModels[model]) {
      return knownModels[model].dimension;
    }

    // Fall back to parent implementation for unknown models
    return super.getDimension();
  }

  /**
   * Get current model name
   */
  private getModelName(): string {
    // Access the config through a method since it's private in parent
    return (this as any).config?.model || FireworksEmbedding.DEFAULT_MODEL;
  }

  /**
   * Get list of supported Fireworks embedding models
   */
  static getSupportedModels(): Record<
    string,
    { dimension: number; description: string }
  > {
    return {
      // Qwen3 Embedding models (recommended)
      "fireworks/qwen3-embedding-8b": {
        dimension: 4096,
        description:
          "Qwen3 Embedding 8B - highest quality embeddings, 40960 context (recommended)",
      },
      "fireworks/qwen3-embedding-4b": {
        dimension: 2560,
        description:
          "Qwen3 Embedding 4B - balanced quality and speed, 40960 context",
      },
      "fireworks/qwen3-embedding-0.6b": {
        dimension: 1024,
        description:
          "Qwen3 Embedding 0.6B - fast and lightweight, 32768 context",
      },
    };
  }
}
