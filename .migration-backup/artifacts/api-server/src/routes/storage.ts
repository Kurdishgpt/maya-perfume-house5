import { RequestUploadUrlBody, RequestUploadUrlResponse } from "@workspace/api-zod";
import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import type { ObjectStorageService } from "../lib/objectStorage";
import { requireAdmin } from "../middlewares/requireAdmin";
import { getSupabaseAdmin, isSupabaseConfigured } from "../lib/supabase";

const router: IRouter = Router();
let objectStorage: ObjectStorageService | null = null;
async function getLegacyObjectStorage(): Promise<ObjectStorageService> {
  if (!objectStorage) {
    const { ObjectStorageService: Service } = await import("../lib/objectStorage");
    objectStorage = new Service();
  }
  return objectStorage;
}
const acceptedImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
const maxImageBytes = 5 * 1024 * 1024;

router.post(
  "/storage/uploads/request-url",
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (
      !parsed.success ||
      parsed.data.size > maxImageBytes ||
      !acceptedImageTypes.has(parsed.data.contentType)
    ) {
      res.status(400).json({
        error: "Use a JPEG, PNG, WebP, or AVIF image up to 5 MB.",
      });
      return;
    }

    try {
      const { name, size, contentType } = parsed.data;
      if (isSupabaseConfigured()) {
        const extension = contentType === "image/jpeg" ? "jpg"
          : contentType === "image/png" ? "png"
          : contentType === "image/webp" ? "webp"
          : "avif";
        const bucket = "maya-product-images";
        const path = `products/${randomUUID()}.${extension}`;
        const storage = getSupabaseAdmin().storage.from(bucket);
        const { data, error } = await storage.createSignedUploadUrl(path);
        if (error || !data) throw new Error("Supabase image upload could not be prepared.");
        const { data: publicData } = storage.getPublicUrl(path);
        res.json(RequestUploadUrlResponse.parse({
          uploadURL: data.signedUrl,
          objectPath: data.path,
          uploadToken: data.token,
          bucket,
          publicUrl: publicData.publicUrl,
          metadata: { name, size, contentType },
        }));
        return;
      }
      const legacyStorage = await getLegacyObjectStorage();
      const uploadURL = await legacyStorage.getObjectEntityUploadURL();
      const objectPath = legacyStorage.normalizeObjectEntityPath(uploadURL);
      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, "Product image upload URL creation failed");
      res.status(500).json({ error: "Could not prepare the image upload." });
    }
  },
);

router.get(
  "/storage/objects/*path",
  async (req: Request, res: Response): Promise<void> => {
    if (process.env.NETLIFY === "true") {
      res.status(404).json({ error: "This legacy Replit image is not available on Netlify. Upload it to the Supabase image bucket." });
      return;
    }
    try {
      const legacyStorage = await getLegacyObjectStorage();
      const rawPath = req.params.path;
      const path = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
      const objectFile = await legacyStorage.getObjectEntityFile(`/objects/${path}`);
      const response = await legacyStorage.downloadObject(objectFile);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        ).pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      if (error instanceof Error && error.name === "ObjectNotFoundError") {
        res.status(404).json({ error: "Image not found." });
        return;
      }
      req.log.error({ err: error }, "Product image delivery failed");
      res.status(500).json({ error: "Could not serve the product image." });
    }
  },
);

export default router;
