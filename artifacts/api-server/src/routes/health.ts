import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getSupabaseAdmin, getSupabaseConfigIssue } from "../lib/supabase";
import { supabaseFailure } from "../lib/supabase-diagnostics";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/supabase/status", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const configIssue = getSupabaseConfigIssue();
  if (configIssue) {
    res.status(503).json(configIssue === "invalid_url"
      ? {
          status: "invalid_configuration",
          message: "SUPABASE_URL (or VITE_SUPABASE_URL) must be a valid HTTP or HTTPS project URL.",
        }
      : {
          status: "not_configured",
          message: "Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in the hosting runtime.",
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
      res.status(503).json(supabaseFailure(error));
      return;
    }

    const { error: catalogError } = await getSupabaseAdmin().from("products")
      .select("id,legacy_id,product_type,is_active,source_sku,quantity_options").limit(1);
    if (catalogError) {
      req.log.warn({ code: catalogError.code }, "Supabase catalog schema check failed");
      res.status(503).json(supabaseFailure(catalogError));
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
