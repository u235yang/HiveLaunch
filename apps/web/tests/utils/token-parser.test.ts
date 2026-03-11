import { describe, it, expect } from 'vitest';

// Token usage parser functions
interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  timestamp: string;
}

interface ParsedTokenData {
  totalUsage: number;
  byModel: Record<string, number>;
  byDay: Record<string, number>;
  byAgent: Record<string, number>;
}

function parseTokenUsage(usage: TokenUsage[]): ParsedTokenData {
  const result: ParsedTokenData = {
    totalUsage: 0,
    byModel: {},
    byDay: {},
    byAgent: {},
  };

  for (const item of usage) {
    result.totalUsage += item.totalTokens;

    // By model
    result.byModel[item.model] = (result.byModel[item.model] || 0) + item.totalTokens;

    // By day
    const day = item.timestamp.split('T')[0];
    result.byDay[day] = (result.byDay[day] || 0) + item.totalTokens;
  }

  return result;
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toString();
}

function calculateCost(tokens: number, model: string): number {
  const rates: Record<string, { input: number; output: number }> = {
    'gpt-4': { input: 0.03, output: 0.06 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  };

  const rate = rates[model] || rates['gpt-3.5-turbo'];
  // Assume 70% input, 30% output for simplicity
  const inputTokens = tokens * 0.7;
  const outputTokens = tokens * 0.3;

  return (inputTokens / 1000) * rate.input + (outputTokens / 1000) * rate.output;
}

function aggregateByTimeRange(
  usage: TokenUsage[],
  range: 'day' | 'week' | 'month'
): Record<string, number> {
  const result: Record<string, number> = {};

  for (const item of usage) {
    const date = new Date(item.timestamp);
    let key: string;

    switch (range) {
      case 'day':
        key = item.timestamp.split('T')[0];
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
        break;
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
    }

    result[key] = (result[key] || 0) + item.totalTokens;
  }

  return result;
}

describe('token-parser', () => {
  describe('parseTokenUsage', () => {
    it('should calculate total usage correctly', () => {
      const usage: TokenUsage[] = [
        { promptTokens: 100, completionTokens: 50, totalTokens: 150, model: 'gpt-4', timestamp: '2024-01-01T10:00:00Z' },
        { promptTokens: 200, completionTokens: 100, totalTokens: 300, model: 'gpt-4', timestamp: '2024-01-01T11:00:00Z' },
      ];

      const result = parseTokenUsage(usage);
      expect(result.totalUsage).toBe(450);
    });

    it('should aggregate by model', () => {
      const usage: TokenUsage[] = [
        { promptTokens: 100, completionTokens: 50, totalTokens: 150, model: 'gpt-4', timestamp: '2024-01-01T10:00:00Z' },
        { promptTokens: 200, completionTokens: 100, totalTokens: 300, model: 'gpt-3.5-turbo', timestamp: '2024-01-01T11:00:00Z' },
      ];

      const result = parseTokenUsage(usage);
      expect(result.byModel['gpt-4']).toBe(150);
      expect(result.byModel['gpt-3.5-turbo']).toBe(300);
    });

    it('should aggregate by day', () => {
      const usage: TokenUsage[] = [
        { promptTokens: 100, completionTokens: 50, totalTokens: 150, model: 'gpt-4', timestamp: '2024-01-01T10:00:00Z' },
        { promptTokens: 200, completionTokens: 100, totalTokens: 300, model: 'gpt-4', timestamp: '2024-01-02T11:00:00Z' },
      ];

      const result = parseTokenUsage(usage);
      expect(result.byDay['2024-01-01']).toBe(150);
      expect(result.byDay['2024-01-02']).toBe(300);
    });

    it('should handle empty usage array', () => {
      const result = parseTokenUsage([]);
      expect(result.totalUsage).toBe(0);
      expect(result.byModel).toEqual({});
      expect(result.byDay).toEqual({});
    });
  });

  describe('formatTokenCount', () => {
    it('should format thousands with K suffix', () => {
      expect(formatTokenCount(1500)).toBe('1.5K');
      expect(formatTokenCount(1000)).toBe('1.0K');
      expect(formatTokenCount(9999)).toBe('10.0K');
    });

    it('should format millions with M suffix', () => {
      expect(formatTokenCount(1_500_000)).toBe('1.5M');
      expect(formatTokenCount(1_000_000)).toBe('1.0M');
    });

    it('should return plain number for values under 1000', () => {
      expect(formatTokenCount(999)).toBe('999');
      expect(formatTokenCount(0)).toBe('0');
      expect(formatTokenCount(500)).toBe('500');
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost for gpt-4', () => {
      const cost = calculateCost(1000, 'gpt-4');
      // (700 * 0.03 + 300 * 0.06) / 1000 = 0.021 + 0.018 = 0.039
      expect(cost).toBeCloseTo(0.039, 3);
    });

    it('should calculate cost for gpt-3.5-turbo', () => {
      const cost = calculateCost(1000, 'gpt-3.5-turbo');
      // (700 * 0.0005 + 300 * 0.0015) / 1000 = 0.00035 + 0.00045 = 0.0008
      expect(cost).toBeCloseTo(0.0008, 4);
    });

    it('should use default rate for unknown model', () => {
      const cost = calculateCost(1000, 'unknown-model');
      expect(cost).toBeCloseTo(0.0008, 4);
    });
  });

  describe('aggregateByTimeRange', () => {
    it('should aggregate by day', () => {
      const usage: TokenUsage[] = [
        { promptTokens: 100, completionTokens: 50, totalTokens: 150, model: 'gpt-4', timestamp: '2024-01-01T10:00:00Z' },
        { promptTokens: 200, completionTokens: 100, totalTokens: 300, model: 'gpt-4', timestamp: '2024-01-01T14:00:00Z' },
        { promptTokens: 150, completionTokens: 75, totalTokens: 225, model: 'gpt-4', timestamp: '2024-01-02T10:00:00Z' },
      ];

      const result = aggregateByTimeRange(usage, 'day');
      expect(result['2024-01-01']).toBe(450);
      expect(result['2024-01-02']).toBe(225);
    });

    it('should aggregate by week', () => {
      const usage: TokenUsage[] = [
        // Week of Jan 1, 2024 (Monday)
        { promptTokens: 100, completionTokens: 50, totalTokens: 150, model: 'gpt-4', timestamp: '2024-01-01T10:00:00Z' },
        { promptTokens: 200, completionTokens: 100, totalTokens: 300, model: 'gpt-4', timestamp: '2024-01-03T10:00:00Z' },
        // Week of Jan 8, 2024
        { promptTokens: 150, completionTokens: 75, totalTokens: 225, model: 'gpt-4', timestamp: '2024-01-08T10:00:00Z' },
      ];

      const result = aggregateByTimeRange(usage, 'week');
      expect(Object.keys(result)).toHaveLength(2);
    });

    it('should aggregate by month', () => {
      const usage: TokenUsage[] = [
        { promptTokens: 100, completionTokens: 50, totalTokens: 150, model: 'gpt-4', timestamp: '2024-01-15T10:00:00Z' },
        { promptTokens: 200, completionTokens: 100, totalTokens: 300, model: 'gpt-4', timestamp: '2024-01-20T10:00:00Z' },
        { promptTokens: 150, completionTokens: 75, totalTokens: 225, model: 'gpt-4', timestamp: '2024-02-01T10:00:00Z' },
      ];

      const result = aggregateByTimeRange(usage, 'month');
      expect(result['2024-01']).toBe(450);
      expect(result['2024-02']).toBe(225);
    });

    it('should handle empty usage array', () => {
      const result = aggregateByTimeRange([], 'day');
      expect(result).toEqual({});
    });
  });
});
