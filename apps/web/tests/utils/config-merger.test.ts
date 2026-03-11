import { describe, it, expect } from 'vitest';

// Configuration merger functions
interface SwarmConfig {
  name: string;
  agents: AgentConfig[];
  globalSettings: GlobalSettings;
}

interface AgentConfig {
  id: string;
  name: string;
  type: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  tools: string[];
}

interface GlobalSettings {
  maxTokens: number;
  timeout: number;
  retryAttempts: number;
}

interface ConfigMergeResult {
  config: SwarmConfig;
  conflicts: ConfigConflict[];
  warnings: string[];
}

interface ConfigConflict {
  path: string;
  baseValue: unknown;
  overrideValue: unknown;
  resolved: boolean;
}

function mergeConfigs(base: SwarmConfig, override: Partial<SwarmConfig>): ConfigMergeResult {
  const conflicts: ConfigConflict[] = [];
  const warnings: string[] = [];

  // Merge global settings
  const mergedGlobalSettings: GlobalSettings = {
    ...base.globalSettings,
    ...override.globalSettings,
  };

  // Check for conflicts in global settings
  if (override.globalSettings) {
    for (const key of Object.keys(override.globalSettings) as Array<keyof GlobalSettings>) {
      if (base.globalSettings[key] !== undefined && base.globalSettings[key] !== override.globalSettings[key]) {
        conflicts.push({
          path: `globalSettings.${key}`,
          baseValue: base.globalSettings[key],
          overrideValue: override.globalSettings[key],
          resolved: true,
        });
      }
    }
  }

  // Merge agents
  const mergedAgents = [...base.agents];
  if (override.agents) {
    for (const overrideAgent of override.agents) {
      const existingIndex = mergedAgents.findIndex((a) => a.id === overrideAgent.id);
      if (existingIndex >= 0) {
        // Check for conflicts
        const existingAgent = mergedAgents[existingIndex];
        for (const key of Object.keys(overrideAgent) as Array<keyof AgentConfig>) {
          if (existingAgent[key] !== undefined && existingAgent[key] !== overrideAgent[key]) {
            conflicts.push({
              path: `agents.${overrideAgent.id}.${key}`,
              baseValue: existingAgent[key],
              overrideValue: overrideAgent[key],
              resolved: true,
            });
          }
        }
        // Merge agent
        mergedAgents[existingIndex] = { ...existingAgent, ...overrideAgent };
      } else {
        // Add new agent
        mergedAgents.push(overrideAgent);
        warnings.push(`Added new agent: ${overrideAgent.name}`);
      }
    }
  }

  // Merge name if provided
  let mergedName = base.name;
  if (override.name && override.name !== base.name) {
    conflicts.push({
      path: 'name',
      baseValue: base.name,
      overrideValue: override.name,
      resolved: true,
    });
    mergedName = override.name;
  }

  return {
    config: {
      name: mergedName,
      agents: mergedAgents,
      globalSettings: mergedGlobalSettings,
    },
    conflicts,
    warnings,
  };
}

