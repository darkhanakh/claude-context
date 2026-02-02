# Hybrid Search with Sparse Embeddings in Qdrant

This example demonstrates how to use BM25-based sparse embeddings combined with dense embeddings for hybrid search in Qdrant.

## What is Hybrid Search?

Hybrid search combines two complementary approaches:

1. **Dense Embeddings** (Semantic Search): Captures the meaning and context of text. Good at finding semantically similar content even when keywords don't match exactly.

2. **Sparse Embeddings** (Lexical Search, BM25): Focuses on exact keyword matching with term frequency weighting. Excellent at finding documents with specific technical terms, function names, or identifiers.

By combining both, you get the best of both worlds—especially useful for code search where both semantic understanding and exact keyword matches matter.

## Prerequisites

1. **Qdrant** running locally or accessible via URL:
   ```bash
   # Using Docker
   docker run -p 6333:6333 qdrant/qdrant
   ```

2. **OpenAI API Key** (for dense embeddings)

3. **Node.js** (v18+)

## Installation

```bash
# From the project root
pnpm install

# Or from this directory
npm install
```

## Usage

```bash
# Set your OpenAI API key
export OPENAI_API_KEY=sk-your-api-key

# Optional: Set custom Qdrant URL (default: http://localhost:6333)
export QDRANT_URL=http://localhost:6333

# Run the example
pnpm start
# or
npx ts-node index.ts
```

## How It Works

### 1. Sparse Embedding with BM25

The `SparseEmbedding` class generates BM25-based sparse vectors:

```typescript
import { createCodeSparseEmbedding } from "@zilliz/claude-context-core";

// Create sparse embedding optimized for code
const sparseEmbedding = createCodeSparseEmbedding();

// Build vocabulary from your corpus
sparseEmbedding.buildVocabulary(documents);

// Generate sparse vector for a document
const sparseVector = sparseEmbedding.embed("function calculateTotal...");
// Returns: { indices: [12, 45, 78], values: [0.8, 0.5, 1.2] }
```

### 2. Creating a Hybrid Collection in Qdrant

```typescript
import { QdrantVectorDatabase } from "@zilliz/claude-context-core";

const vectorDb = new QdrantVectorDatabase({ url: "http://localhost:6333" });

// Create collection with both dense and sparse vector support
await vectorDb.createHybridCollection("my_collection", 1536); // dimension for dense vectors
```

### 3. Inserting Hybrid Documents

```typescript
import { VectorDocument } from "@zilliz/claude-context-core";

const document: VectorDocument = {
  id: "1",
  vector: denseVector,           // number[] - dense embedding
  sparseVector: sparseVector,    // { indices: number[], values: number[] }
  content: "...",
  relativePath: "src/utils.ts",
  startLine: 1,
  endLine: 10,
  fileExtension: ".ts",
  metadata: {},
};

await vectorDb.insertHybrid("my_collection", [document]);
```

### 4. Hybrid Search with RRF Reranking

```typescript
const results = await vectorDb.hybridSearch(
  "my_collection",
  [
    { data: queryDenseVector, anns_field: "dense", param: {}, limit: 10 },
    { data: querySparseVector, anns_field: "sparse", param: {}, limit: 10 },
  ],
  {
    limit: 10,
    rerank: { strategy: "rrf", params: { k: 60 } },
  }
);
```

## BM25 Parameters

The sparse embedding uses BM25 algorithm with tunable parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `k1` | 1.2 (code: 1.5) | Term frequency saturation. Higher = more TF influence |
| `b` | 0.75 | Document length normalization. 0 = none, 1 = full |
| `minDf` | 1 | Minimum document frequency to include a term |
| `maxDfRatio` | 0.85 | Maximum DF ratio (filters stop words) |
| `tokenMode` | "code" | Tokenization: "code" or "simple" |

```typescript
import { SparseEmbedding } from "@zilliz/claude-context-core";

const sparseEmbedding = new SparseEmbedding({
  k1: 1.5,        // Good for code search
  b: 0.75,
  tokenMode: "code",  // Handles camelCase, snake_case
});
```

## Expected Output

```
🚀 Hybrid Search with Sparse Embeddings Example

📦 Initializing components...

  ✅ Dense embedding: OpenAI OpenAI
     Dimension: 1536
  ✅ Sparse embedding: BM25-Sparse
  ✅ Qdrant database: http://localhost:6333

📚 Building sparse vocabulary from code snippets...
   Vocabulary size: 87 terms

🔢 Generating embeddings...
   ✓ src/utils/cart.ts - dense: 1536D, sparse: 12 non-zero
   ...

═══════════════════════════════════════════════════════════
🔍 HYBRID SEARCH EXAMPLES
═══════════════════════════════════════════════════════════

📝 Query: "function to calculate total price of items in cart"
--------------------------------------------------
   Query vectors - dense: 1536D, sparse: 8 non-zero

   📊 Results (top 3):

   1. src/utils/cart.ts (score: 0.0323)
      function calculateTotalPrice(items: CartItem[]): number { return items.re...
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes | - | OpenAI API key for dense embeddings |
| `QDRANT_URL` | No | `http://localhost:6333` | Qdrant server URL |
| `QDRANT_API_KEY` | No | - | Qdrant API key (for cloud) |

## Related

- [Qdrant Sparse Vectors Documentation](https://qdrant.tech/documentation/concepts/vectors/#sparse-vectors)
- [BM25 Algorithm](https://en.wikipedia.org/wiki/Okapi_BM25)
- [Hybrid Search Best Practices](https://qdrant.tech/articles/hybrid-search/)