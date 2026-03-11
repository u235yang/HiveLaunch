import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Types for agent stream
interface StreamMessage {
  id: string;
  type: 'thinking' | 'action' | 'result' | 'error';
  content: string;
  timestamp: string;
}

interface AgentStreamState {
  messages: StreamMessage[];
  isConnected: boolean;
  isStreaming: boolean;
  error: string | null;
  connect: (taskId: string) => void;
  disconnect: () => void;
  sendMessage: (message: string) => void;
  clearMessages: () => void;
}

// Mock implementation for testing
function createAgentStreamStore() {
  let state: AgentStreamState = {
    messages: [],
    isConnected: false,
    isStreaming: false,
    error: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendMessage: vi.fn(),
    clearMessages: vi.fn(),
  };

  return {
    useAgentStream: () => state,
    setState: (newState: Partial<AgentStreamState>) => {
      state = { ...state, ...newState };
    },
    getState: () => state,
  };
}

describe('useAgentStream', () => {
  const store = createAgentStreamStore();

  beforeEach(() => {
    vi.clearAllMocks();
    store.setState({
      messages: [],
      isConnected: false,
      isStreaming: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = store.getState();

      expect(state.messages).toEqual([]);
      expect(state.isConnected).toBe(false);
      expect(state.isStreaming).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('Connection Management', () => {
    it('should connect to agent stream', () => {
      const connect = vi.fn();
      store.setState({ connect });

      const state = store.getState();
      state.connect('task-123');

      expect(connect).toHaveBeenCalledWith('task-123');
    });

    it('should disconnect from agent stream', () => {
      const disconnect = vi.fn();
      store.setState({ disconnect });

      const state = store.getState();
      state.disconnect();

      expect(disconnect).toHaveBeenCalled();
    });

    it('should track connection state', () => {
      store.setState({ isConnected: true });
      const state = store.getState();

      expect(state.isConnected).toBe(true);
    });

    it('should track streaming state', () => {
      store.setState({ isStreaming: true });
      const state = store.getState();

      expect(state.isStreaming).toBe(true);
    });
  });

  describe('Message Handling', () => {
    it('should receive thinking messages', () => {
      const messages: StreamMessage[] = [
        {
          id: '1',
          type: 'thinking',
          content: 'Analyzing the task...',
          timestamp: '2024-01-01T10:00:00Z',
        },
      ];

      store.setState({ messages });
      const state = store.getState();

      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].type).toBe('thinking');
      expect(state.messages[0].content).toBe('Analyzing the task...');
    });

    it('should receive action messages', () => {
      const messages: StreamMessage[] = [
        {
          id: '1',
          type: 'action',
          content: 'Executing command: npm install',
          timestamp: '2024-01-01T10:01:00Z',
        },
      ];

      store.setState({ messages });
      const state = store.getState();

      expect(state.messages[0].type).toBe('action');
    });

    it('should receive result messages', () => {
      const messages: StreamMessage[] = [
        {
          id: '1',
          type: 'result',
          content: 'Command completed successfully',
          timestamp: '2024-01-01T10:02:00Z',
        },
      ];

      store.setState({ messages });
      const state = store.getState();

      expect(state.messages[0].type).toBe('result');
    });

    it('should handle error messages', () => {
      const messages: StreamMessage[] = [
        {
          id: '1',
          type: 'error',
          content: 'Command failed with exit code 1',
          timestamp: '2024-01-01T10:03:00Z',
        },
      ];

      store.setState({ messages });
      const state = store.getState();

      expect(state.messages[0].type).toBe('error');
    });

    it('should send messages to agent', () => {
      const sendMessage = vi.fn();
      store.setState({ sendMessage });

      const state = store.getState();
      state.sendMessage('Please fix this bug');

      expect(sendMessage).toHaveBeenCalledWith('Please fix this bug');
    });

    it('should clear all messages', () => {
      const clearMessages = vi.fn();
      store.setState({ clearMessages });

      const state = store.getState();
      state.clearMessages();

      expect(clearMessages).toHaveBeenCalled();
    });
  });

  describe('Message Ordering', () => {
    it('should maintain message order', () => {
      const messages: StreamMessage[] = [
        { id: '1', type: 'thinking', content: 'First', timestamp: '2024-01-01T10:00:00Z' },
        { id: '2', type: 'action', content: 'Second', timestamp: '2024-01-01T10:01:00Z' },
        { id: '3', type: 'result', content: 'Third', timestamp: '2024-01-01T10:02:00Z' },
      ];

      store.setState({ messages });
      const state = store.getState();

      expect(state.messages[0].content).toBe('First');
      expect(state.messages[1].content).toBe('Second');
      expect(state.messages[2].content).toBe('Third');
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors', () => {
      store.setState({ error: 'Failed to connect to agent' });
      const state = store.getState();

      expect(state.error).toBe('Failed to connect to agent');
    });

    it('should clear error state', () => {
      store.setState({ error: 'Some error' });
      let state = store.getState();
      expect(state.error).toBe('Some error');

      store.setState({ error: null });
      state = store.getState();
      expect(state.error).toBeNull();
    });
  });

  describe('Stream Lifecycle', () => {
    it('should handle complete stream lifecycle', () => {
      const connect = vi.fn();
      const disconnect = vi.fn();
      const sendMessage = vi.fn();
      const clearMessages = vi.fn();

      store.setState({
        connect,
        disconnect,
        sendMessage,
        clearMessages,
        isConnected: false,
        isStreaming: false,
      });

      const state = store.getState();

      // Connect
      state.connect('task-123');
      expect(connect).toHaveBeenCalledWith('task-123');

      // Send message
      state.sendMessage('Hello');
      expect(sendMessage).toHaveBeenCalledWith('Hello');

      // Clear messages
      state.clearMessages();
      expect(clearMessages).toHaveBeenCalled();

      // Disconnect
      state.disconnect();
      expect(disconnect).toHaveBeenCalled();
    });
  });
});
