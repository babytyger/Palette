import fs from "node:fs/promises";
import path from "node:path";

const REF_DIR = path.resolve(process.env.DATA_DIR || "data", "references");
const DATA_URL_RE = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i;
const EXTS = ["png", "jpg", "jpeg", "webp"];

/**
 * Writes a data-URL reference image to disk and returns its public path.
 *
 * @param {string} templateId - Template id used as the file name
 * @param {string} dataUrl - `data:image/...;base64,...` value from the admin upload
 * @returns {Promise<string>} Public path such as `/references/my_template.png`
 */
const persistReferenceImage = async (templateId, dataUrl) => {
  const m = DATA_URL_RE.exec(dataUrl || "");
  if (!m) throw Object.assign(new Error("Reference image must be a PNG, JPEG or WebP."), { status: 400 });
  const mime = m[1].toLowerCase() === "image/jpg" ? "image/jpeg" : m[1].toLowerCase();
  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
  const id = String(templateId).replace(/[^a-z0-9_-]/g, "_");
  await fs.mkdir(REF_DIR, { recursive: true });
  await deleteReferenceImages(id);
  const file = `${id}.${ext}`;
  await fs.writeFile(path.join(REF_DIR, file), Buffer.from(m[2], "base64"));
  return `/references/${file}`;
};

/**
 * Removes stored reference image files for a template id.
 *
 * @param {string} templateId - Template id whose reference files should be removed
 * @returns {Promise<void>}
 */
const deleteReferenceImages = async (templateId) => {
  const id = String(templateId).replace(/[^a-z0-9_-]/g, "_");
  await fs.mkdir(REF_DIR, { recursive: true });
  await Promise.all(EXTS.map((ext) => fs.unlink(path.join(REF_DIR, `${id}.${ext}`)).catch(() => {})));
};

/**
 * Turns an uploaded data URL into a public path, or keeps an existing path.
 *
 * @param {string} templateId - Template id used when persisting a new upload
 * @param {string | undefined | null} referenceImage - Data URL, public path, or empty
 * @returns {Promise<string | undefined>} Public path, or `undefined` when cleared
 */
const resolveReferenceImage = async (templateId, referenceImage) => {
  if (!referenceImage) {
    await deleteReferenceImages(templateId);
    return undefined;
  }
  if (referenceImage.startsWith("data:image")) return persistReferenceImage(templateId, referenceImage);
  if (referenceImage.startsWith("/references/")) return referenceImage;
  throw Object.assign(new Error("Reference image must be an uploaded image."), { status: 400 });
};

export { persistReferenceImage, deleteReferenceImages, resolveReferenceImage, REF_DIR };
