import { escapeHtml, renderSharePage } from './share-page.js';

describe('share page', () => {
  it('escapes HTML in user content', () => {
    expect(escapeHtml(`<script>"x" & 'y'</script>`)).toBe(
      '&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;',
    );
    const html = renderSharePage({
      videoId: 'v1',
      caption: '<img src=x onerror=alert(1)>',
      authorUsername: 'ann',
      thumbnailUrl: null,
    });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('falls back to the author when there is no caption', () => {
    const html = renderSharePage({
      videoId: 'v1',
      caption: null,
      authorUsername: 'ann',
      thumbnailUrl: 'https://image.mux.com/pb/thumbnail.jpg?time=1',
    });
    expect(html).toContain('<title>A video by @ann · ShortVid</title>');
    expect(html).toContain('og:image" content="https://image.mux.com/pb/thumbnail.jpg?time=1"');
    expect(html).toContain('href="shortvid://video/v1"');
  });
});
