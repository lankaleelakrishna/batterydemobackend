/** URL-safe slug, matching the frontend's `brandSlug` (lowercase, non-alphanumerics become hyphens). */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Normalises text for search, matching the frontend's `matchesQuery` rule:
 * spaces, hyphens, underscores and slashes are ignored, so "tt150" finds "TT-150".
 */
export function normalizeSearchText(input: string): string {
  return input.toLowerCase().replace(/[\s\-_/]+/g, '');
}
