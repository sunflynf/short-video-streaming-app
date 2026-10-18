import { shouldAutoHide } from './reports.service.js';

describe('shouldAutoHide', () => {
  it('hides at five distinct reporters', () => {
    expect(shouldAutoHide(4)).toBe(false);
    expect(shouldAutoHide(5)).toBe(true);
    expect(shouldAutoHide(9)).toBe(true);
  });
});