function validateConfig(config: SwarmConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.name || config.name.trim() === '') {
    errors.push('Config name is required');
  }

  if (!config.agents || config.agents.length === 0) {
    errors.push('At least one agent is required');
  }

  for (const agent of config.agents) {
    if (!agent.id || agent.id.trim() === '') {
      errors.push(`Agent ID is required`);
    }
    if (!agent.name || agent.name.trim() === '') {
      errors.push(`Agent name is required for agent ${agent.id}`);
    }
    if (!agent.model || agent.model.trim() === '') {
      errors.push(`Model is required for agent ${agent.name || agent.id}`);
    }
    if (agent.temperature < 0 || agent.temperature > 2) {
      errors.push(`Temperature must be between 0 and 2 for agent ${agent.name || agent.id}`);
    }
  }

  if (config.globalSettings.maxTokens <= 0) {
    errors.push('maxTokens must be greater than 0');
  }

  if (config.globalSettings.timeout <= 0) {
    errors.push('timeout must be greater than 0');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function diffConfigs(base: SwarmConfig, compare: SwarmConfig): string[] {
  const differences: string[] = [];

  if (base.name !== compare.name) {
    differences.push(`name: "${base.name}" → "${compare.name}"`);
  }

  // Compare global settings
  for (const key of Object.keys(base.globalSettings) as Array<keyof GlobalSettings>) {
    if (base.globalSettings[key] !== compare.globalSettings[key]) {
      differences.push(`globalSettings.${key}: ${base.globalSettings[key]} → ${compare.globalSettings[key]}`);
    }
  }

  // Compare agents
  const baseAgentIds = new Set(base.agents.map((a) => a.id));
  const compareAgentIds = new Set(compare.agents.map((a) => a.id));

  // Find added agents
  for (const agent of compare.agents) {
    if (!baseAgentIds.has(agent.id)) {
      differences.push(`agents: Added "${agent.name}" (${agent.id})`);
    }
  }

  // Find removed agents
  for (const agent of base.agents) {
    if (!compareAgentIds.has(agent.id)) {
      differences.push(`agents: Removed "${agent.name}" (${agent.id})`);
    }
  }

  // Find modified agents
  for (const baseAgent of base.agents) {
    const compareAgent = compare.agents.find((a) => a.id === baseAgent.id);
    if (compareAgent) {
      for (const key of Object.keys(baseAgent) as Array<keyof AgentConfig>) {
        if (JSON.stringify(baseAgent[key]) !== JSON.stringify(compareAgent[key])) {
          differences.push(`agents.${baseAgent.id}.${key}: Changed`);
        }
      }
    }
  }

  return differences;
}

describe('config-merger', () => {
  const baseConfig: SwarmConfig = {
    name: 'Base Swarm',
    agents: [
      {
        id: 'agent1',
        name: 'Agent One',
        type: 'assistant',
        model: 'gpt-4',
        temperature: 0.7,
        systemPrompt: 'You are a helpful assistant.',
        tools: ['search', 'calculator'],
      },
    ],
    globalSettings: {
      maxTokens: 2000,
      timeout: 30000,
      retryAttempts: 3,
    },
  };

  describe('mergeConfigs', () => {
    it('should return base config when no override provided', () => {
      const result = mergeConfigs(baseConfig, {});
      expect(result.config.name).toBe('Base Swarm');
      expect(result.config.agents).toHaveLength(1);
      expect(result.conflicts).toHaveLength(0);
    });

    it('should merge global settings', () => {
      const override: Partial<SwarmConfig> = {
        globalSettings: {
          maxTokens: 4000,
          timeout: 60000,
          retryAttempts: 3,
        },
      };

      const result = mergeConfigs(baseConfig, override);
      expect(result.config.globalSettings.maxTokens).toBe(4000);
      expect(result.config.globalSettings.timeout).toBe(60000);
      expect(result.conflicts).toHaveLength(2);
    });

    it('should merge existing agent properties', () => {
      const override: Partial<SwarmConfig> = {
        agents: [
          {
            id: 'agent1',
            name: 'Agent One',
            type: 'assistant',
            model: 'gpt-4-turbo',
            temperature: 0.5,
            systemPrompt: 'You are a helpful assistant.',
            tools: ['search', 'calculator'],
          },
        ],
      };

      const result = mergeConfigs(baseConfig, override);
      expect(result.config.agents[0].model).toBe('gpt-4-turbo');
      expect(result.config.agents[0].temperature).toBe(0.5);
      expect(result.conflicts).toHaveLength(3);
    });

    it('should add new agents', () => {
      const override: Partial<SwarmConfig> = {
        agents: [
          {
            id: 'agent2',
            name: 'Agent Two',
            type: 'coder',
            model: 'gpt-3.5-turbo',
            temperature: 0.3,
            systemPrompt: 'You are a coding assistant.',
            tools: ['code-interpreter'],
          },
        ],
      };

      const result = mergeConfigs(baseConfig, override);
      expect(result.config.agents).toHaveLength(2);
      expect(result.warnings).toContain('Added new agent: Agent Two');
    });

    it('should detect name change conflict', () => {
      const override: Partial<SwarmConfig> = {
        name: 'New Swarm Name',
      };

      const result = mergeConfigs(baseConfig, override);
      expect(result.config.name).toBe('New Swarm Name');
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].path).toBe('name');
    });

    it('should handle multiple changes', () => {
      const override: Partial<SwarmConfig> = {
        name: 'Updated Swarm',
        globalSettings: {
          maxTokens: 4000,
          timeout: 30000,
          retryAttempts: 5,
        },
        agents: [
          {
            id: 'agent1',
            name: 'Updated Agent',
            type: 'assistant',
            model: 'gpt-4',
            temperature: 0.7,
            systemPrompt: 'Updated prompt.',
            tools: ['search'],
          },
        ],
      };

      const result = mergeConfigs(baseConfig, override);
      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.config.name).toBe('Updated Swarm');
      expect(result.config.globalSettings.retryAttempts).toBe(5);
      expect(result.config.agents[0].name).toBe('Updated Agent');
    });
  });

  describe('validateConfig', () => {
    it('should validate correct config', () => {
      const result = validateConfig(baseConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing name', () => {
      const invalidConfig = { ...baseConfig, name: '' };
      const result = validateConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Config name is required');
    });

    it('should detect missing agents', () => {
      const invalidConfig = { ...baseConfig, agents: [] };
      const result = validateConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one agent is required');
    });

    it('should detect missing agent name', () => {
      const invalidConfig = {
        ...baseConfig,
        agents: [{ ...baseConfig.agents[0], name: '' }],
      };
      const result = validateConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Agent name is required'))).toBe(true);
    });

    it('should detect invalid temperature', () => {
      const invalidConfig = {
        ...baseConfig,
        agents: [{ ...baseConfig.agents[0], temperature: 3 }],
      };
      const result = validateConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Temperature must be between'))).toBe(true);
    });

    it('should detect invalid maxTokens', () => {
      const invalidConfig = {
        ...baseConfig,
        globalSettings: { ...baseConfig.globalSettings, maxTokens: 0 },
      };
      const result = validateConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('maxTokens must be greater than 0');
    });

    it('should detect multiple errors', () => {
      const invalidConfig: SwarmConfig = {
        name: '',
        agents: [],
        globalSettings: { maxTokens: -1, timeout: 0, retryAttempts: 0 },
      };
      const result = validateConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('diffConfigs', () => {
    it('should return empty array for identical configs', () => {
      const differences = diffConfigs(baseConfig, baseConfig);
      expect(differences).toHaveLength(0);
    });

    it('should detect name change', () => {
      const compareConfig = { ...baseConfig, name: 'Different Name' };
      const differences = diffConfigs(baseConfig, compareConfig);
      expect(differences).toContain('name: "Base Swarm" → "Different Name"');
    });

    it('should detect global settings change', () => {
      const compareConfig = {
        ...baseConfig,
        globalSettings: { ...baseConfig.globalSettings, maxTokens: 4000 },
      };
      const differences = diffConfigs(baseConfig, compareConfig);
      expect(differences.some((d) => d.includes('globalSettings.maxTokens'))).toBe(true);
    });

    it('should detect added agent', () => {
      const compareConfig = {
        ...baseConfig,
        agents: [
          ...baseConfig.agents,
          {
            id: 'agent2',
            name: 'Agent Two',
            type: 'coder',
            model: 'gpt-3.5-turbo',
            temperature: 0.3,
            systemPrompt: 'Coding assistant.',
            tools: ['code'],
          },
        ],
      };
      const differences = diffConfigs(baseConfig, compareConfig);
      expect(differences.some((d) => d.includes('Added'))).toBe(true);
    });

    it('should detect removed agent', () => {
      const compareConfig = {
        ...baseConfig,
        agents: [],
      };
      const differences = diffConfigs(baseConfig, compareConfig);
      expect(differences.some((d) => d.includes('Removed'))).toBe(true);
    });

    it('should detect agent property change', () => {
      const compareConfig = {
        ...baseConfig,
        agents: [{ ...baseConfig.agents[0], temperature: 0.9 }],
      };
      const differences = diffConfigs(baseConfig, compareConfig);
      expect(differences.some((d) => d.includes('agents.agent1.temperature'))).toBe(true);
    });
  });
});
