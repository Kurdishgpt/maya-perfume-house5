import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { getRuntimeEnv } from "../lib/runtime-env";

export function isAdminConfigured(): boolean {
  return Boolean(getRuntimeEnv("ADMIN_PANEL_PASSWORD") && getRuntimeEnv("SESSION_SECRET"));
}

const passcodeCookieName = "maya_admin_unlock";
const passcodeCookieMaxAge = 30 * 60;

function signPasscodeUnlock(expiresAt: number, secret: string): string {
  return createHmac("sha256", secret).update(String(expiresAt)).digest("base64url");
}

function readCookie(req: Request): string | undefined {
  return req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${passcodeCookieName}=`))
    ?.slice(passcodeCookieName.length + 1);
}

export function isAdminPasscodeUnlocked(req: Request): boolean {
  const secret = getRuntimeEnv("SESSION_SECRET");
  const token = readCookie(req);
  if (!secret || !token) return false;

  const separator = token.indexOf(".");
  if (separator < 1) return false;
  const expiresAt = Number(token.slice(0, separator));
  const signature = token.slice(separator + 1);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return false;
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) return false;

  const expected = Buffer.from(signPasscodeUnlock(expiresAt, secret), "base64url");
  const received = Buffer.from(signature, "base64url");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function setAdminPasscodeCookie(res: Response): boolean {
  const secret = getRuntimeEnv("SESSION_SECRET");
  if (!secret) return false;

  const expiresAt = Date.now() + passcodeCookieMaxAge * 1000;
  const signature = signPasscodeUnlock(expiresAt, secret);
  const cookieParts = [
    `${passcodeCookieName}=${expiresAt}.${signature}`,
    "Path=/api",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${passcodeCookieMaxAge}`,
  ];
  if (getRuntimeEnv("NODE_ENV") === "production") cookieParts.push("Secure");
  res.setHeader("Set-Cookie", cookieParts.join("; "));
  return true;
}

export function clearAdminPasscodeCookie(res: Response): void {
  const cookieParts = [
    `${passcodeCookieName}=`,
    "Path=/api",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
  ];
  if (getRuntimeEnv("NODE_ENV") === "production") cookieParts.push("Secure");
  res.setHeader("Set-Cookie", cookieParts.join("; "));
}

export function verifyAdminPasscode(received: string): boolean {
  const adminPasscode = getRuntimeEnv("ADMIN_PANEL_PASSWORD");
  if (!adminPasscode) return false;
  const receivedDigest = createHash("sha256").update(received).digest();
  const expectedDigest = createHash("sha256").update(adminPasscode).digest();
  return timingSafeEqual(receivedDigest, expectedDigest);
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!isAdminPasscodeUnlocked(req)) {
    res.status(401).json({ error: "Unlock the admin panel before changing the catalog." });
    return;
  }

  next();
}
