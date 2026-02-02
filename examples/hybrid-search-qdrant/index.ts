/**
 * Hybrid Search with Sparse Embeddings in Qdrant
 *
 * This example demonstrates how to use the BM25-based sparse embedding
 * combined with dense embeddings for hybrid search in Qdrant.
 *
 * Hybrid search combines:
 * - Dense embeddings: Semantic similarity (meaning-based)
 * - Sparse embeddings: Lexical matching (keyword-based, BM25)
 *
 * This approach often yields better results than either method alone,
 * especially for code search where both exact keyword matches and
 * semantic understanding are important.
 */

import {
  QdrantVectorDatabase,
  SparseEmbedding,
  createCodeSparseEmbedding,
  OpenAIEmbedding,
  VectorDocument,
  HybridSearchRequest,
  HybridSearchResult,
  VectorSearchResult,
} from "@zilliz/claude-context-core";

// Example code snippets to index
const codeSnippets = [
  {
    id: "1",
    content: `function calculateTotalPrice(items: CartItem[]): number {
  return items.reduce((total, item) => total + item.price * item.quantity, 0);
}`,
    relativePath: "src/utils/cart.ts",
    startLine: 10,
    endLine: 15,
  },
  {
    id: "2",
    content: `async function fetchUserProfile(userId: string): Promise<UserProfile> {
  const response = await fetch(\`/api/users/\${userId}\`);
  if (!response.ok) throw new Error('Failed to fetch user');
  return response.json();
}`,
    relativePath: "src/api/users.ts",
    startLine: 25,
    endLine: 32,
  },
  {
    id: "3",
    content: `class DatabaseConnection {
  private pool: ConnectionPool;

  async connect(): Promise<void> {
    this.pool = await createPool({ host: 'localhost', port: 5432 });
  }

  async query<T>(sql: string, params?: any[]): Promise<T[]> {
    const client = await this.pool.acquire();
    try {
      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  }
}`,
    relativePath: "src/database/connection.ts",
    startLine: 1,
    endLine: 18,
  },
  {
    id: "4",
    content: `export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}`,
    relativePath: "src/utils/validation.ts",
    startLine: 5,
    endLine: 10,
  },
  {
    id: "5",
    content: `interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface ShoppingCart {
  items: CartItem[];
  totalPrice: number;
  userId: string;
}`,
    relativePath: "src/types/cart.ts",
    startLine: 1,
    endLine: 14,
  },
];

