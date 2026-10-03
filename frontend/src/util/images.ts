import { fmtBytes } from "@/util/format";

const IMAGE_OK_TYPES = ["image/png", "image/jpeg", "image/webp"];
const IMAGE_MAX_MB = 25;
const imageMeta = new Map<string, { name: string; width: number; height: number; bytes: number }>();

/**
 * Reads an image file into a data URL, converting unsupported types to PNG.
 *
 * @param file - Uploaded file
 */
const readImageFile = async (file: File) => {
  if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) {
    throw new Error("HEIC photos from iPhone can't be read by the browser. Export the photo as JPEG and try again.");
  }
  if (!file.type.startsWith("image/")) throw new Error(`"${file.name}" is not an image.`);
  if (file.size > IMAGE_MAX_MB * 1024 * 1024) {
    throw new Error(`"${file.name}" is ${fmtBytes(file.size)}. The limit is ${IMAGE_MAX_MB} MB.`);
  }
  let url = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("Could not read the file."));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error(`"${file.name}" could not be opened as an image.`));
    i.src = url;
  });
  let bytes = file.size;
  if (!IMAGE_OK_TYPES.includes(file.type)) {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext("2d").drawImage(img, 0, 0);
    url = c.toDataURL("image/png");
    bytes = Math.round((url.length - url.indexOf(",") - 1) * 0.75);
  }
  const meta = { name: file.name, width: img.naturalWidth, height: img.naturalHeight, bytes };
  imageMeta.set(url, meta);
  return { url, meta };
};

/**
 * Center-crops an image data URL to a 1:1 square for template card headers.
 *
 * @param dataUrl - Source image as a data URL
 * @param name - Original file name
 */
const fitImageToSquare = async (dataUrl: string, name = "reference.png") => {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("The reference image could not be opened."));
    i.src = dataUrl;
  });
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = Math.floor((img.naturalWidth - side) / 2);
  const sy = Math.floor((img.naturalHeight - side) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  canvas.getContext("2d").drawImage(img, sx, sy, side, side, 0, 0, side, side);
  const url = canvas.toDataURL("image/png");
  const bytes = Math.round((url.length - url.indexOf(",") - 1) * 0.75);
  const meta = { name, width: side, height: side, bytes };
  imageMeta.set(url, meta);
  return { url, meta };
};

export { imageMeta, readImageFile, fitImageToSquare };
