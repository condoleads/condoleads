/**
 * Image URL helpers for optimizing MLS photo delivery
 * 
 * PropTx images come in two variants:
 * - Thumbnail: rs:fit:240:240 (~15-30KB) - for cards, grids, previews
 * - Large: rs:fit:1920:1920 (~300-500KB) - for galleries, hero images
 */

/**
 * Convert large image URL to thumbnail for card displays
 * Reduces bandwidth by ~90% (500KB -> 15KB per image)
 */
export function getThumbnailUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  
  // Convert 1920:1920 large images to 240:240 thumbnails
  // Also remove the aq:size quality parameter that's only in large images
  return url
    .replace('rs:fit:1920:1920', 'rs:fit:240:240')
    .replace('/aq:size:512000:25:75', '');
}

/**
 * Ensure URL is the large variant for galleries/hero images
 * Use this when you need full quality images
 */
export function getLargeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  
  // If already large, return as-is
  if (url.includes('rs:fit:1920:1920')) return url;
  
  // Convert thumbnail to large
  return url.replace('rs:fit:240:240', 'rs:fit:1920:1920');
}
