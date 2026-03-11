// features/agent-execution/lib/token-parser.ts
import { TokenUsageEntry } from '@shared/types';

export function parseTokenUsageInfo(logOutput: string): TokenUsageEntry | null {
  const tokenUsagePattern = /"token_usage_info":\s*(\{[\s\S]*?\})/s;
  const match = logOutput.match(tokenUsagePattern);

  if (match && match[1]) {
    try {
      const tokenInfo = JSON.parse(match[1]);
      return {
        type: 'token_usage_info',
        input_tokens: tokenInfo.prompt_tokens || 0,
        output_tokens: tokenInfo.completion_tokens || 0,
        total_tokens: tokenInfo.total_tokens || 0,
        model: tokenInfo.model || 'unknown',
        model_context_window: tokenInfo.model_context_window || 0, // Assuming this exists or defaults to 0
        thinking_tokens: tokenInfo.thinking_tokens,
        cache_read_tokens: tokenInfo.cache_read_tokens,
        cache_write_tokens: tokenInfo.cache_write_tokens,
        timestamp: new Date().toISOString(), // Use current timestamp
      };
    } catch (e) {
      console.error("Failed to parse token_usage_info JSON:", e);
      return null;
    }
  }
  return null;
}

// Placeholder for database interaction - will be implemented later
export function saveTokenUsageToDb(_executionProcessId: string, _tokenUsage: TokenUsageEntry): Promise<void> {
  // TODO: Implement actual database insertion using Drizzle ORM
  return Promise.resolve();
}


