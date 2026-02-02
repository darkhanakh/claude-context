import {
  MilvusVectorDatabase,
  QdrantVectorDatabase,
  VectorDatabase,
} from "@zilliz/claude-context-core";
import { ContextMcpConfig } from "./config.js";

// Helper function to create vector database instance based on provider
export function createVectorDatabaseInstance(
  config: ContextMcpConfig
): VectorDatabase {
  console.log(
    `[VECTORDB] Creating ${config.vectorDbProvider} vector database instance...`
  );

  switch (config.vectorDbProvider) {
    case "Milvus":
      if (!config.milvusAddress && !config.milvusToken) {
        console.error(
          `[VECTORDB] ❌ Milvus requires either MILVUS_ADDRESS or MILVUS_TOKEN`
        );
        throw new Error(
          "MILVUS_ADDRESS or MILVUS_TOKEN is required for Milvus vector database provider"
        );
      }
      console.log(
        `[VECTORDB] 🔧 Configuring Milvus with address: ${config.milvusAddress || "[Auto-resolve from token]"}`
      );
      const milvusDb = new MilvusVectorDatabase({
        address: config.milvusAddress,
        token: config.milvusToken,
      });
      console.log(
        `[VECTORDB] ✅ Milvus vector database instance created successfully`
      );
      return milvusDb;

    case "Qdrant":
      const qdrantUrl = config.qdrantUrl || "http://localhost:6333";
      console.log(`[VECTORDB] 🔧 Configuring Qdrant with URL: ${qdrantUrl}`);
      const qdrantDb = new QdrantVectorDatabase({
        url: qdrantUrl,
        apiKey: config.qdrantApiKey,
      });
      console.log(
        `[VECTORDB] ✅ Qdrant vector database instance created successfully`
      );
      return qdrantDb;

    default:
      console.error(
        `[VECTORDB] ❌ Unsupported vector database provider: ${config.vectorDbProvider}`
      );
      throw new Error(
        `Unsupported vector database provider: ${config.vectorDbProvider}`
      );
  }
}

export function logVectorDatabaseProviderInfo(
  config: ContextMcpConfig,
  vectorDb: VectorDatabase
): void {
  console.log(
    `[VECTORDB] ✅ Successfully initialized ${config.vectorDbProvider} vector database provider`
  );

  switch (config.vectorDbProvider) {
    case "Milvus":
      console.log(
        `[VECTORDB] Milvus configuration - Address: ${config.milvusAddress || "[Auto-resolved from token]"}, Token: ${config.milvusToken ? "✅ Provided" : "❌ Not provided"}`
      );
      break;
    case "Qdrant":
      console.log(
        `[VECTORDB] Qdrant configuration - URL: ${config.qdrantUrl || "http://localhost:6333"}, API Key: ${config.qdrantApiKey ? "✅ Provided" : "❌ Not provided (local mode)"}`
      );
      break;
  }
}
