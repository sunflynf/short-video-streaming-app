const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:3000';

/**
 * Shared links point at `${WEB_URL}/v/:id` (the server's landing page). When the OS opens the
 * app with one (universal / app links), route it to the in-app video screen.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const url = new URL(path, WEB_URL);
    const match = /^\/v\/([^/]+)\/?$/.exec(url.pathname);
    return match ? `/video/${match[1]}` : path;
  } catch {
    return path;
  }
}
