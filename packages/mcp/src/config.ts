import { envManager } from "@zilliz/claude-context-core";

export interface ContextMcpConfig {
  name: string;
  version: string;
  // Embedding provider configuration
  embeddingProvider: "OpenAI" | "VoyageAI" | "Gemini" | "Ollama" | "Fireworks";
  embeddingModel: string;
  // Provider-specific API keys
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  voyageaiApiKey?: string;
  geminiApiKey?: string;
  geminiBaseUrl?: string;
  // Fireworks configuration
  fireworksApiKey?: string;
  // Ollama configuration
  ollamaModel?: string;
  ollamaHost?: string;
  // Vector database configuration
  vectorDbProvider: "Milvus" | "Qdrant";
  milvusAddress?: string; // Optional, can be auto-resolved from token
  milvusToken?: string;
  // Qdrant configuration
  qdrantUrl?: string;
  qdrantApiKey?: string;
  // Reranker configuration
  rerankerEnabled: boolean;
  rerankerModel?: string;
  // Sparse embedding configuration (for hybrid search)
  sparseEmbeddingEnabled: boolean;
  sparseEmbeddingK1?: number; // BM25 k1 parameter (default: 1.2)
  sparseEmbeddingB?: number; // BM25 b parameter (default: 0.75)
}

// Legacy format (v1) - for backward compatibility
export interface CodebaseSnapshotV1 {
  indexedCodebases: string[];
  indexingCodebases: string[] | Record<string, number>; // Array (legacy) or Map of codebase path to progress percentage
  lastUpdated: string;
}

// New format (v2) - structured with codebase information

// Base interface for common fields
interface CodebaseInfoBase {
  lastUpdated: string;
}

// Indexing state - when indexing is in progress
export interface CodebaseInfoIndexing extends CodebaseInfoBase {
  status: "indexing";
  indexingPercentage: number; // Current progress percentage
}

// Indexed state - when indexing completed successfully
export interface CodebaseInfoIndexed extends CodebaseInfoBase {
  status: "indexed";
  indexedFiles: number; // Number of files indexed
  totalChunks: number; // Total number of chunks generated
  indexStatus: "completed" | "limit_reached"; // Status from indexing result
}

// Index failed state - when indexing failed
export interface CodebaseInfoIndexFailed extends CodebaseInfoBase {
  status: "indexfailed";
  errorMessage: string; // Error message from the failure
  lastAttemptedPercentage?: number; // Progress when failure occurred
}

// Union type for all codebase information states
export type CodebaseInfo =
  | CodebaseInfoIndexing
  | CodebaseInfoIndexed
  | CodebaseInfoIndexFailed;

export interface CodebaseSnapshotV2 {
  formatVersion: "v2";
  codebases: Record<string, CodebaseInfo>; // codebasePath -> CodebaseInfo
  lastUpdated: string;
}

// Union type for all supported formats
export type CodebaseSnapshot = CodebaseSnapshotV1 | CodebaseSnapshotV2;

// Helper function to get default model for each provider
export function getDefaultModelForProvider(provider: string): string {
  switch (provider) {
    case "OpenAI":
      return "text-embedding-3-small";
    case "VoyageAI":
      return "voyage-code-3";
    case "Gemini":
      return "gemini-embedding-001";
    case "Ollama":
      return "nomic-embed-text";
    case "Fireworks":
      return "fireworks/qwen3-embedding-8b";
    default:
      return "text-embedding-3-small";
  }
}

