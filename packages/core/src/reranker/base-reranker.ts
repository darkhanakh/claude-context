/**
 * Result item to be reranked
 */
export interface RerankDocument {
  id: string;
  content: string;
  metadata?: Record<string, any>;
}

/**
 * Reranked result with relevance score
 */
export interface RerankResult {
  document: RerankDocument;
  relevanceScore: number;
  index: number;
}

/**
 * Options for reranking
 */
export interface RerankOptions {
  topN?: number;
  returnDocuments?: boolean;
  threshold?: number;
}

/**
 * Abstract base class for reranker implementations
 */
export abstract class Reranker {
  /**
   * Rerank documents based on relevance to query
   * @param query The search query
   * @param documents Documents to rerank
   * @param options Reranking options
   * @returns Reranked documents sorted by relevance
   */
  abstract rerank(
    query: string,
    documents: RerankDocument[],
    options?: RerankOptions
  ): Promise<RerankResult[]>;

  /**
   * Get the reranker provider name
   */
  abstract getProvider(): string;

  /**
   * Get the model name being used
   */
  abstract getModel(): string;
}
