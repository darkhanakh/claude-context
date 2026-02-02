import { SparseVector } from "../vectordb/types";

/**
 * Configuration for sparse embedding generation
 */
export interface SparseEmbeddingConfig {
  /**
   * BM25 k1 parameter - controls term frequency saturation
   * Higher values increase the influence of term frequency
   * Default: 1.2 (typical range: 1.2-2.0)
   */
  k1?: number;

  /**
   * BM25 b parameter - controls document length normalization
   * b=0: no length normalization, b=1: full length normalization
   * Default: 0.75
   */
  b?: number;

  /**
   * Minimum document frequency for a term to be included
   * Terms appearing in fewer documents will be excluded
   * Default: 1
   */
  minDf?: number;

  /**
   * Maximum document frequency ratio for a term
   * Terms appearing in more than this ratio of documents are excluded (stop words)
   * Default: 0.85 (85% of documents)
   */
  maxDfRatio?: number;

  /**
   * Whether to use sublinear term frequency scaling: 1 + log(tf)
   * Default: false
   */
  sublinearTf?: boolean;

  /**
   * Tokenization mode
   * - 'simple': splits on whitespace and punctuation
   * - 'code': handles code-specific tokens (camelCase, snake_case, etc.)
   * Default: 'code'
   */
  tokenMode?: "simple" | "code";
}

/**
 * Sparse embedding generator using BM25 algorithm
 *
 * BM25 (Best Matching 25) is a ranking function used in information retrieval
 * that produces sparse vectors where each dimension corresponds to a vocabulary term
 * and the value represents the term's importance in the document.
 *
 * This implementation is optimized for code search scenarios.
 */
export class SparseEmbedding {
  private config: Required<SparseEmbeddingConfig>;
  private vocabulary: Map<string, number> = new Map(); // term -> index
  private documentFrequency: Map<string, number> = new Map(); // term -> doc count
  private totalDocuments: number = 0;
  private avgDocumentLength: number = 0;
  private idfCache: Map<string, number> = new Map(); // term -> IDF score
  private isInitialized: boolean = false;

  constructor(config: SparseEmbeddingConfig = {}) {
    this.config = {
      k1: config.k1 ?? 1.2,
      b: config.b ?? 0.75,
      minDf: config.minDf ?? 1,
      maxDfRatio: config.maxDfRatio ?? 0.85,
      sublinearTf: config.sublinearTf ?? false,
      tokenMode: config.tokenMode ?? "code",
    };
  }

  /**
   * Get provider name
   */
  getProvider(): string {
    return "BM25-Sparse";
  }

  /**
   * Tokenize text into terms based on the configured mode
   */
  private tokenize(text: string): string[] {
    if (this.config.tokenMode === "code") {
      return this.tokenizeCode(text);
    }
    return this.tokenizeSimple(text);
  }

