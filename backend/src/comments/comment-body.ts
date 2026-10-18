/** Normalizes line endings, trims, and collapses runs of blank lines to a single blank line. */
export function sanitizeCommentBody(body: string): string {
  return body
    .replace(/\r\n?/g, '\n')
    .trim()
    .replace(/\n{3,}/g, '\n\n');
}
