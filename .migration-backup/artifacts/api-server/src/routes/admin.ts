import { Router, type IRouter } from "express";
import {
  GetAdminPasscodeStatusResponse,
  UnlockAdminPasscodeBody,
  UnlockAdminPasscodeResponse,
} from "@workspace/api-zod";
import {
  clearAdminPasscodeCookie,
  isAdminPasscodeUnlocked,
  setAdminPasscodeCookie,
  verifyAdminPasscode,
} from "../middlewares/requireAdmin";

const router: IRouter = Router();
const maxAttempts = 5;
const attemptWindowMs = 15 * 60 * 1000;
const failedAttempts = new Map<string, { count: number; startedAt: number }>();

router.use("/admin/passcode", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

router.get("/admin/passcode", (req, res): void => {
  if (!process.env.SESSION_SECRET) {
    req.log.error("Admin session signing is not configured");
    res.status(503).json({ error: "Admin access is not configured." });
    return;
  }

  res.json(
    GetAdminPasscodeStatusResponse.parse({
      unlocked: isAdminPasscodeUnlocked(req),
    }),
  );
});

router.post("/admin/passcode", (req, res): void => {
  const parsed = UnlockAdminPasscodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter the admin passphrase." });
    return;
  }
  if (!process.env.SESSION_SECRET) {
    req.log.error("Admin session signing is not configured");
    res.status(503).json({ error: "Admin access is not configured." });
    return;
  }

  const clientIp = req.ip || "unknown";
  const now = Date.now();
  const current = failedAttempts.get(clientIp);
  if (current && now - current.startedAt < attemptWindowMs && current.count >= maxAttempts) {
    res.status(429).json({ error: "Too many attempts. Wait 15 minutes and try again." });
    return;
  }
  const attempts =
    current && now - current.startedAt < attemptWindowMs
      ? current
      : { count: 0, startedAt: now };

  if (!verifyAdminPasscode(parsed.data.passcode)) {
    attempts.count += 1;
    failedAttempts.set(clientIp, attempts);
    res.status(403).json({ error: "That passphrase was not accepted." });
    return;
  }

  failedAttempts.delete(clientIp);
  if (!setAdminPasscodeCookie(res)) {
    res.status(503).json({ error: "Admin access is not configured." });
    return;
  }
  res.json(UnlockAdminPasscodeResponse.parse({ unlocked: true }));
});

router.delete("/admin/passcode", (_req, res): void => {
  clearAdminPasscodeCookie(res);
  res.sendStatus(204);
});

export default router;
