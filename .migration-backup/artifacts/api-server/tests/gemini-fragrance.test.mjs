import assert from "node:assert/strict";
import { test } from "node:test";
import { generateFragranceDraft, FragranceAiError } from "../src/lib/geminiFragrance.ts";

const draft = {
  title: "Example", brand: "Example", price: 0, category: "Perfect",
  description: "", top_notes: [], heart_notes: [], base_notes: [], ingredients: [],
};
const success = () => Response.json({
  candidates: [{ content: { parts: [{ text: JSON.stringify(draft) }] } }],
});
const options = (fetcher) => ({ fetcher, retryDelayMs: 0 });

test("requests a complete structured draft without unnecessary thinking", async () => {
  const result = await generateFragranceDraft("test-only", "test query", options(async (_url, init) => {
    const config = JSON.parse(init.body).generationConfig;
    assert.equal(config.thinkingConfig.thinkingBudget, 0);
    assert.equal(config.maxOutputTokens, 8192);
    assert.ok(config.responseSchema.required.includes("top_notes"));
    return success();
  }));
  assert.deepEqual(result, draft);
});

for (const status of [500, 502, 503, 504, 408]) {
  test(`recovers automatically from a temporary HTTP ${status}`, async () => {
    let calls = 0;
    const result = await generateFragranceDraft("test-only", "test", options(async () =>
      ++calls === 1 ? new Response("upstream error", { status }) : success()));
    assert.equal(calls, 2);
    assert.deepEqual(result, draft);
  });
}

test("stops after one retry and returns a meaningful provider-unavailable error", async () => {
  let calls = 0;
  await assert.rejects(generateFragranceDraft("test-only", "test", options(async () => {
    calls++;
    return new Response("bad gateway", { status: 502 });
  })), (error) => error instanceof FragranceAiError && error.statusCode === 503 && error.upstreamStatus === 502);
  assert.equal(calls, 2);
});

for (const status of [429, 400, 401, 403, 404]) {
  test(`does not retry quota/configuration HTTP ${status}`, async () => {
    let calls = 0;
    await assert.rejects(generateFragranceDraft("test-only", "test", options(async () => {
      calls++;
      return new Response("rejected", { status });
    })), (error) => error instanceof FragranceAiError && error.statusCode === (status === 429 ? 429 : 503));
    assert.equal(calls, 1);
  });
}

test("recovers from an interrupted network connection", async () => {
  let calls = 0;
  const result = await generateFragranceDraft("test-only", "test", options(async () => {
    if (++calls === 1) throw new TypeError("network connection reset");
    return success();
  }));
  assert.equal(calls, 2);
  assert.deepEqual(result, draft);
});

for (const invalid of [
  { candidates: [] },
  { candidates: [{ content: { parts: [{ text: "{incomplete" }] } }] },
  { candidates: [{ content: { parts: [{ text: "[]" }] } }] },
]) {
  test("retries an empty or malformed AI response", async () => {
    let calls = 0;
    const result = await generateFragranceDraft("test-only", "test", options(async () =>
      ++calls === 1 ? Response.json(invalid) : success()));
    assert.equal(calls, 2);
    assert.deepEqual(result, draft);
  });
}

test("both attempts share a bounded deadline, including response-body reads", async () => {
  let calls = 0;
  const start = Date.now();
  await assert.rejects(generateFragranceDraft("test-only", "test", {
    budgetMs: 70, attemptMs: 45, retryDelayMs: 0,
    fetcher: async (_url, { signal }) => {
      calls++;
      return {
        ok: true,
        json: () => new Promise((_resolve, reject) => {
          const keepAlive = setTimeout(() => reject(new Error("test deadline exceeded")), 1_000);
          signal.addEventListener("abort", () => {
            clearTimeout(keepAlive);
            reject(signal.reason);
          }, { once: true });
        }),
      };
    },
  }), (error) => error instanceof FragranceAiError && error.statusCode === 503 && /timed out/.test(error.message));
  assert.ok(calls >= 1 && calls <= 2);
  assert.ok(Date.now() - start < 800);
});
