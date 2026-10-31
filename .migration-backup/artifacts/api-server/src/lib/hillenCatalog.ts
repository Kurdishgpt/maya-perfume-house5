export const HILLEN_ORIGIN = "https://hillen99.com";
export const HILLEN_PAGE_SIZE = 100;

export type HillenMaterial = {
  source_id: number; source_sku: string | null; name: string; description: string; source_description: string;
  category: string; source_category: string;
  price: number; currency: "USD" | "IQD"; image_url: string;
  source_url: string; supplier_available: boolean; unit: "g" | "item"; quantity_options: Array<{ label: string; value: string; price?: number; currency?: string; unit?: string }>;
};
export type HillenCategory = { id: number; name: string; slug: string; count: number };
type SupplierProduct = {
  id?: number; name?: string; sku?: string; type?: string; slug?: string; permalink?: string;
  description?: string; short_description?: string; is_in_stock?: boolean;
  weight?: string; attributes?: Array<{ name?: string; terms?: Array<{ name?: string }> }>;
  variations?: Array<{ id?: number; attributes?: Array<{ name?: string; value?: string }>; price?: string }>;
  prices?: { price?: string; currency_code?: string; currency_minor_unit?: number; price_range?: unknown };
  categories?: Array<{ name?: string }>; images?: Array<{ src?: string }>;
};

export function plainText(html: string) {
  return html.replace(/<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, "")
    .split(/<div\b[^>]*class=["'][^"']*tinv/i)[0]
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, code: string) => {
      const n = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    })
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|ndash|mdash|rsquo|lsquo|rdquo|ldquo);/g, (entity) => ({
      "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " ",
      "&ndash;": "–", "&mdash;": "—", "&rsquo;": "'", "&lsquo;": "'", "&rdquo;": '"', "&ldquo;": '"',
    })[entity] ?? "")
    .replace(/\s+/g, " ").trim();
}

export function hillenUrl(value: unknown) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["hillen99.com", "www.hillen99.com"].includes(url.hostname)
      && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

export function unsupportedHillenReason(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "invalid supplier listing";
  const product = value as SupplierProduct;
  if (!Number.isSafeInteger(product.id) || product.id! <= 0) return "missing supplier product ID";
  if (typeof product.name !== "string" || !plainText(product.name)) return "missing product name";
  if (product.type !== "simple") return `unsupported supplier product type (${typeof product.type === "string" ? product.type : "unknown"})`;
  if (/\b(pipette|scale|bottles?)\b/i.test(`${product.name} ${product.slug ?? ""}`)) {
    return "equipment listing, not a per-gram perfume material";
  }
  const price = product.prices;
  if (!price || typeof price.price !== "string" || !/^\d+$/.test(price.price) ||
      !Number.isInteger(price.currency_minor_unit) || price.currency_minor_unit! < 0 ||
      price.currency_minor_unit! > 6 || !["USD", "IQD"].includes(price.currency_code ?? "") ||
      price.price_range != null) return "supplier price, currency, or unit could not be verified";
  if (!hillenUrl(product.permalink)) return "supplier product link is missing or outside Hillen99";
  return "unsupported supplier listing; price per gram could not be verified";
}

export function parseHillenMaterial(value: unknown): { material: HillenMaterial; evidence: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const product = value as SupplierProduct;
  const price = product.prices;
  if (!Number.isSafeInteger(product.id) || product.id! <= 0 || typeof product.name !== "string" ||
      product.type !== "simple" || !price || typeof price.price !== "string" || !/^\d+$/.test(price.price) ||
      !Number.isInteger(price.currency_minor_unit) || price.currency_minor_unit! < 0 || price.currency_minor_unit! > 6 ||
      !["USD", "IQD"].includes(price.currency_code ?? "") || price.price_range != null) return null;
  // Multi-item sets are priced per set, not per gram; keep their unit explicit.
  if (/\b(pipette|scale|bottles?)\b/i.test(`${product.name} ${product.slug ?? ""}`)) return null;
  const amount = Number(price.price) / 10 ** price.currency_minor_unit!;
  const sourceUrl = hillenUrl(product.permalink);
  if (!Number.isFinite(amount) || amount < 0 || amount > 99999999 || !sourceUrl) return null;
  const name = plainText(product.name).slice(0, 500);
  if (!name) return null;
  const perItem = /\b(kit|bundle|bag)\b|حقيبة|مجموعة تعليمية/i.test(`${name} ${product.slug ?? ""}`);
  const unit: "g" | "item" = perItem ? "item" : "g";
  const sourceCategory = (Array.isArray(product.categories) ? product.categories
    .map((c) => plainText(typeof c.name === "string" ? c.name : ""))
    .filter(Boolean).join(" / ") : "").slice(0, 150);
  const category = (sourceCategory.split(" / ").filter((name) => name && name !== ".").join(" / ") || "Raw Material").slice(0, 150);
  const evidence = plainText(typeof product.short_description === "string" && product.short_description
    ? product.short_description : typeof product.description === "string" ? product.description : "").slice(0, 1800);
  const fullEvidence = plainText(typeof product.description === "string" ? product.description : "").slice(0, 18_000);
  const categories = Array.isArray(product.attributes) ? product.attributes.flatMap((attribute) =>
    (attribute.terms ?? []).filter((term): term is { name: string } => typeof term.name === "string")
      .map((term) => ({ label: attribute.name || "Option", value: term.name, unit: /g(?:ram)?/i.test(term.name) ? "g" : undefined }))) : [];
  const variationOptions = Array.isArray(product.variations) ? product.variations.flatMap((variation) => {
    const priceValue = variation.price && /^\d+$/.test(variation.price) && price.currency_minor_unit !== undefined
      ? Number(variation.price) / 10 ** price.currency_minor_unit : undefined;
    return (variation.attributes ?? []).map((attribute) => ({
      label: attribute.name || "Option", value: attribute.value || "",
      ...(priceValue !== undefined ? { price: priceValue, currency: price.currency_code } : {}),
      ...(product.weight ? { unit: product.weight } : {}),
    })).filter((option) => option.value);
  }) : [];
  const quantityOptions = [...new Map([...categories, ...variationOptions]
    .map((option) => {
      const optionPrice = "price" in option ? option.price : undefined;
      return [`${option.label}|${option.value}|${optionPrice ?? ""}`, option] as const;
    })).values()];
  const cas = evidence.match(/\b\d{2,7}-\d{2}-\d\b/)?.[0];
  return {
    material: {
      source_id: product.id!, name, category, price: amount, currency: price.currency_code as "USD" | "IQD",
      // Original factual copy, not wholesale republication of supplier marketing text.
      source_category: sourceCategory, description: perItem
        ? `${name} is listed by Hillen99 as a set.${cas ? ` CAS: ${cas}.` : ""} Confirm the included items and price with the supplier.`
        : `${name} — ${category} perfumery material listed by Hillen99.${cas ? ` CAS: ${cas}.` : ""} Consult the supplier documentation before use.`,
      source_sku: typeof product.sku === "string" && product.sku.trim() ? product.sku.trim().slice(0, 200) : null,
      image_url: hillenUrl(Array.isArray(product.images) ? product.images[0]?.src : ""),
      source_url: sourceUrl, supplier_available: product.is_in_stock === true,
      source_description: fullEvidence, unit, quantity_options: quantityOptions.slice(0, 50),
    },
    evidence,
  };
}

