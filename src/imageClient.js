import fs from "node:fs/promises";
import path from "node:path";
import OpenAI, { toFile } from "openai";

export const MODEL = process.env.IMAGE_MODEL || "gpt-image-1";
export const QUALITY = process.env.IMAGE_QUALITY || "medium";
// "high" keeps uploaded faces and details closest to the original. Set to "off" to disable.
export const INPUT_FIDELITY = (process.env.IMAGE_INPUT_FIDELITY || "high") === "off" ? null : (process.env.IMAGE_INPUT_FIDELITY || "high");
export const MOCK = process.env.MOCK_MODE === "true" || !process.env.OPENAI_API_KEY;

const client = MOCK ? null : new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PARTIALS = 3;

/**
 * Maps an API output format to a mime type.
 *
 * @param format - Output format from a stream event
 */
const mimeFor = (format) => format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";

/**
 * Reads a streamed image response, forwarding each partial and returning the final image.
 *
 * @param stream - OpenAI image stream
 * @param onPartial - Called with each partial image
 */
const readImageStream = async (stream, onPartial) => {
  let final = null;
  for await (const event of stream) {
    if (String(event.type).endsWith(".partial_image") && event.b64_json) {
      if (onPartial) await onPartial({ b64: event.b64_json, index: event.partial_image_index, mime: mimeFor(event.output_format) });
    } else if (String(event.type).endsWith(".completed") && event.b64_json) {
      final = { b64: event.b64_json, mime: mimeFor(event.output_format) };
    }
  }
  if (!final) throw new Error("Image generation did not return an image.");
  return final;
};

// images: array of { dataUrl, label } for all image params, in param order.
// onPartial receives each streamed preview before the final image.
export async function generateImage({ prompt, size, images = [], onPartial }) {
  if (MOCK) return mockImage(prompt, size);
  const inputs = await Promise.all(images.map((im, i) => dataUrlToFile(im.dataUrl, im.label || `image_${i + 1}`)));
  const streamed = { model: MODEL, prompt, size, quality: QUALITY, stream: true, partial_images: PARTIALS };
  if (inputs.length) {
    const base = { ...streamed, image: inputs };
    try {
      return await readImageStream(await editImage(base), onPartial);
    } catch (err) {
      if (!/partial_images|\bstream\b/i.test(String(err?.message))) throw err;
      console.warn(`Model ${MODEL} rejected streamed previews. Generating the final image.`);
      const res = await editImage({ model: MODEL, image: inputs, prompt, size, quality: QUALITY });
      return { b64: res.data[0].b64_json, mime: "image/png" };
    }
  }
  try {
    return await readImageStream(await client.images.generate(streamed), onPartial);
  } catch (err) {
    if (!/partial_images|\bstream\b/i.test(String(err?.message))) throw err;
    console.warn(`Model ${MODEL} rejected streamed previews. Generating the final image.`);
    const res = await client.images.generate({ model: MODEL, prompt, size, quality: QUALITY, n: 1 });
    return { b64: res.data[0].b64_json, mime: "image/png" };
  }
}

/**
 * Edits an image, retrying once without input fidelity when the model rejects it.
 *
 * @param body - Image edit request
 */
const editImage = async (body) => {
  // input_fidelity "high" tells the model to keep faces and details from the
  // uploaded images as close to the originals as possible. Some models don't
  // accept it, so retry once without it if the API rejects the parameter.
  try {
    return await client.images.edit(INPUT_FIDELITY ? { ...body, input_fidelity: INPUT_FIDELITY } : body);
  } catch (err) {
    if (!INPUT_FIDELITY || !/input_fidelity/i.test(String(err?.message))) throw err;
    console.warn(`Model ${MODEL} rejected input_fidelity. Retrying without it.`);
    return client.images.edit(body);
  }
}

async function dataUrlToFile(dataUrl, name) {
  const m = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i.exec(dataUrl || "");
  if (!m) throw Object.assign(new Error(`${name} must be a PNG, JPEG or WebP image.`), { status: 400 });
  const [, mime, b64] = m;
  return toFile(Buffer.from(b64, "base64"), `${name.replace(/\s+/g, "_")}.${mime.split("/")[1].replace("jpeg", "jpg")}`, { type: mime });
}

function mockImage(prompt, size) {
  const [w, h] = size.split("x").map(Number);
  const lines = prompt.split("\n").slice(0, 14).map((l, i) =>
    `<text x="32" y="${100 + i * 36}" font-family="sans-serif" font-size="17" fill="#4a4a52">${esc(l.slice(0, 100))}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#F5F3EE"/><text x="32" y="58" font-family="sans-serif" font-size="26" font-weight="700" fill="#1a1a1a">Mock image (no API key)</text>${lines}</svg>`;
  return { b64: Buffer.from(svg).toString("base64"), mime: "image/svg+xml" };
}
const esc = (s) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