// Helper function to get embedding model with provider-specific environment variable priority
export function getEmbeddingModelForProvider(provider: string): string {
  switch (provider) {
    case "Ollama":
      // For Ollama, prioritize OLLAMA_MODEL over EMBEDDING_MODEL for backward compatibility
      const ollamaModel =
        envManager.get("OLLAMA_MODEL") ||
        envManager.get("EMBEDDING_MODEL") ||
        getDefaultModelForProvider(provider);
      console.log(
        `[DEBUG] 🎯 Ollama model selection: OLLAMA_MODEL=${envManager.get("OLLAMA_MODEL") || "NOT SET"}, EMBEDDING_MODEL=${envManager.get("EMBEDDING_MODEL") || "NOT SET"}, selected=${ollamaModel}`,
      );
      return ollamaModel;
    case "OpenAI":
    case "VoyageAI":
    case "Gemini":
    case "Fireworks":
    default:
      // For all other providers, use EMBEDDING_MODEL or default
      const selectedModel =
        envManager.get("EMBEDDING_MODEL") ||
        getDefaultModelForProvider(provider);
      console.log(
        `[DEBUG] 🎯 ${provider} model selection: EMBEDDING_MODEL=${envManager.get("EMBEDDING_MODEL") || "NOT SET"}, selected=${selectedModel}`,
      );
      return selectedModel;
  }
}

export function createMcpConfig(): ContextMcpConfig {
  // Debug: Print all environment variables related to Context
  console.log(`[DEBUG] 🔍 Environment Variables Debug:`);
  console.log(
    `[DEBUG]   EMBEDDING_PROVIDER: ${envManager.get("EMBEDDING_PROVIDER") || "NOT SET"}`,
  );
  console.log(
    `[DEBUG]   EMBEDDING_MODEL: ${envManager.get("EMBEDDING_MODEL") || "NOT SET"}`,
  );
  console.log(
    `[DEBUG]   OLLAMA_MODEL: ${envManager.get("OLLAMA_MODEL") || "NOT SET"}`,
  );
  console.log(
    `[DEBUG]   GEMINI_API_KEY: ${envManager.get("GEMINI_API_KEY") ? "SET (length: " + envManager.get("GEMINI_API_KEY")!.length + ")" : "NOT SET"}`,
  );
  console.log(
    `[DEBUG]   OPENAI_API_KEY: ${envManager.get("OPENAI_API_KEY") ? "SET (length: " + envManager.get("OPENAI_API_KEY")!.length + ")" : "NOT SET"}`,
  );
  console.log(
    `[DEBUG]   FIREWORKS_API_KEY: ${envManager.get("FIREWORKS_API_KEY") ? "SET (length: " + envManager.get("FIREWORKS_API_KEY")!.length + ")" : "NOT SET"}`,
  );
  console.log(
    `[DEBUG]   MILVUS_ADDRESS: ${envManager.get("MILVUS_ADDRESS") || "NOT SET"}`,
  );
  console.log(`[DEBUG]   NODE_ENV: ${envManager.get("NODE_ENV") || "NOT SET"}`);

  const config: ContextMcpConfig = {
    name: envManager.get("MCP_SERVER_NAME") || "Context MCP Server",
    version: envManager.get("MCP_SERVER_VERSION") || "1.0.0",
    // Embedding provider configuration
    embeddingProvider:
      (envManager.get("EMBEDDING_PROVIDER") as
        | "OpenAI"
        | "VoyageAI"
        | "Gemini"
        | "Ollama"
        | "Fireworks") || "OpenAI",
    embeddingModel: getEmbeddingModelForProvider(
      envManager.get("EMBEDDING_PROVIDER") || "OpenAI",
    ),
    // Provider-specific API keys
    openaiApiKey: envManager.get("OPENAI_API_KEY"),
    openaiBaseUrl: envManager.get("OPENAI_BASE_URL"),
    voyageaiApiKey: envManager.get("VOYAGEAI_API_KEY"),
    geminiApiKey: envManager.get("GEMINI_API_KEY"),
    geminiBaseUrl: envManager.get("GEMINI_BASE_URL"),
    // Fireworks configuration
    fireworksApiKey: envManager.get("FIREWORKS_API_KEY"),
    // Ollama configuration
    ollamaModel: envManager.get("OLLAMA_MODEL"),
    ollamaHost: envManager.get("OLLAMA_HOST"),
    // Vector database configuration
    vectorDbProvider:
      (envManager.get("VECTOR_DB_PROVIDER") as "Milvus" | "Qdrant") || "Milvus",
    milvusAddress: envManager.get("MILVUS_ADDRESS"), // Optional, can be resolved from token
    milvusToken: envManager.get("MILVUS_TOKEN"),
    // Qdrant configuration
    qdrantUrl: envManager.get("QDRANT_URL") || "http://localhost:6333",
    qdrantApiKey: envManager.get("QDRANT_API_KEY"),
    // Reranker configuration
    rerankerEnabled:
      envManager.get("RERANKER_ENABLED")?.toLowerCase() === "true",
    rerankerModel:
      envManager.get("RERANKER_MODEL") || "fireworks/qwen3-reranker-8b",
    // Sparse embedding configuration (for hybrid search)
    sparseEmbeddingEnabled:
      envManager.get("SPARSE_EMBEDDING_ENABLED")?.toLowerCase() === "true",
    sparseEmbeddingK1: envManager.get("SPARSE_EMBEDDING_K1")
      ? parseFloat(envManager.get("SPARSE_EMBEDDING_K1")!)
      : undefined,
    sparseEmbeddingB: envManager.get("SPARSE_EMBEDDING_B")
      ? parseFloat(envManager.get("SPARSE_EMBEDDING_B")!)
      : undefined,
  };

  return config;
}

