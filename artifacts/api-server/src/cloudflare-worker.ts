import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import app from "./cloudflare-app";
import { runtimeEnvironmentKeys, withRuntimeEnvironment } from "./lib/runtime-env";

type CloudflareEnvironment = Partial<Record<typeof runtimeEnvironmentKeys[number], string>> & {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
}

interface RequestLogger {
  trace: (...values: unknown[]) => void;
  debug: (...values: unknown[]) => void;
  info: (...values: unknown[]) => void;
  warn: (...values: unknown[]) => void;
  error: (...values: unknown[]) => void;
  fatal: (...values: unknown[]) => void;
}

type WorkerRequest = Omit<ExpressRequest, "body" | "cookies" | "log"> & {
  body: unknown;
  cookies: Record<string, string>;
  ip: string;
  log: RequestLogger;
};

interface WorkerResponse {
  statusCode: number;
  readonly headersSent: boolean;
  readonly writableEnded: boolean;
  readonly finished: boolean;
  locals: Record<string, unknown>;
  end(chunk?: string | Uint8Array): this;
  json(body: unknown): this;
  send(body: string | Uint8Array | object): this;
  sendStatus(statusCode: number): this;
  status(statusCode: number): this;
  cookie(name: string, value: string, options?: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: boolean | "lax" | "strict" | "none";
    maxAge?: number;
    path?: string;
  }): this;
  write(chunk: string | Uint8Array): boolean;
  setHeader(name: string, value: string | number | readonly string[]): this;
  getHeader(name: string): string | number | string[] | undefined;
  removeHeader(name: string): void;
}

function logFailure(...values: unknown[]): void {
  const fields = values[0] && typeof values[0] === "object"
    ? values[0] as { code?: unknown; err?: { code?: unknown } }
    : {};
  const code = fields.code ?? fields.err?.code;
  const last = values[values.length - 1];
  // Log only the application event and a bounded error code, never upstream
  // error messages/objects which can contain URLs or request credentials.
  console.error("[Maya API]", {
    event: typeof last === "string" ? last : "API request failed",
    ...(typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code) ? { code } : {}),
  });
}

const noOpLogger: RequestLogger = {
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: logFailure,
  error: logFailure,
  fatal: logFailure,
};

const expressApp = app as unknown as {
  handle(
    request: ExpressRequest,
    response: ExpressResponse,
    callback: (error?: Error) => void,
  ): void;
  request: object;
  response: object;
};

const statusTexts: Record<number, string> = {
  204: "No Content",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  413: "Payload Too Large",
  429: "Too Many Requests",
  500: "Internal Server Error",
  503: "Service Unavailable",
};

function headersObject(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, name) => {
    headers[name.toLowerCase()] = value;
  });
  return headers;
}

function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of header?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      result[name] = decodeURIComponent(value);
    } catch {
      result[name] = value;
    }
  }
  return result;
}

