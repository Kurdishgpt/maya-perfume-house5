import test from "node:test";
import assert from "node:assert/strict";
import { hillenUrl, parseHillenMaterial, plainText } from "../src/lib/hillenCatalog.ts";

function listing(overrides = {}) {
  return {
    id: 2176,
    type: "simple",
    name: "هندينول | HINDINOL",
    sku: "",
    permalink: "https://hillen99.com/product/hindinol/",
    short_description: "",
    description: "<p>Hindinol</p><p>CAS: 28219-60-5</p><script>bad()</script>",
    is_in_stock: true,
    prices: { price: "100", currency_minor_unit: 2, currency_code: "USD", price_range: null },
    categories: [{ name: "Aroma Chemical" }],
    attributes: [],
    variations: [],
    images: [{ src: "https://hillen99.com/wp-content/uploads/hindinol.jpg" }],
    ...overrides,
  };
}

test("supplier minor units are converted to the listed USD-per-gram price", () => {
  const parsed = parseHillenMaterial(listing());
  assert.equal(parsed.material.price, 1);
  assert.equal(parsed.material.currency, "USD");
  assert.equal(parsed.material.unit, "g");
  assert.equal(parsed.material.source_id, 2176);
  assert.equal(parsed.material.source_sku, null);
  assert.match(parsed.material.description, /28219-60-5/);
  assert.match(parsed.material.source_url, /hindinol/);
  assert.deepEqual(parsed.material.quantity_options, []);
});

test("preserves the source category label while giving unlabelled products a clear display group", () => {
  const parsed = parseHillenMaterial(listing({ categories: [{ name: "." }] }));
  assert.equal(parsed.material.category, "Raw Material");
  assert.equal(parsed.material.source_category, ".");
});

test("preserves source descriptions as text while removing scripts and handling HTML entities", () => {
  assert.equal(plainText("<p>Arab &#8211; English &amp; notes</p><script>secret()</script>"), "Arab – English & notes");
  const parsed = parseHillenMaterial(listing());
  assert.match(parsed.material.source_description, /CAS: 28219-60-5/);
  assert.doesNotMatch(parsed.material.source_description, /bad\(\)|<script/i);
});

test("captures package-option attributes only when the supplier publishes them", () => {
  const parsed = parseHillenMaterial(listing({
    attributes: [{ name: "Pack size", terms: [{ name: "10g" }, { name: "25g" }] }],
    variations: [{ attributes: [{ name: "Pack size", value: "10g" }], price: "8500" }],
  }));
  assert.deepEqual(parsed.material.quantity_options, [
    { label: "Pack size", value: "10g", unit: "g" },
    { label: "Pack size", value: "25g", unit: "g" },
    { label: "Pack size", value: "10g", price: 85, currency: "USD" },
  ]);
});

test("stores supplier kits as per-item prices without treating them as per-gram materials", () => {
  const kit = listing({
    id: 1120, name: "The Gold Bag – الحقيبة الذهبية",
    slug: "the-gold-bag",
    prices: { price: "21100", currency_minor_unit: 2, currency_code: "USD", price_range: null },
    categories: [{ name: "Absolute" }, { name: "Aroma Chemical" }, { name: "Essential Oil" }],
    description: "<p>Complete educational set containing perfume-making materials and tools.</p>",
  });
  const parsed = parseHillenMaterial(kit);
  assert.equal(parsed.material.price, 211);
  assert.equal(parsed.material.unit, "item");
  assert.match(parsed.material.description, /confirm the included items and price/i);
  assert.equal(parsed.material.category, "Absolute / Aroma Chemical / Essential Oil");
});

test("rejects missing/invalid prices, unsupported equipment and non-source product pages", () => {
  assert.equal(parseHillenMaterial(listing({ type: "variable" })), null);
  assert.equal(parseHillenMaterial(listing({ prices: { price: "", currency_minor_unit: 2, currency_code: "USD" } })), null);
  assert.equal(parseHillenMaterial(listing({ permalink: "https://evil.example/p/1/" })), null);
  assert.equal(parseHillenMaterial(listing({ name: "Perfumery scale" })), null);
});

test("rejects unsafe image hosts but keeps the verified supplier item", () => {
  const parsed = parseHillenMaterial(listing({ images: [{ src: "https://evil.example/image.jpg" }] }));
  assert.ok(parsed);
  assert.equal(parsed.material.image_url, "");
  assert.equal(hillenUrl("http://hillen99.com/image.jpg"), "");
  assert.equal(hillenUrl("https://hillen99.com.evil.example/image.jpg"), "");
});
