import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatDate, getTimeDiffMinutes, formatDuration } from './date-formatter';

describe('formatDate', () => {
  describe('relative format', () => {
    it('should return "just now" for dates less than 1 minute ago', () => {
      const now = new Date();
      const recentDate = new Date(now.getTime() - 30000).toISOString();
      expect(formatDate(recentDate, 'relative')).toBe('just now');
    });

    it('should return minutes for dates less than 1 hour ago', () => {
      const now = new Date();
      const minutesAgo = new Date(now.getTime() - 30 * 60000).toISOString();
      const result = formatDate(minutesAgo, 'relative');
      expect(result).toContain('m ago');
    });

    it('should return hours for dates less than 24 hours ago', () => {
      const now = new Date();
      const hoursAgo = new Date(now.getTime() - 5 * 3600000).toISOString();
      const result = formatDate(hoursAgo, 'relative');
      expect(result).toContain('h ago');
    });

    it('should return days for dates less than 7 days ago', () => {
      const now = new Date();
      const daysAgo = new Date(now.getTime() - 3 * 86400000).toISOString();
      const result = formatDate(daysAgo, 'relative');
      expect(result).toContain('d ago');
    });
  });

  describe('short format', () => {
    it('should format date in short format (MMM D)', () => {
      const dateString = '2024-03-15T10:00:00.000Z';
      const result = formatDate(dateString, 'short');
      expect(result).toMatch(/[A-Z][a-z]{2} \d{1,2}/);
    });
  });

  describe('long format', () => {
    it('should format date in long format (Month D, YYYY)', () => {
      const dateString = '2024-03-15T10:00:00.000Z';
      const result = formatDate(dateString, 'long');
      expect(result).toMatch(/\w+ \d{1,2}, \d{4}/);
    });
  });

  describe('time format', () => {
    it('should format date in time format (HH:MM)', () => {
      const dateString = '2024-03-15T10:30:00.000Z';
      const result = formatDate(dateString, 'time');
      expect(result).toMatch(/\d{1,2}:\d{2}/);
    });
  });
});

describe('getTimeDiffMinutes', () => {
  it('should return positive difference when second date is later', () => {
    const date1 = '2024-03-15T10:00:00.000Z';
    const date2 = '2024-03-15T10:30:00.000Z';
    expect(getTimeDiffMinutes(date1, date2)).toBe(30);
  });

  it('should return negative difference when first date is later', () => {
    const date1 = '2024-03-15T10:30:00.000Z';
    const date2 = '2024-03-15T10:00:00.000Z';
    expect(getTimeDiffMinutes(date1, date2)).toBe(-30);
  });

  it('should return 0 for same dates', () => {
    const date = '2024-03-15T10:00:00.000Z';
    expect(getTimeDiffMinutes(date, date)).toBe(0);
  });
});

describe('formatDuration', () => {
  it('should format milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  it('should format seconds', () => {
    expect(formatDuration(3000)).toBe('3s');
  });

  it('should format minutes and seconds', () => {
    expect(formatDuration(90000)).toBe('1m 30s');
  });
});