async function main() {
  console.log("🚀 Hybrid Search with Sparse Embeddings Example\n");

  // Check for OpenAI API key
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    console.error("❌ OPENAI_API_KEY environment variable is required");
    console.log("Usage: OPENAI_API_KEY=sk-xxx npx ts-node index.ts");
    process.exit(1);
  }

  // Initialize components
  console.log("📦 Initializing components...\n");

  // 1. Initialize dense embedding (OpenAI)
  const denseEmbedding = new OpenAIEmbedding({
    apiKey: openaiApiKey,
    model: "text-embedding-3-small",
  });
  console.log(`  ✅ Dense embedding: OpenAI ${denseEmbedding.getProvider()}`);
  console.log(`     Dimension: ${denseEmbedding.getDimension()}`);

  // 2. Initialize sparse embedding (BM25)
  const sparseEmbedding = createCodeSparseEmbedding();
  console.log(`  ✅ Sparse embedding: ${sparseEmbedding.getProvider()}`);

  // 3. Initialize Qdrant vector database
  const qdrantUrl = process.env.QDRANT_URL || "http://localhost:6333";
  const vectorDb = new QdrantVectorDatabase({
    url: qdrantUrl,
    apiKey: process.env.QDRANT_API_KEY,
  });
  console.log(`  ✅ Qdrant database: ${qdrantUrl}\n`);

  const collectionName = "hybrid_search_example";

  try {
    // Drop existing collection if it exists
    const exists = await vectorDb.hasCollection(collectionName);
    if (exists) {
      console.log(`🗑️  Dropping existing collection '${collectionName}'...`);
      await vectorDb.dropCollection(collectionName);
    }

    // Create hybrid collection (supports both dense and sparse vectors)
    console.log(`📁 Creating hybrid collection '${collectionName}'...`);
    await vectorDb.createHybridCollection(
      collectionName,
      denseEmbedding.getDimension(),
    );

    // Build sparse vocabulary from corpus
    console.log("\n📚 Building sparse vocabulary from code snippets...");
    const contents = codeSnippets.map((s) => s.content);
    sparseEmbedding.buildVocabulary(contents);
    console.log(
      `   Vocabulary size: ${sparseEmbedding.getVocabularySize()} terms\n`,
    );

    // Generate embeddings and create documents
    console.log("🔢 Generating embeddings...");
    const documents: VectorDocument[] = [];

    for (const snippet of codeSnippets) {
      // Generate dense embedding
      const denseVector = await denseEmbedding.embedDocument(snippet.content);

      // Generate sparse embedding
      const sparseVector = sparseEmbedding.embed(snippet.content);

      documents.push({
        id: snippet.id,
        vector: denseVector,
        sparseVector: sparseVector,
        content: snippet.content,
        relativePath: snippet.relativePath,
        startLine: snippet.startLine,
        endLine: snippet.endLine,
        fileExtension: ".ts",
        metadata: {},
      });

      console.log(
        `   ✓ ${snippet.relativePath} - dense: ${denseVector.length}D, sparse: ${sparseVector.indices.length} non-zero`,
      );
    }

    // Insert documents with hybrid vectors
    console.log("\n📥 Inserting documents into Qdrant...");
    await vectorDb.insertHybrid(collectionName, documents);
    console.log(`   ✅ Inserted ${documents.length} documents\n`);

    // Perform hybrid searches
    console.log("═".repeat(60));
    console.log("🔍 HYBRID SEARCH EXAMPLES");
    console.log("═".repeat(60));

    const queries = [
      "function to calculate total price of items in cart",
      "fetch user data from API",
      "database connection pool query",
      "email validation regex",
    ];

    for (const query of queries) {
      console.log(`\n📝 Query: "${query}"`);
      console.log("-".repeat(50));

      // Generate query embeddings
      const queryDenseVector = await denseEmbedding.embedDocument(query);
      const querySparseVector = sparseEmbedding.embedQuery(query);

      console.log(
        `   Query vectors - dense: ${queryDenseVector.length}D, sparse: ${querySparseVector.indices.length} non-zero`,
      );

      // Create hybrid search requests
      const searchRequests: HybridSearchRequest[] = [
        {
          data: queryDenseVector,
          anns_field: "dense",
          param: {},
          limit: 3,
        },
        {
          data: querySparseVector,
          anns_field: "sparse",
          param: {},
          limit: 3,
        },
      ];

      // Perform hybrid search with RRF reranking
      const results = await vectorDb.hybridSearch(
        collectionName,
        searchRequests,
        {
          limit: 3,
          rerank: { strategy: "rrf", params: { k: 60 } },
        },
      );

      console.log(`\n   📊 Results (top 3):`);
      results.forEach((result: HybridSearchResult, index: number) => {
        console.log(
          `\n   ${index + 1}. ${result.document.relativePath} (score: ${result.score.toFixed(4)})`,
        );
        // Show first 80 characters of content
        const preview = result.document.content
          .replace(/\n/g, " ")
          .substring(0, 80);
        console.log(`      ${preview}...`);
      });
    }

    // Compare dense-only vs hybrid search
    console.log("\n" + "═".repeat(60));
    console.log("📊 COMPARISON: Dense-only vs Hybrid Search");
    console.log("═".repeat(60));

    const comparisonQuery = "CartItem price quantity";
    console.log(`\nQuery: "${comparisonQuery}"\n`);

    const compQueryDense = await denseEmbedding.embedDocument(comparisonQuery);
    const compQuerySparse = sparseEmbedding.embedQuery(comparisonQuery);

    // Dense-only search
    console.log("Dense-only results:");
    const denseResults = await vectorDb.search(collectionName, compQueryDense, {
      topK: 3,
    });
    denseResults.forEach((result: VectorSearchResult, index: number) => {
      console.log(
        `  ${index + 1}. ${result.document.relativePath} (score: ${result.score.toFixed(4)})`,
      );
    });

    // Hybrid search
    console.log("\nHybrid search results (dense + sparse):");
    const hybridResults = await vectorDb.hybridSearch(
      collectionName,
      [
        { data: compQueryDense, anns_field: "dense", param: {}, limit: 3 },
        { data: compQuerySparse, anns_field: "sparse", param: {}, limit: 3 },
      ],
      { limit: 3, rerank: { strategy: "rrf" } },
    );
    hybridResults.forEach((result: HybridSearchResult, index: number) => {
      console.log(
        `  ${index + 1}. ${result.document.relativePath} (score: ${result.score.toFixed(4)})`,
      );
    });

    console.log("\n" + "═".repeat(60));
    console.log("✅ Example completed successfully!");
    console.log("═".repeat(60));

    // Cleanup
    console.log(
      `\n🗑️  Cleaning up: dropping collection '${collectionName}'...`,
    );
    await vectorDb.dropCollection(collectionName);
    console.log("   Done!\n");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main().catch(console.error);
