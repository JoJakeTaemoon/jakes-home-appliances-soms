/**
 * Visit photo rows come in two shapes: uploads from the field app store
 * `{ storageKey: "uploads/visits/{id}/{file}" }` (served by
 * /uploads/visits/[visitId]/[filename]), while seed / legacy rows carry a
 * ready `{ url }`. Returns the `<img src>` for either, or null.
 */
export function photoSrc(p: unknown): string | null {
  if (!p || typeof p !== "object") return null;
  const { url, storageKey } = p as { url?: unknown; storageKey?: unknown };
  if (typeof url === "string" && url) return url;
  if (typeof storageKey === "string" && storageKey) return `/${storageKey.replace(/^\/+/, "")}`;
  return null;
}
