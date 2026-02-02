import { QdrantClient } from "@qdrant/js-client-rest";
import {
  VectorDocument,
  SearchOptions,
  VectorSearchResult,
  VectorDatabase,
  HybridSearchRequest,
  HybridSearchOptions,
  HybridSearchResult,
  SparseVector,
} from "./types";

export interface QdrantConfig {
  url?: string;
  host?: string;
  port?: number;
  apiKey?: string;
  https?: boolean;
}

export class QdrantVectorDatabase implements VectorDatabase {
  private client: QdrantClient;
  private config: QdrantConfig;
  private hybridCollections: Set<string> = new Set();

  constructor(config: QdrantConfig = {}) {
    this.config = config;

    // Default to localhost:6333 if no configuration provided
    const url =
      config.url ||
      `http://${config.host || "localhost"}:${config.port || 6333}`;

    this.client = new QdrantClient({
      url: url,
      apiKey: config.apiKey,
      checkCompatibility: false, // Disable version check to support newer Qdrant servers
    });

    console.log(`[QdrantDB] 🔌 Connecting to Qdrant at: ${url}`);
  }

  /**
   * Check if a collection uses named vectors (hybrid mode)
   */
  private async isHybridCollection(collectionName: string): Promise<boolean> {
    // Check cache first
    if (this.hybridCollections.has(collectionName)) {
      return true;
    }

    try {
      const collectionInfo = await this.client.getCollection(collectionName);
      // Check if vectors config has named vectors (like "dense")
      const vectorsConfig = collectionInfo.config?.params?.vectors;
      if (
        vectorsConfig &&
        typeof vectorsConfig === "object" &&
        "dense" in vectorsConfig
      ) {
        this.hybridCollections.add(collectionName);
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async createCollection(
    collectionName: string,
    dimension: number,
    description?: string,
  ): Promise<void> {
    try {
      // Check if collection already exists
      const exists = await this.hasCollection(collectionName);
      if (exists) {
        console.log(
          `[QdrantDB] ℹ️ Collection '${collectionName}' already exists, skipping creation`,
        );
        return;
      }

      await this.client.createCollection(collectionName, {
        vectors: {
          size: dimension,
          distance: "Cosine",
        },
      });

      console.log(
        `[QdrantDB] ✅ Created collection '${collectionName}' with dimension ${dimension}`,
      );
    } catch (error) {
      console.error(
        `[QdrantDB] ❌ Failed to create collection '${collectionName}':`,
        error,
      );
      throw error;
    }
  }

  async createHybridCollection(
    collectionName: string,
    dimension: number,
    description?: string,
  ): Promise<void> {
    try {
      const exists = await this.hasCollection(collectionName);
      if (exists) {
        console.log(
          `[QdrantDB] ℹ️ Hybrid collection '${collectionName}' already exists, skipping creation`,
        );
        return;
      }

      // Qdrant supports named vectors for hybrid search
      await this.client.createCollection(collectionName, {
        vectors: {
          dense: {
            size: dimension,
            distance: "Cosine",
          },
        },
        sparse_vectors: {
          sparse: {},
        },
      });

      // Track this as a hybrid collection
      this.hybridCollections.add(collectionName);

      console.log(
        `[QdrantDB] ✅ Created hybrid collection '${collectionName}' with dimension ${dimension}`,
      );
    } catch (error) {
      console.error(
        `[QdrantDB] ❌ Failed to create hybrid collection '${collectionName}':`,
        error,
      );
      throw error;
    }
  }

  async dropCollection(collectionName: string): Promise<void> {
    try {
      await this.client.deleteCollection(collectionName);
      console.log(`[QdrantDB] 🗑️ Dropped collection '${collectionName}'`);
    } catch (error) {
      console.error(
        `[QdrantDB] ❌ Failed to drop collection '${collectionName}':`,
        error,
      );
      throw error;
    }
  }

  async hasCollection(collectionName: string): Promise<boolean> {
    try {
      const collections = await this.client.getCollections();
      return collections.collections.some((c) => c.name === collectionName);
    } catch (error) {
      console.error(
        `[QdrantDB] ❌ Failed to check collection '${collectionName}':`,
        error,
      );
      return false;
    }
  }

  async listCollections(): Promise<string[]> {
    try {
      const collections = await this.client.getCollections();
      return collections.collections.map((c) => c.name);
    } catch (error) {
      console.error(`[QdrantDB] ❌ Failed to list collections:`, error);
      throw error;
    }
  }

  async insert(
    collectionName: string,
    documents: VectorDocument[],
  ): Promise<void> {
    try {
      const points = documents.map((doc) => ({
        id: this.stringToUuid(doc.id),
        vector: doc.vector,
        payload: {
          id: doc.id,
          content: doc.content,
          relativePath: doc.relativePath,
          startLine: doc.startLine,
          endLine: doc.endLine,
          fileExtension: doc.fileExtension,
          metadata: doc.metadata,
        },
      }));

      // Qdrant has a limit on batch size, so we chunk the inserts
      const batchSize = 100;
      for (let i = 0; i < points.length; i += batchSize) {
        const batch = points.slice(i, i + batchSize);
        await this.client.upsert(collectionName, {
          wait: true,
          points: batch,
        });
      }

      console.log(
        `[QdrantDB] ✅ Inserted ${documents.length} documents into '${collectionName}'`,
      );
    } catch (error) {
      console.error(
        `[QdrantDB] ❌ Failed to insert documents into '${collectionName}':`,
        error,
      );
      throw error;
    }
  }

  async insertHybrid(
    collectionName: string,
    documents: VectorDocument[],
  ): Promise<void> {
    try {
      const points = documents.map((doc) => {
        // Build vector object with dense vector
        const vector: Record<
          string,
          number[] | { indices: number[]; values: number[] }
        > = {
          dense: doc.vector,
        };

        // Add sparse vector if available
        if (doc.sparseVector && doc.sparseVector.indices.length > 0) {
          vector.sparse = {
            indices: doc.sparseVector.indices,
            values: doc.sparseVector.values,
          };
        }

        return {
          id: this.stringToUuid(doc.id),
          vector,
          payload: {
            id: doc.id,
            content: doc.content,
            relativePath: doc.relativePath,
            startLine: doc.startLine,
            endLine: doc.endLine,
            fileExtension: doc.fileExtension,
            metadata: doc.metadata,
          },
        };
      });

      const batchSize = 100;
      for (let i = 0; i < points.length; i += batchSize) {
        const batch = points.slice(i, i + batchSize);
        await this.client.upsert(collectionName, {
          wait: true,
          points: batch,
        });
      }

      const sparseCount = documents.filter(
        (d) => d.sparseVector && d.sparseVector.indices.length > 0,
      ).length;
      console.log(
        `[QdrantDB] ✅ Inserted ${documents.length} hybrid documents into '${collectionName}' (${sparseCount} with sparse vectors)`,
      );
    } catch (error) {
      console.error(
        `[QdrantDB] ❌ Failed to insert hybrid documents into '${collectionName}':`,
        error,
      );
      throw error;
    }
  }

  async search(
    collectionName: string,
    queryVector: number[],
    options?: SearchOptions,
  ): Promise<VectorSearchResult[]> {
    try {
      const limit = options?.topK || 10;
      const scoreThreshold = options?.threshold;

      // Build filter if filterExpr is provided
      let filter: any = undefined;
      if (options?.filterExpr) {
        filter = this.parseFilterExpression(options.filterExpr);
      }

      // Check if this is a hybrid collection with named vectors
      const isHybrid = await this.isHybridCollection(collectionName);

      const searchResult = await this.client.search(collectionName, {
        vector: isHybrid ? { name: "dense", vector: queryVector } : queryVector,
        limit: limit,
        score_threshold: scoreThreshold,
        filter: filter,
        with_payload: true,
      });

      return searchResult.map((result) => {
        const payload = result.payload as any;
        return {
          document: {
            id: payload.id || String(result.id),
            vector: queryVector,
            content: payload.content || "",
            relativePath: payload.relativePath || "",
            startLine: payload.startLine || 0,
            endLine: payload.endLine || 0,
            fileExtension: payload.fileExtension || "",
            metadata: payload.metadata || {},
          },
          score: result.score,
        };
      });
    } catch (error) {
      console.error(
        `[QdrantDB] ❌ Failed to search in '${collectionName}':`,
        error,
      );
      throw error;
    }
  }

  async hybridSearch(
    collectionName: string,
    searchRequests: HybridSearchRequest[],
    options?: HybridSearchOptions,
  ): Promise<HybridSearchResult[]> {
    try {
      // For Qdrant hybrid search, we perform searches on each vector type
      // and then combine results using RRF (Reciprocal Rank Fusion) or weighted scoring
      const limit = options?.limit || 10;
      const allResults: Map<
        string,
        { document: VectorDocument; scores: number[] }
      > = new Map();

      for (const request of searchRequests) {
        if (typeof request.data === "string") {
          // Text search not directly supported, skip
          console.warn(
            `[QdrantDB] ⚠️ Text-based hybrid search not supported, skipping request`,
          );
          continue;
        }

        // Check if this is a sparse vector search
        const isSparseSearch = this.isSparseVector(request.data);
        const isSparseField =
          request.anns_field === "sparse_vector" ||
          request.anns_field === "sparse" ||
          request.anns_field?.includes("sparse");

        // For hybrid collections, use "dense" or "sparse" as the vector name
        // For regular collections, use unnamed vector
        const isHybrid = await this.isHybridCollection(collectionName);

        let filter: any = undefined;
        if (options?.filterExpr) {
          filter = this.parseFilterExpression(options.filterExpr);
        }

        let searchResult;

        if (isSparseSearch || isSparseField) {
          // Handle sparse vector search
          const sparseData = request.data as SparseVector;
          if (!sparseData.indices || sparseData.indices.length === 0) {
            console.log(`[QdrantDB] ⏭️ Skipping empty sparse vector search`);
            continue;
          }

          console.log(
            `[QdrantDB] 🔍 Performing sparse vector search with ${sparseData.indices.length} non-zero terms`,
          );

          searchResult = await this.client.search(collectionName, {
            vector: {
              name: "sparse",
              vector: sparseData,
            },
            limit: request.limit || limit,
            filter: filter,
            with_payload: true,
          });
        } else {
          // Handle dense vector search
          const denseData = request.data as number[];
          const vectorName = isHybrid ? "dense" : undefined;

          searchResult = await this.client.search(collectionName, {
            vector: vectorName
              ? { name: vectorName, vector: denseData }
              : denseData,
            limit: request.limit || limit,
            filter: filter,
            with_payload: true,
          });
        }

        for (const result of searchResult) {
          const payload = result.payload as any;
          const docId = payload.id || String(result.id);

          if (!allResults.has(docId)) {
            allResults.set(docId, {
              document: {
                id: docId,
                vector: Array.isArray(request.data) ? request.data : [],
                content: payload.content || "",
                relativePath: payload.relativePath || "",
                startLine: payload.startLine || 0,
                endLine: payload.endLine || 0,
                fileExtension: payload.fileExtension || "",
                metadata: payload.metadata || {},
              },
              scores: [],
            });
          }
          allResults.get(docId)!.scores.push(result.score);
        }
      }

      // Apply reranking strategy (default to RRF)
      const rerankedResults = this.applyReranking(allResults, options?.rerank);

      return rerankedResults.slice(0, limit);
    } catch (error) {
      console.error(
        `[QdrantDB] ❌ Failed to perform hybrid search in '${collectionName}':`,
        error,
      );
      throw error;
    }
  }

  /**
   * Check if data is a sparse vector (has indices and values properties)
   */
  private isSparseVector(
    data: number[] | SparseVector | string,
  ): data is SparseVector {
    return (
      typeof data === "object" &&
      !Array.isArray(data) &&
      "indices" in data &&
      "values" in data
    );
  }

  async delete(collectionName: string, ids: string[]): Promise<void> {
    try {
      const pointIds = ids.map((id) => this.stringToUuid(id));

      await this.client.delete(collectionName, {
        wait: true,
        points: pointIds,
      });

      console.log(
        `[QdrantDB] 🗑️ Deleted ${ids.length} documents from '${collectionName}'`,
      );
    } catch (error) {
      console.error(
        `[QdrantDB] ❌ Failed to delete documents from '${collectionName}':`,
        error,
      );
      throw error;
    }
  }

  async query(
    collectionName: string,
    filter: string,
    outputFields: string[],
    limit?: number,
  ): Promise<Record<string, any>[]> {
    try {
      const qdrantFilter = filter
        ? this.parseFilterExpression(filter)
        : undefined;

      const result = await this.client.scroll(collectionName, {
        filter: qdrantFilter,
        limit: limit || 100,
        with_payload: true,
        with_vector: outputFields.includes("vector"),
      });

      return result.points.map((point) => {
        const payload = point.payload as Record<string, any>;
        const output: Record<string, any> = {};

        for (const field of outputFields) {
          if (field === "vector" && point.vector) {
            output[field] = point.vector;
          } else if (payload && field in payload) {
            // Stringify objects for compatibility with Milvus-style queries
            const value = payload[field];
            if (typeof value === "object" && value !== null) {
              output[field] = JSON.stringify(value);
            } else {
              output[field] = value;
            }
          }
        }

        return output;
      });
    } catch (error) {
      console.error(
        `[QdrantDB] ❌ Failed to query collection '${collectionName}':`,
        error,
      );
      throw error;
    }
  }

  async checkCollectionLimit(): Promise<boolean> {
    // Qdrant doesn't have collection limits like Zilliz Cloud
    // Always return true for local Qdrant
    return true;
  }

  /**
   * Convert string ID to UUID format for Qdrant
   * Qdrant requires either unsigned integers or UUIDs as point IDs
   */
  private stringToUuid(str: string): string {
    // Create a deterministic UUID-like string from the input
    // Using a simple hash-based approach
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }

    // Convert to positive number and create UUID-like format
    const positiveHash = Math.abs(hash);
    const hex = positiveHash.toString(16).padStart(8, "0");
    const hex2 = str.length.toString(16).padStart(4, "0");
    const hex3 = Date.now().toString(16).slice(-4);

    // Create a stable UUID by hashing the entire string
    let fullHash = 0;
    for (let i = 0; i < str.length; i++) {
      fullHash = ((fullHash << 5) - fullHash + str.charCodeAt(i)) | 0;
    }
    const hex4 = Math.abs(fullHash).toString(16).padStart(4, "0").slice(0, 4);
    const hex5 = Math.abs(fullHash >> 16)
      .toString(16)
      .padStart(12, "0")
      .slice(0, 12);

    return `${hex.slice(0, 8)}-${hex2}-4${hex3.slice(1)}-${hex4}-${hex5}`;
  }

  /**
   * Parse filter expression to Qdrant filter format
   * Supports basic expressions like: fileExtension in [".ts", ".py"]
   */
  private parseFilterExpression(expr: string): any {
    if (!expr || expr.trim() === "") {
      return undefined;
    }

    // Handle "field in [values]" pattern
    const inMatch = expr.match(/(\w+)\s+in\s+\[([^\]]+)\]/i);
    if (inMatch) {
      const field = inMatch[1];
      const valuesStr = inMatch[2];
      const values = valuesStr
        .split(",")
        .map((v) => v.trim().replace(/['"]/g, ""));

      return {
        should: values.map((value) => ({
          key: field,
          match: { value },
        })),
      };
    }

    // Handle "field == value" pattern
    const eqMatch = expr.match(/(\w+)\s*==\s*["']?([^"']+)["']?/);
    if (eqMatch) {
      return {
        must: [
          {
            key: eqMatch[1],
            match: { value: eqMatch[2] },
          },
        ],
      };
    }

    // Handle "field != value" pattern
    const neqMatch = expr.match(/(\w+)\s*!=\s*["']?([^"']+)["']?/);
    if (neqMatch) {
      return {
        must_not: [
          {
            key: neqMatch[1],
            match: { value: neqMatch[2] },
          },
        ],
      };
    }

    console.warn(
      `[QdrantDB] ⚠️ Could not parse filter expression: ${expr}, ignoring filter`,
    );
    return undefined;
  }

  /**
   * Apply reranking strategy to combined search results
   */
  private applyReranking(
    results: Map<string, { document: VectorDocument; scores: number[] }>,
    rerank?: { strategy: string; params?: Record<string, any> },
  ): HybridSearchResult[] {
    const strategy = rerank?.strategy || "rrf";

    if (strategy === "rrf") {
      // Reciprocal Rank Fusion
      const k = rerank?.params?.k || 60;
      const rankedResults: { document: VectorDocument; score: number }[] = [];

      for (const [, { document, scores }] of results) {
        // RRF score: sum of 1/(k + rank) for each ranking
        const rrfScore = scores.reduce(
          (sum, _, idx) => sum + 1 / (k + idx + 1),
          0,
        );
        rankedResults.push({ document, score: rrfScore });
      }

      return rankedResults.sort((a, b) => b.score - a.score);
    } else if (strategy === "weighted") {
      // Weighted combination
      const weights = rerank?.params?.weights || [0.5, 0.5];
      const rankedResults: { document: VectorDocument; score: number }[] = [];

      for (const [, { document, scores }] of results) {
        let weightedScore = 0;
        for (let i = 0; i < scores.length; i++) {
          weightedScore += scores[i] * (weights[i] || 1 / scores.length);
        }
        rankedResults.push({ document, score: weightedScore });
      }

      return rankedResults.sort((a, b) => b.score - a.score);
    }

    // Default: average scores
    const rankedResults: { document: VectorDocument; score: number }[] = [];
    for (const [, { document, scores }] of results) {
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      rankedResults.push({ document, score: avgScore });
    }

    return rankedResults.sort((a, b) => b.score - a.score);
  }

  /**
   * Get the Qdrant client for advanced operations
   */
  getClient(): QdrantClient {
    return this.client;
  }
}