export function logConfigurationSummary(config: ContextMcpConfig): void {
  // Log configuration summary before starting server
  console.log(`[MCP] 🚀 Starting Context MCP Server`);
  console.log(`[MCP] Configuration Summary:`);
  console.log(`[MCP]   Server: ${config.name} v${config.version}`);
  console.log(`[MCP]   Embedding Provider: ${config.embeddingProvider}`);
  console.log(`[MCP]   Embedding Model: ${config.embeddingModel}`);
  console.log(`[MCP]   Vector DB Provider: ${config.vectorDbProvider}`);
  if (config.vectorDbProvider === "Qdrant") {
    console.log(`[MCP]   Qdrant URL: ${config.qdrantUrl}`);
    console.log(
      `[MCP]   Qdrant API Key: ${config.qdrantApiKey ? "✅ Configured" : "❌ Not configured (using local)"}`,
    );
  } else {
    console.log(
      `[MCP]   Milvus Address: ${config.milvusAddress || (config.milvusToken ? "[Auto-resolve from token]" : "[Not configured]")}`,
    );
  }

  // Log provider-specific configuration without exposing sensitive data
  switch (config.embeddingProvider) {
    case "OpenAI":
      console.log(
        `[MCP]   OpenAI API Key: ${config.openaiApiKey ? "✅ Configured" : "❌ Missing"}`,
      );
      if (config.openaiBaseUrl) {
        console.log(`[MCP]   OpenAI Base URL: ${config.openaiBaseUrl}`);
      }
      break;
    case "VoyageAI":
      console.log(
        `[MCP]   VoyageAI API Key: ${config.voyageaiApiKey ? "✅ Configured" : "❌ Missing"}`,
      );
      break;
    case "Gemini":
      console.log(
        `[MCP]   Gemini API Key: ${config.geminiApiKey ? "✅ Configured" : "❌ Missing"}`,
      );
      if (config.geminiBaseUrl) {
        console.log(`[MCP]   Gemini Base URL: ${config.geminiBaseUrl}`);
      }
      break;
    case "Ollama":
      console.log(
        `[MCP]   Ollama Host: ${config.ollamaHost || "http://127.0.0.1:11434"}`,
      );
      console.log(`[MCP]   Ollama Model: ${config.embeddingModel}`);
      break;
    case "Fireworks":
      console.log(
        `[MCP]   Fireworks API Key: ${config.fireworksApiKey ? "✅ Configured" : "❌ Missing"}`,
      );
      break;
  }

  // Log reranker configuration
  if (config.rerankerEnabled) {
    console.log(`[MCP]   Reranker: ✅ Enabled (${config.rerankerModel})`);
  } else {
    console.log(
      `[MCP]   Reranker: ❌ Disabled (set RERANKER_ENABLED=true to enable)`,
    );
  }

  // Log sparse embedding configuration
  if (config.sparseEmbeddingEnabled) {
    const k1 = config.sparseEmbeddingK1 ?? 1.2;
    const b = config.sparseEmbeddingB ?? 0.75;
    console.log(`[MCP]   Sparse Embedding: ✅ Enabled (BM25 k1=${k1}, b=${b})`);
  } else {
    console.log(
      `[MCP]   Sparse Embedding: ❌ Disabled (set SPARSE_EMBEDDING_ENABLED=true for hybrid search)`,
    );
  }

  console.log(`[MCP] 🔧 Initializing server components...`);
}

