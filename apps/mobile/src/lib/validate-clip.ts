export const MAX_CLIP_SECONDS = 60;
export const MAX_CLIP_BYTES = 500 * 1024 * 1024;

/**
 * Checks a picked video before uploading, so users don't wait on a guaranteed server-side
 * failure. `durationMs` and `fileSize` come from the image picker and may be missing.
 */
export function validateClip(clip: {
  durationMs?: number | null;
  fileSize?: number | null;
}): string | null {
  // Matches the server: a second of slack for encoder rounding.
  if (clip.durationMs != null && clip.durationMs > (MAX_CLIP_SECONDS + 1) * 1000) {
    return `Clips can be up to ${MAX_CLIP_SECONDS} seconds long.`;
  }
  if (clip.fileSize != null && clip.fileSize > MAX_CLIP_BYTES) {
    return 'This file is too large (max 500 MB).';
  }
  return null;
}
