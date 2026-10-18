import { toPage } from './pagination.js';

describe('toPage', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const cursorOf = (r: { id: string }) => r.id;
  const map = (r: { id: string }) => r.id.toUpperCase();

  it('returns a cursor when an extra row was fetched', () => {
    expect(toPage(rows, 2, cursorOf, map)).toEqual({ items: ['A', 'B'], nextCursor: 'b' });
  });

  it('returns a null cursor on the last page', () => {
    expect(toPage(rows, 3, cursorOf, map)).toEqual({ items: ['A', 'B', 'C'], nextCursor: null });
  });

  it('handles an empty page', () => {
    expect(toPage([], 10, cursorOf, map)).toEqual({ items: [], nextCursor: null });
  });
});
