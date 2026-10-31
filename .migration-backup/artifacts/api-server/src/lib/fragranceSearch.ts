import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();
const braveFetch = connectors.createProxyFetch("brave");

type ImageHit = {
  title?: string; url?: string; source?: string;
  thumbnail?: { src?: string };
  properties?: { url?: string; width?: number; height?: number };
};
type WebHit = { title?: string; url?: string; description?: string; extra_snippets?: string[] };

export function publicHttps(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || !host.includes(".") || host.endsWith(".local") ||
        host.endsWith(".internal") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return "";
    return url.href;
  } catch { return ""; }
}

async function search(path: string, query: URLSearchParams): Promise<unknown> {
  const response = await braveFetch(`${path}?${query}`, {
    method: "GET",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(response.status === 429
      ? "Brave search is busy. Please wait and try again."
      : "Brave search could not complete. Please try again.");
  }
  return response.json();
}

export async function searchPerfumeImages(query: string) {
  const data = await search("/res/v1/images/search", new URLSearchParams({
    q: `${query} perfume bottle product`, count: "16", safesearch: "strict",
  })) as { results?: ImageHit[] };
  const seen = new Set<string>();
  return (data.results ?? []).flatMap((hit) => {
    const image = publicHttps(hit.properties?.url);
    const source = publicHttps(hit.url);
    if (!image || !source || seen.has(image)) return [];
    seen.add(image);
    return [{
      title: (hit.title || query).slice(0, 250),
      image_url: image,
      thumbnail_url: publicHttps(hit.thumbnail?.src) || image,
      source_url: source,
      source: (hit.source || new URL(source).hostname).slice(0, 150),
    }];
  }).slice(0, 12);
}

export async function searchPerfumeFacts(query: string) {
  const data = await search("/res/v1/web/search", new URLSearchParams({
    q: `${query} perfume official fragrance top heart base notes`,
    count: "5", safesearch: "strict", extra_snippets: "true",
  })) as { web?: { results?: WebHit[] } };
  return (data.web?.results ?? []).flatMap((hit) => {
    const url = publicHttps(hit.url);
    if (!url) return [];
    return [{
      title: (hit.title || query).slice(0, 250), url,
      excerpt: [hit.description, ...(hit.extra_snippets || [])]
        .filter(Boolean).join(" ").replace(/<[^>]*>/g, "").slice(0, 1800),
    }];
  }).slice(0, 5);
}
