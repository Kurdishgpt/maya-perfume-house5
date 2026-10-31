type ExpressApplication = (request: any, response: any) => void;

let appPromise: Promise<ExpressApplication> | undefined;

function getApp(): Promise<ExpressApplication> {
  // Vercel's serverless runtime has no legacy Replit PostgreSQL connection;
  // routes that need persistent data use the configured Supabase service key.
  process.env.VERCEL ||= "1";
  appPromise ??= import("../artifacts/api-server/src/app").then(
    ({ default: app }) => app as unknown as ExpressApplication,
  );
  return appPromise;
}

export default async function handler(
  request: any,
  response: any,
): Promise<void> {
  const app = await getApp();
  app(request, response);
}
