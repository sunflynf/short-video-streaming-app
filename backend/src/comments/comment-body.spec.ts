import { sanitizeCommentBody } from './comment-body.js';

describe('sanitizeCommentBody', () => {
  it('trims and normalizes line endings', () => {
    expect(sanitizeCommentBody('  hi\r\nthere\r  ')).toBe('hi\nthere');
  });

  it('collapses 3+ newlines to one blank line', () => {
    expect(sanitizeCommentBody('a\n\n\n\n\nb\n\nc')).toBe('a\n\nb\n\nc');
  });

  it('turns whitespace-only input into an empty string', () => {
    expect(sanitizeCommentBody(' \n\t \r\n ')).toBe('');
  });
});