async function parseRequestBody(request: Request): Promise<unknown> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const raw = await request.text();
  if (!raw) return undefined;
  if (new TextEncoder().encode(raw).byteLength > 12 * 1024 * 1024) {
    throw new Response(JSON.stringify({ error: "The request body is too large." }), {
      status: 413,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json") || contentType.includes("+json")) {
    try {
      return JSON.parse(raw);
    } catch {
      throw new Response(JSON.stringify({ error: "The request body contains invalid JSON." }), {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form: Record<string, string> = {};
    new URLSearchParams(raw).forEach((value, key) => {
      form[key] = value;
    });
    return form;
  }
  return undefined;
}

function createExpressResponse(): {
  response: WorkerResponse;
  result: Promise<Response>;
} {
  let resolveResult!: (response: Response) => void;
  const result = new Promise<Response>((resolve) => {
    resolveResult = resolve;
  });
  const headers = new Headers();
  const chunks: Uint8Array[] = [];
  let headersSent = false;
  let writableEnded = false;
  let finished = false;
  const response = Object.create(expressApp.response) as WorkerResponse & {
    req?: ExpressRequest;
  };
  response.statusCode = 200;
  Object.defineProperties(response, {
    headersSent: { configurable: true, get: () => headersSent },
    writableEnded: { configurable: true, get: () => writableEnded },
    finished: { configurable: true, get: () => finished },
  });
  response.locals = {};

  response.setHeader = (name, value) => {
    if (name.toLowerCase() === "set-cookie" && headers.has(name)) {
      const values = Array.isArray(value) ? value : [String(value)];
      values.forEach((item) => headers.append(name, item));
    } else if (Array.isArray(value)) {
      headers.delete(name);
      value.forEach((item) => headers.append(name, item));
    } else {
      headers.set(name, String(value));
    }
    return response;
  };
  response.getHeader = (name) => headers.get(name) ?? undefined;
  response.removeHeader = (name) => {
    headers.delete(name);
  };
  response.status = (statusCode) => {
    response.statusCode = statusCode;
    return response;
  };
  response.json = (body) => {
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json; charset=utf-8");
    }
    return response.end(JSON.stringify(body));
  };
  response.send = (body) => {
    if (typeof body === "object" && body !== null && !(body instanceof Uint8Array)) {
      return response.json(body);
    }
    if (!headers.has("content-type") && typeof body === "string") {
      headers.set("content-type", "text/html; charset=utf-8");
    }
    return response.end(body as string | Uint8Array);
  };
  response.sendStatus = (statusCode) => {
    response.status(statusCode);
    return statusCode === 204
      ? response.end()
      : response.send(statusTexts[statusCode] ?? String(statusCode));
  };
  response.cookie = (name, value, options = {}) => {
    const parts = [`${name}=${encodeURIComponent(value)}`];
    if (options.maxAge !== undefined) {
      parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
    }
    if (options.path) parts.push(`Path=${options.path}`);
    if (options.httpOnly) parts.push("HttpOnly");
    if (options.secure) parts.push("Secure");
    if (options.sameSite) {
      const sameSite = options.sameSite === true ? "Strict" :
        options.sameSite[0].toUpperCase() + options.sameSite.slice(1);
      parts.push(`SameSite=${sameSite}`);
    }
    response.setHeader("Set-Cookie", parts.join("; "));
    return response;
  };
  response.write = (chunk) => {
    if (typeof chunk === "string") chunks.push(new TextEncoder().encode(chunk));
    else chunks.push(chunk);
    headersSent = true;
    return true;
  };
  response.end = (chunk) => {
    if (chunk !== undefined) {
      if (typeof chunk === "string") chunks.push(new TextEncoder().encode(chunk));
      else chunks.push(chunk);
    }
    if (writableEnded) return response;
    writableEnded = true;
    finished = true;
    headersSent = true;
    const status = response.statusCode;
    const byteLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    const joined = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body = status === 204 || status === 304 || byteLength === 0 ? null : joined;
    resolveResult(new Response(body, { status, headers }));
    return response;
  };

  return { response, result };
}

function createExpressRequest(
  request: Request,
  url: URL,
  body: unknown,
): WorkerRequest {
  const headers = headersObject(request);
  const remoteAddress = headers["cf-connecting-ip"] ?? "127.0.0.1";
  const expressRequest = Object.create(expressApp.request) as WorkerRequest;
  Object.defineProperties(expressRequest, {
    app: { configurable: true, enumerable: true, value: app },
    baseUrl: { configurable: true, enumerable: true, value: "", writable: true },
    body: { configurable: true, enumerable: true, value: body, writable: true },
    cookies: {
      configurable: true,
      enumerable: true,
      value: parseCookies(headers.cookie),
      writable: true,
    },
    headers: { configurable: true, enumerable: true, value: headers },
    httpVersion: { configurable: true, enumerable: true, value: "1.1" },
    ip: { configurable: true, enumerable: true, value: remoteAddress },
    log: { configurable: true, enumerable: true, value: noOpLogger },
    method: { configurable: true, enumerable: true, value: request.method },
    originalUrl: {
      configurable: true,
      enumerable: true,
      value: `${url.pathname}${url.search}`,
      writable: true,
    },
    params: { configurable: true, enumerable: true, value: {}, writable: true },
    query: {
      configurable: true,
      enumerable: true,
      value: Object.fromEntries(url.searchParams.entries()),
      writable: true,
    },
    socket: {
      configurable: true,
      enumerable: true,
      value: { remoteAddress, encrypted: url.protocol === "https:" },
    },
    url: {
      configurable: true,
      enumerable: true,
      value: `${url.pathname}${url.search}`,
      writable: true,
    },
  });
  return expressRequest;
}

export async function handleApiRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  try {
    return await runExpressRequest(request, url);
  } catch (error) {
    if (error instanceof Response) return error;
    noOpLogger.error("API request failed");
    return Response.json({ error: "The request could not be completed." }, { status: 500 });
  }
}

async function runExpressRequest(request: Request, url: URL): Promise<Response> {
  const body = await parseRequestBody(request);
  const { response, result } = createExpressResponse();
  const expressRequest = createExpressRequest(request, url, body);

  expressApp.handle(
    expressRequest as unknown as ExpressRequest,
    response as unknown as ExpressResponse,
    (error?: Error) => {
    if (response.writableEnded) return;
    if (error) {
      noOpLogger.error(error);
      response.status(500).json({ error: "The request could not be completed." });
    } else {
      response.status(404).json({ error: "API route not found." });
    }
    },
  );

  return result;
}

export default {
  async fetch(request: Request, env: CloudflareEnvironment): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/") && url.pathname !== "/api") {
      return env.ASSETS.fetch(request);
    }
    if (url.pathname.startsWith("/api/storage/objects/")) {
      return Response.json({ error: "This legacy image is not available on Cloudflare." }, { status: 404 });
    }
    const bindings = Object.fromEntries(runtimeEnvironmentKeys.map((name) => [name, env[name]]));
    return withRuntimeEnvironment(bindings, () => handleApiRequest(request));
  },
};
