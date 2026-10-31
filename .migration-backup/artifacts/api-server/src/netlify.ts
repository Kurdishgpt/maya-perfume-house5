import serverless from "serverless-http";

type ServerlessHandler = ReturnType<typeof serverless>;

let handlerPromise: Promise<ServerlessHandler> | undefined;

function getHandler(): Promise<ServerlessHandler> {
  // Netlify does not expose this platform marker consistently in function
  // runtimes. Set it before importing routes, because @workspace/db checks it
  // during module initialization when DATABASE_URL is intentionally absent.
  process.env.NETLIFY = "true";
  // Netlify functions don't set NODE_ENV. Default to production so secure
  // cookies, the Clerk proxy and JSON logging behave like the deployed server.
  process.env.NODE_ENV ??= "production";

  handlerPromise ??= import("./app").then(({ default: app }) =>
    serverless(app, {
      // Netlify rewrites /api/* to this function. Remove the function prefix so
      // Express receives the same /api/... path used on Replit.
      basePath: "/.netlify/functions/api",
      binary: ["image/*"],
    }),
  );

  return handlerPromise;
}

export const handler = async (...args: Parameters<ServerlessHandler>) =>
  (await getHandler())(...args);