export function showHelpMessage(): void {
  console.log(`
Context MCP Server

Usage: npx @zilliz/claude-context-mcp@latest [options]

Options:
  --help, -h                          Show this help message

Environment Variables:
  MCP_SERVER_NAME         Server name
  MCP_SERVER_VERSION      Server version

  Embedding Provider Configuration:
  EMBEDDING_PROVIDER      Embedding provider: OpenAI, VoyageAI, Gemini, Ollama, Fireworks (default: OpenAI)
  EMBEDDING_MODEL         Embedding model name (works for all providers)

  Provider-specific API Keys:
  OPENAI_API_KEY          OpenAI API key (required for OpenAI provider)
  OPENAI_BASE_URL         OpenAI API base URL (optional, for custom endpoints)
  VOYAGEAI_API_KEY        VoyageAI API key (required for VoyageAI provider)
  GEMINI_API_KEY          Google AI API key (required for Gemini provider)
  GEMINI_BASE_URL         Gemini API base URL (optional, for custom endpoints)
  FIREWORKS_API_KEY       Fireworks API key (required for Fireworks provider)

  Ollama Configuration:
  OLLAMA_HOST             Ollama server host (default: http://127.0.0.1:11434)
  OLLAMA_MODEL            Ollama model name (alternative to EMBEDDING_MODEL for Ollama)

  Vector Database Configuration:
  VECTOR_DB_PROVIDER      Vector database provider: Milvus, Qdrant (default: Milvus)

  Milvus Configuration:
  MILVUS_ADDRESS          Milvus address (optional, can be auto-resolved from token)
  MILVUS_TOKEN            Milvus token (optional, used for authentication and address resolution)

  Qdrant Configuration:
  QDRANT_URL              Qdrant server URL (default: http://localhost:6333)
  QDRANT_API_KEY          Qdrant API key (optional, for Qdrant Cloud or secured instances)

  Reranker Configuration:
  RERANKER_ENABLED        Enable reranking of search results (default: false)
  RERANKER_MODEL          Reranker model (default: fireworks/qwen3-reranker-8b)
                          Available: fireworks/qwen3-reranker-8b, fireworks/qwen3-reranker-4b, fireworks/qwen3-reranker-0p6b

  Sparse Embedding Configuration (Hybrid Search):
  SPARSE_EMBEDDING_ENABLED  Enable BM25-based sparse embeddings for hybrid search (default: false)
  SPARSE_EMBEDDING_K1       BM25 k1 parameter - term frequency saturation (default: 1.2, range: 1.2-2.0)
  SPARSE_EMBEDDING_B        BM25 b parameter - document length normalization (default: 0.75, range: 0-1)

Examples:
  # Start MCP server with OpenAI (default) and explicit Milvus address
  OPENAI_API_KEY=sk-xxx MILVUS_ADDRESS=localhost:19530 npx @zilliz/claude-context-mcp@latest

  # Start MCP server with OpenAI and specific model
  OPENAI_API_KEY=sk-xxx EMBEDDING_MODEL=text-embedding-3-large MILVUS_TOKEN=your-token npx @zilliz/claude-context-mcp@latest

  # Start MCP server with VoyageAI and specific model
  EMBEDDING_PROVIDER=VoyageAI VOYAGEAI_API_KEY=pa-xxx EMBEDDING_MODEL=voyage-3-large MILVUS_TOKEN=your-token npx @zilliz/claude-context-mcp@latest

  # Start MCP server with Gemini and specific model
  EMBEDDING_PROVIDER=Gemini GEMINI_API_KEY=xxx EMBEDDING_MODEL=gemini-embedding-001 MILVUS_TOKEN=your-token npx @zilliz/claude-context-mcp@latest

  # Start MCP server with Ollama and specific model (using OLLAMA_MODEL)
  EMBEDDING_PROVIDER=Ollama OLLAMA_MODEL=mxbai-embed-large MILVUS_TOKEN=your-token npx @zilliz/claude-context-mcp@latest

  # Start MCP server with Ollama and specific model (using EMBEDDING_MODEL)
  EMBEDDING_PROVIDER=Ollama EMBEDDING_MODEL=nomic-embed-text MILVUS_TOKEN=your-token npx @zilliz/claude-context-mcp@latest

  # Start MCP server with Fireworks and specific model
  EMBEDDING_PROVIDER=Fireworks FIREWORKS_API_KEY=fw_xxx EMBEDDING_MODEL=fireworks/qwen3-embedding-8b MILVUS_TOKEN=your-token npx @zilliz/claude-context-mcp@latest

  # Start MCP server with local Qdrant (default localhost:6333)
  VECTOR_DB_PROVIDER=Qdrant OPENAI_API_KEY=sk-xxx npx @zilliz/claude-context-mcp@latest

  # Start MCP server with Qdrant Cloud
  VECTOR_DB_PROVIDER=Qdrant QDRANT_URL=https://xxx.qdrant.io QDRANT_API_KEY=your-key OPENAI_API_KEY=sk-xxx npx @zilliz/claude-context-mcp@latest

  # Start MCP server with Fireworks embeddings and local Qdrant
  VECTOR_DB_PROVIDER=Qdrant EMBEDDING_PROVIDER=Fireworks FIREWORKS_API_KEY=fw_xxx npx @zilliz/claude-context-mcp@latest

  # Start MCP server with reranking enabled (improves search quality)
  RERANKER_ENABLED=true VECTOR_DB_PROVIDER=Qdrant EMBEDDING_PROVIDER=Fireworks FIREWORKS_API_KEY=fw_xxx npx @zilliz/claude-context-mcp@latest

  # Start MCP server with hybrid search (dense + sparse BM25 embeddings)
  SPARSE_EMBEDDING_ENABLED=true VECTOR_DB_PROVIDER=Qdrant EMBEDDING_PROVIDER=Fireworks FIREWORKS_API_KEY=fw_xxx npx @zilliz/claude-context-mcp@latest

  # Start MCP server with full hybrid search setup (dense + sparse + reranking)
  SPARSE_EMBEDDING_ENABLED=true RERANKER_ENABLED=true VECTOR_DB_PROVIDER=Qdrant EMBEDDING_PROVIDER=Fireworks FIREWORKS_API_KEY=fw_xxx npx @zilliz/claude-context-mcp@latest

  # Start MCP server with custom BM25 parameters for code search
  SPARSE_EMBEDDING_ENABLED=true SPARSE_EMBEDDING_K1=1.5 SPARSE_EMBEDDING_B=0.75 VECTOR_DB_PROVIDER=Qdrant OPENAI_API_KEY=sk-xxx npx @zilliz/claude-context-mcp@latest
        `);
}
