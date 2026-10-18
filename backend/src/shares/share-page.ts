const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

/** Minimal landing page for shared links: link previews (Open Graph) and an open-in-app link. */
export function renderSharePage(opts: {
  videoId: string;
  caption: string | null;
  authorUsername: string;
  thumbnailUrl: string | null;
}): string {
  const title = escapeHtml(opts.caption || `A video by @${opts.authorUsername}`);
  const author = escapeHtml(`@${opts.authorUsername}`);
  const appLink = `shortvid://video/${encodeURIComponent(opts.videoId)}`;
  const image = opts.thumbnailUrl ? escapeHtml(opts.thumbnailUrl) : null;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · ShortVid</title>
<meta property="og:type" content="video.other">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${author} on ShortVid">
${image ? `<meta property="og:image" content="${image}">` : ''}
<style>body{font-family:system-ui,sans-serif;max-width:420px;margin:40px auto;padding:0 16px;text-align:center}img{width:100%;border-radius:12px}a{display:inline-block;margin-top:16px;padding:12px 20px;border-radius:8px;background:#208AEF;color:#fff;text-decoration:none}</style>
</head>
<body>
${image ? `<img src="${image}" alt="">` : ''}
<h1>${title}</h1>
<p>${author}</p>
<a href="${appLink}">Open in ShortVid</a>
</body>
</html>`;
}

export const NOT_FOUND_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Video not found · ShortVid</title></head>
<body><h1>This video isn't available</h1></body></html>`;