export class HillenError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = false) { super(message); this.retryable = retryable; }
}

async function supplierRequest(path: string, fetcher: typeof fetch = fetch) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetcher(`${HILLEN_ORIGIN}/wp-json/wc/store/v1/${path}`, {
        headers: { Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new HillenError(
          response.status === 429
            ? "Hillen99 is limiting requests. Wait briefly, then retry."
            : "Hillen99 could not provide this catalog page. Retry; completed pages are saved.",
          response.status === 408 || response.status >= 500,
        );
      }
      const reader = response.body?.getReader();
      if (!reader) throw new HillenError("Hillen99 returned an empty response.");
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 3_000_000) {
          await reader.cancel();
          throw new HillenError("The supplier response is too large to process safely.");
        }
        chunks.push(chunk.value);
      }
      return { data: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown, headers: response.headers };
    } catch (error) {
      if (error instanceof HillenError && !error.retryable) throw error;
      if (attempt === 1) break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw new HillenError("Could not reach Hillen99 after a quick retry. Your saved materials are unchanged; try again.");
}

export async function fetchHillenPage(page: number, categoryId?: number) {
  const params = new URLSearchParams({ per_page: String(HILLEN_PAGE_SIZE), page: String(page), orderby: "id", order: "asc" });
  if (categoryId !== undefined) params.set("category", String(categoryId));
  const { data, headers } = await supplierRequest(`products?${params}`);
  const total = Number(headers.get("x-wp-total"));
  const totalPages = Number(headers.get("x-wp-totalpages"));
  if (!Array.isArray(data) || !Number.isSafeInteger(total) || total < 0 ||
      !Number.isSafeInteger(totalPages) || totalPages < 1 || totalPages > 1000) {
    throw new HillenError("Hillen99 returned an incomplete catalog page. Import stopped without changing saved items.");
  }
  return { products: data, total, totalPages };
}

export async function fetchHillenCategories(): Promise<HillenCategory[]> {
  const { data, headers } = await supplierRequest("products/categories?per_page=100&page=1&hide_empty=true");
  if (!Array.isArray(data)) throw new HillenError("Hillen99 returned invalid product categories.");
  const pages = Math.max(1, Math.min(100, Number(headers.get("x-wp-totalpages")) || 1));
  const all: unknown[] = [...data];
  for (let page = 2; page <= pages; page++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const next = await supplierRequest(`products/categories?per_page=100&page=${page}&hide_empty=true`);
    if (!Array.isArray(next.data)) throw new HillenError("Hillen99 returned an incomplete product category page.");
    all.push(...next.data);
  }
  return all.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const category = value as { id?: number; name?: string; slug?: string; count?: number };
    if (!Number.isSafeInteger(category.id) || !category.id || typeof category.name !== "string" || !category.slug) return [];
    return [{ id: category.id, name: plainText(category.name).slice(0, 150), slug: category.slug, count: Number.isSafeInteger(category.count) ? category.count! : 0 }];
  });
}

export async function fetchHillenMaterial(id: number) {
  const { data } = await supplierRequest(`products/${id}`);
  const parsed = parseHillenMaterial(data);
  if (!parsed || parsed.material.source_id !== id) throw new HillenError("This supplier item is not a supported per-gram raw material.");
  return parsed;
}

export async function searchHillenMaterials(query: string) {
  const { data } = await supplierRequest(`products?${new URLSearchParams({ per_page: "12", search: query })}`);
  if (!Array.isArray(data)) throw new HillenError("Hillen99 returned invalid search results.");
  return data.map(parseHillenMaterial).filter((item): item is NonNullable<typeof item> => item !== null);
}
