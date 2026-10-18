import { formatCount, timeAgo } from './format';
import { validateClip } from './validate-clip';

describe('formatCount', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1000, '1K'],
    [1234, '1.2K'],
    [123_456, '123K'],
    [1_250_000, '1.3M'],
  ])('%d → %s', (n, expected) => expect(formatCount(n)).toBe(expected));
});

describe('timeAgo', () => {
  const now = Date.parse('2026-10-18T12:00:00Z');
  it.each([
    ['2026-10-18T11:59:30Z', 'now'],
    ['2026-10-18T11:55:00Z', '5m'],
    ['2026-10-18T09:00:00Z', '3h'],
    ['2026-10-16T12:00:00Z', '2d'],
    ['2026-09-27T12:00:00Z', '3w'],
  ])('%s → %s', (iso, expected) => expect(timeAgo(iso, now)).toBe(expected));
});

describe('validateClip', () => {
  it('accepts clips within the limits or with unknown metadata', () => {
    expect(validateClip({ durationMs: 60_500, fileSize: 50_000_000 })).toBeNull();
    expect(validateClip({})).toBeNull();
    expect(validateClip({ durationMs: null, fileSize: null })).toBeNull();
  });

  it('rejects long clips and huge files', () => {
    expect(validateClip({ durationMs: 75_000 })).toMatch(/60 seconds/);
    expect(validateClip({ fileSize: 600 * 1024 * 1024 })).toMatch(/too large/);
  });
});
