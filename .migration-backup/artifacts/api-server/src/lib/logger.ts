import pino from "pino";

// Serverless runtimes (Netlify/Lambda) don't set NODE_ENV=production and can't
// resolve the pino-pretty worker transport from the bundle, so log plain JSON.
const isServerless = Boolean(
  process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME,
);
const isProduction = process.env.NODE_ENV === "production" || isServerless;

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
