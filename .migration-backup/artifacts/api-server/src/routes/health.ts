import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getSupabaseAdmin, getSupabaseConfigIssue } from "../lib/supabase";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/supabase/status", async (req, res): Promise<void> => {
  const configIssue = getSupabaseConfigIssue();
  if (configIssue) {
    res.status(503).json(configIssue === "invalid_url"
      ? {
          status: "invalid_configuration",
          message: "VITE_SUPABASE_URL must be a valid HTTP or HTTPS project URL.",
        }
      : {
          status: "not_configured",
          message: "Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the hosting environment.",
        });
    return;
  }

  try {
    const { error } = await getSupabaseAdmin()
      .from("site_settings")
      .select("id")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      req.log.warn({ code: error.code }, "Supabase schema check failed");
      res.status(503).json({
        status: "schema_not_ready",
        message: "Supabase is reachable, but its setup migration may not be applied.",
        code: error.code ?? null,
      });
      return;
    }

    res.json({ status: "connected" });
  } catch (error) {
    req.log.error({ err: error }, "Supabase connection check failed");
    res.status(503).json({
      status: "unavailable",
      message: "The Supabase connection could not be verified.",
    });
  }
});

export default router;
