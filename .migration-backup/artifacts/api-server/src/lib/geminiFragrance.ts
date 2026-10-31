const noteList = { type: "ARRAY", items: { type: "STRING" } };
const draftSchema = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    brand: { type: "STRING" },
    price: { type: "NUMBER" },
    category: { type: "STRING", enum: ["Women", "Men", "Perfect"] },
    description: { type: "STRING" },
    top_notes: noteList,
    heart_notes: noteList,
    base_notes: noteList,
    ingredients: noteList,
  },
  required: ["title", "brand", "price", "category", "description", "top_notes", "heart_notes", "base_notes", "ingredients"],
};

export class FragranceAiError extends Error {
  readonly statusCode: 429 | 502 | 503;
  readonly retryable: boolean;
  readonly upstreamStatus?: number;

  constructor(message: string, statusCode: 429 | 502 | 503, retryable: boolean, upstreamStatus?: number) {
    super(message);
    this.name = "FragranceAiError";
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.upstreamStatus = upstreamStatus;
  }
}

type Options = {
  fetcher?: typeof fetch;
  budgetMs?: number;
  attemptMs?: number;
  retryDelayMs?: number;
};

// One retry, bounded across both attempts (including reading the response body).
// Together with the 8s research timeout, keep the route below 30s.
export async function generateFragranceDraft(apiKey: string, prompt: string, options: Options = {}): Promise<Record<string, unknown>> {
  const fetcher = options.fetcher ?? fetch;
  const deadline = Date.now() + (options.budgetMs ?? 20_000);
  let failure = new FragranceAiError("The AI request timed out. Please try again.", 503, true);
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const signal = AbortSignal.timeout(Math.max(1, Math.min(options.attemptMs ?? 12_000, remaining)));
    try {
      const response = await fetcher(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: draftSchema,
              maxOutputTokens: 8192,
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
          signal,
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 429) {
          throw new FragranceAiError("The AI provider has reached its request limit. Please try again later.", 429, false, 429);
        }
        const transient = response.status >= 500 || response.status === 408;
        throw new FragranceAiError(
          transient
            ? "The AI provider is temporarily unavailable. Please try again."
            : "The AI provider rejected the request. Please check the AI service configuration.",
          503, transient, response.status,
        );
      }
      const result = await response.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
      };
      const text = result?.candidates?.[0]?.content?.parts
        ?.filter((part) => !part.thought)
        .map((part) => part.text ?? "").join("").trim();
      if (!text) throw new FragranceAiError("The AI provider returned an empty suggestion. Please try again.", 502, true);
      const draft: unknown = JSON.parse(text);
      if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
        throw new FragranceAiError("The AI provider returned an incomplete suggestion. Please try again.", 502, true);
      }
      return draft as Record<string, unknown>;
    } catch (error) {
      failure = error instanceof FragranceAiError ? error
        : error instanceof SyntaxError
          ? new FragranceAiError("The AI provider returned an incomplete suggestion. Please try again.", 502, true)
          : new FragranceAiError(signal.aborted
            ? "The AI request timed out. Please try again."
            : "The AI connection was interrupted. Please try again.", 503, true);
      if (!failure.retryable || attempt === 1) break;
      const delay = Math.min(options.retryDelayMs ?? 250, Math.max(0, deadline - Date.now()));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw failure;
}