  /**
   * Simple tokenization: split on whitespace and punctuation
   */
  private tokenizeSimple(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[\s\p{P}]+/u)
      .filter((token) => token.length > 1);
  }

  /**
   * Code-aware tokenization: handles camelCase, snake_case, and code constructs
   */
  private tokenizeCode(text: string): string[] {
    const tokens: string[] = [];

    // Split on whitespace and common delimiters first
    const segments = text.split(/[\s,;:{}()\[\]<>'"=+\-*/\\|&^%$#@!~`]+/);

    for (const segment of segments) {
      if (!segment) continue;

      // Handle camelCase and PascalCase
      const camelSplit = segment.replace(/([a-z])([A-Z])/g, "$1 $2");

      // Handle snake_case and kebab-case
      const underscoreSplit = camelSplit.replace(/[_-]+/g, " ");

      // Handle consecutive uppercase (like "XMLParser" -> "XML Parser")
      const acronymSplit = underscoreSplit.replace(
        /([A-Z]+)([A-Z][a-z])/g,
        "$1 $2"
      );

      // Split and lowercase
      const parts = acronymSplit.split(/\s+/);

      for (const part of parts) {
        const lower = part.toLowerCase();
        // Filter out single characters and very common programming tokens
        if (lower.length > 1 && !this.isStopToken(lower)) {
          tokens.push(lower);
        }
      }
    }

    return tokens;
  }

  /**
   * Check if a token is a common stop word or programming keyword to filter
   */
  private isStopToken(token: string): boolean {
    const stopTokens = new Set([
      // Common stop words
      "the",
      "is",
      "at",
      "of",
      "on",
      "and",
      "or",
      "to",
      "in",
      "it",
      "for",
      "as",
      "be",
      "by",
      "an",
      "if",
      "do",
      "no",
      "so",
      // Very common programming keywords (too generic)
      "var",
      "let",
      "const",
      "this",
      "that",
      "new",
      "null",
      "true",
      "false",
    ]);
    return stopTokens.has(token);
  }

  /**
   * Build vocabulary and compute document frequencies from a corpus
   * This must be called before generating embeddings
   */
  buildVocabulary(documents: string[]): void {
    this.vocabulary.clear();
    this.documentFrequency.clear();
    this.idfCache.clear();
    this.totalDocuments = documents.length;

    if (documents.length === 0) {
      this.isInitialized = true;
      return;
    }

    // Count document frequencies
    let totalLength = 0;
    const termDocs = new Map<string, Set<number>>();

    documents.forEach((doc, docIndex) => {
      const tokens = this.tokenize(doc);
      totalLength += tokens.length;

      const uniqueTerms = new Set(tokens);
      for (const term of uniqueTerms) {
        if (!termDocs.has(term)) {
          termDocs.set(term, new Set());
        }
        termDocs.get(term)!.add(docIndex);
      }
    });

    this.avgDocumentLength = totalLength / documents.length;

    // Filter terms by document frequency
    const maxDf = Math.floor(this.config.maxDfRatio * documents.length);

    let vocabIndex = 0;
    for (const [term, docs] of termDocs) {
      const df = docs.size;
      if (df >= this.config.minDf && df <= maxDf) {
        this.vocabulary.set(term, vocabIndex++);
        this.documentFrequency.set(term, df);

        // Pre-compute IDF: log((N - df + 0.5) / (df + 0.5) + 1)
        const idf = Math.log(
          (this.totalDocuments - df + 0.5) / (df + 0.5) + 1
        );
        this.idfCache.set(term, idf);
      }
    }

    this.isInitialized = true;
    console.log(
      `[SparseEmbedding] Built vocabulary with ${this.vocabulary.size} terms from ${documents.length} documents`
    );
  }

  /**
   * Get vocabulary size
   */
  getVocabularySize(): number {
    return this.vocabulary.size;
  }

  /**
   * Generate sparse embedding for a single document
   */
  embed(text: string): SparseVector {
    if (!this.isInitialized) {
      // If not initialized, build vocabulary from this single document
      // This is a fallback - ideally buildVocabulary should be called with corpus
      console.warn(
        "[SparseEmbedding] Vocabulary not built. Building from single document..."
      );
      this.buildVocabulary([text]);
    }

    const tokens = this.tokenize(text);
    const docLength = tokens.length;

    if (docLength === 0) {
      return { indices: [], values: [] };
    }

    // Count term frequencies
    const termFreq = new Map<string, number>();
    for (const token of tokens) {
      if (this.vocabulary.has(token)) {
        termFreq.set(token, (termFreq.get(token) || 0) + 1);
      }
    }

    // Calculate BM25 scores
    const indices: number[] = [];
    const values: number[] = [];

    for (const [term, tf] of termFreq) {
      const index = this.vocabulary.get(term)!;
      const idf = this.idfCache.get(term) || 0;

      // Apply sublinear TF scaling if configured
      const adjustedTf = this.config.sublinearTf ? 1 + Math.log(tf) : tf;

      // BM25 score: IDF * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLen / avgDocLen)))
      const numerator = adjustedTf * (this.config.k1 + 1);
      const denominator =
        adjustedTf +
        this.config.k1 *
          (1 -
            this.config.b +
            this.config.b * (docLength / (this.avgDocumentLength || 1)));

      const score = idf * (numerator / denominator);

      if (score > 0) {
        indices.push(index);
        values.push(score);
      }
    }

    return { indices, values };
  }

  /**
   * Generate sparse embeddings for multiple documents (batch)
   */
  embedBatch(texts: string[]): SparseVector[] {
    return texts.map((text) => this.embed(text));
  }

  /**
   * Generate query embedding with slightly different weighting
   * For queries, we often want to boost rare terms more
   */
  embedQuery(text: string): SparseVector {
    // Use the same embedding for now, but this could be customized
    // For example, with a higher k1 value for queries
    return this.embed(text);
  }

  /**
   * Export vocabulary and IDF scores for persistence
   */
  exportState(): {
    vocabulary: [string, number][];
    documentFrequency: [string, number][];
    idfCache: [string, number][];
    totalDocuments: number;
    avgDocumentLength: number;
    config: Required<SparseEmbeddingConfig>;
  } {
    return {
      vocabulary: Array.from(this.vocabulary.entries()),
      documentFrequency: Array.from(this.documentFrequency.entries()),
      idfCache: Array.from(this.idfCache.entries()),
      totalDocuments: this.totalDocuments,
      avgDocumentLength: this.avgDocumentLength,
      config: this.config,
    };
  }

  /**
   * Import previously exported state
   */
  importState(state: {
    vocabulary: [string, number][];
    documentFrequency: [string, number][];
    idfCache: [string, number][];
    totalDocuments: number;
    avgDocumentLength: number;
    config?: Required<SparseEmbeddingConfig>;
  }): void {
    this.vocabulary = new Map(state.vocabulary);
    this.documentFrequency = new Map(state.documentFrequency);
    this.idfCache = new Map(state.idfCache);
    this.totalDocuments = state.totalDocuments;
    this.avgDocumentLength = state.avgDocumentLength;
    if (state.config) {
      this.config = state.config;
    }
    this.isInitialized = true;
    console.log(
      `[SparseEmbedding] Imported vocabulary with ${this.vocabulary.size} terms`
    );
  }

  /**
   * Clear the vocabulary and reset state
   */
  clear(): void {
    this.vocabulary.clear();
    this.documentFrequency.clear();
    this.idfCache.clear();
    this.totalDocuments = 0;
    this.avgDocumentLength = 0;
    this.isInitialized = false;
  }

  /**
   * Check if the embedding model is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get configuration
   */
  getConfig(): Required<SparseEmbeddingConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration (requires rebuilding vocabulary)
   */
  updateConfig(config: Partial<SparseEmbeddingConfig>): void {
    this.config = { ...this.config, ...config };
    // Note: If vocabulary is already built, it should be rebuilt with new config
    if (this.isInitialized) {
      console.warn(
        "[SparseEmbedding] Config updated. Consider rebuilding vocabulary for changes to take effect."
      );
    }
  }
}

/**
 * Factory function to create a sparse embedding instance with default code search settings
 */
export function createCodeSparseEmbedding(): SparseEmbedding {
  return new SparseEmbedding({
    k1: 1.5, // Slightly higher for code (more term frequency influence)
    b: 0.75,
    minDf: 1,
    maxDfRatio: 0.8,
    sublinearTf: false,
    tokenMode: "code",
  });
}

/**
 * Factory function to create a sparse embedding instance optimized for natural language
 */
export function createTextSparseEmbedding(): SparseEmbedding {
  return new SparseEmbedding({
    k1: 1.2,
    b: 0.75,
    minDf: 2,
    maxDfRatio: 0.85,
    sublinearTf: true,
    tokenMode: "simple",
  });
}
