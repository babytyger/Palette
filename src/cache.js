import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
const IMG_DIR = path.resolve(process.env.DATA_DIR || "data", "images");
const META_DIR = path.resolve(process.env.DATA_DIR || "data", "meta");
export const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
export async function getCached(key) {
  try { return JSON.parse(await fs.readFile(path.join(META_DIR, `${key}.json`), "utf8")); } catch { return null; }
}
/**
 * Writes one preview image and returns the URL the studio can show.
 *
 * @param name - File name without an extension
 * @param b64 - Base64 image bytes
 * @param mime - Image mime type
 * @returns Public image URL
 */
const saveImageFile = async (name, b64, mime = "image/png") => {
  await fs.mkdir(IMG_DIR, { recursive: true });
  const ext = mime === "image/svg+xml" ? "svg" : mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
  const file = `${name}.${ext}`;
  await fs.writeFile(path.join(IMG_DIR, file), Buffer.from(b64, "base64"));
  return `/images/${file}`;
};

export async function saveCached(key, { b64, mime }, meta) {
  await fs.mkdir(IMG_DIR, { recursive: true }); await fs.mkdir(META_DIR, { recursive: true });
  const ext = mime === "image/svg+xml" ? "svg" : mime === "image/jpeg" ? "jpg" : "png";
  const file = `${key}.${ext}`;
  await fs.writeFile(path.join(IMG_DIR, file), Buffer.from(b64, "base64"));
  const record = { cacheKey: key, imageUrl: `/images/${file}`, mime, createdAt: new Date().toISOString(), ...meta };
  await fs.writeFile(path.join(META_DIR, `${key}.json`), JSON.stringify(record, null, 2));
  return record;
}

export { saveImageFile };
