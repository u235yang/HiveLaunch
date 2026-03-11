import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateId, truncate, deepClone, isEmpty, debounce, capitalize, kebabToPascalCase } from './helpers';

describe('generateId', () => {
  it('should generate a unique string', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });

  it('should include timestamp', () => {
    const id = generateId();
    expect(id.split('-')[0]).toMatch(/^\d+$/);
  });

  it('should include random part', () => {
    const id = generateId();
    expect(id.split('-')[1]).toBeDefined();
  });
});

describe('truncate', () => {
  it('should return original string if length is within limit', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('should truncate and add ellipsis if string exceeds limit', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('should handle empty string', () => {
    expect(truncate('', 10)).toBe('');
  });

  it('should handle maxLength of 3', () => {
    expect(truncate('hello', 3)).toBe('...');
  });
});

describe('deepClone', () => {
  it('should clone primitive values', () => {
    expect(deepClone(42)).toBe(42);
    expect(deepClone('hello')).toBe('hello');
    expect(deepClone(true)).toBe(true);
  });

  it('should clone arrays', () => {
    const original = [1, 2, 3];
    const cloned = deepClone(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
  });

  it('should clone nested objects', () => {
    const original = { a: 1, b: { c: 2 } };
    const cloned = deepClone(original);
    expect(cloned).toEqual(original);
    expect(cloned.b).not.toBe(original.b);
  });
});

describe('isEmpty', () => {
  it('should return true for empty object', () => {
    expect(isEmpty({})).toBe(true);
  });

  it('should return false for object with properties', () => {
    expect(isEmpty({ a: 1 })).toBe(false);
  });
});

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should delay function execution', () => {
    const func = vi.fn();
    const debouncedFunc = debounce(func, 100);

    debouncedFunc();
    expect(func).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(func).toHaveBeenCalledTimes(1);
  });

  it('should only call function once for multiple rapid calls', () => {
    const func = vi.fn();
    const debouncedFunc = debounce(func, 100);

    debouncedFunc();
    debouncedFunc();
    debouncedFunc();

    vi.advanceTimersByTime(100);
    expect(func).toHaveBeenCalledTimes(1);
  });
});

describe('capitalize', () => {
  it('should capitalize first letter', () => {
    expect(capitalize('hello')).toBe('Hello');
    expect(capitalize('HELLO')).toBe('HELLO');
    expect(capitalize('')).toBe('');
  });
});

describe('kebabToPascalCase', () => {
  it('should convert kebab-case to PascalCase', () => {
    expect(kebabToPascalCase('hello-world')).toBe('HelloWorld');
    expect(kebabToPascalCase('my-variable-name')).toBe('MyVariableName');
    expect(kebabToPascalCase('')).toBe('');
  });
});
