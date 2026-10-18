import { escapeHtml } from '../shares/share-page.js';

/**
 * TEMPLATE, NOT LEGAL ADVICE: these pages describe what the app actually does so a lawyer has
 * an accurate starting point. Have them reviewed before a public launch.
 */
const page = (title: string, body: string, contact: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · ShortVid</title>
<style>body{font-family:system-ui,sans-serif;max-width:680px;margin:32px auto;padding:0 16px;line-height:1.55;color:#111418}h1{font-size:28px}h2{font-size:19px;margin-top:28px}.draft{background:#fff4e5;border:1px solid #f5c26b;padding:10px 14px;border-radius:8px}</style>
</head>
<body>
<p class="draft"><strong>Draft for legal review.</strong> Not yet reviewed by counsel.</p>
<h1>${title}</h1>
${body}
<h2>Contact</h2>
<p>Questions: <a href="mailto:${escapeHtml(contact)}">${escapeHtml(contact)}</a></p>
</body>
</html>`;

export function termsPage(contact: string): string {
  return page(
    'Terms of Service',
    `<p>By creating an account you agree to these terms.</p>
<h2>Your content</h2>
<p>You keep ownership of the videos and comments you post. You give ShortVid a licence to host, transcode, display and distribute them within the service. You must have the rights to everything you upload.</p>
<h2>Community rules</h2>
<ul>
<li>No spam, harassment, hate speech, threats or bullying.</li>
<li>No sexual content involving minors, no non-consensual intimate imagery, no graphic violence.</li>
<li>No impersonation, scams or illegal content.</li>
</ul>
<p>Anyone can report a video or comment. We review reports, may hide content (videos are hidden automatically after several reports, pending review) and may suspend accounts that break these rules. You can block any account.</p>
<h2>Your account</h2>
<p>You must be at least 13 (or the minimum age in your country). You can delete your account at any time in the app (Profile → Delete account); this permanently removes your profile, videos, comments, likes and follows.</p>
<h2>Changes and availability</h2>
<p>The service is provided as is during the beta. We may change these terms and will notify you in the app before changes take effect.</p>`,
    contact,
  );
}

export function privacyPage(contact: string): string {
  return page(
    'Privacy Policy',
    `<h2>What we collect</h2>
<ul>
<li><strong>Account:</strong> email, username, password (stored only as an Argon2 hash), optional display name, bio and profile photo.</li>
<li><strong>Content and activity:</strong> videos, captions, comments, likes, follows, shares, reports, blocks, and which videos you watched (used to avoid repeats in your feed for 24 hours).</li>
<li><strong>Technical:</strong> request logs (no passwords or tokens), error reports, and an anonymised hash of your IP address for rate limiting and view counting. We do not store raw IP addresses.</li>
<li><strong>Product analytics:</strong> app events such as sign-up, likes and uploads, linked to your user id only.</li>
</ul>
<h2>Who processes it</h2>
<ul>
<li>Mux (video upload, transcoding and streaming)</li>
<li>Cloudflare R2 (profile photos)</li>
<li>Railway and Upstash (hosting, database, cache)</li>
<li>Sentry (error reports, without IP addresses)</li>
<li>PostHog (product analytics)</li>
</ul>
<h2>Your choices</h2>
<p>You can edit your profile at any time and delete your account in the app (Profile → Delete account). Deletion is immediate and permanent, and your videos are removed from our video provider.</p>
<h2>Retention</h2>
<p>We keep your data while your account exists. Logs and error reports are kept for up to 90 days.</p>`,
    contact,
  );
}
