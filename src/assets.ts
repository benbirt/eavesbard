/**
 * The URL of another file in the site, carrying this bundle's version query
 * (`?v=<hash>`, added at build time), so a cached old worker or worklet is
 * never paired with a new page.
 */
export function assetUrl(path: string): string {
  const version = new URL(import.meta.url).search;
  return new URL(path + version, import.meta.url).href;
}
