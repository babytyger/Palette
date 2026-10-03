const PREVIEW_TIPS = [
  "Remove one element at a time. If the design still works without it, leave it out.",
  "Go back to the simplest version. Strip it down, then add back only what the message truly needs.",
  "Cut your fonts down to one or two. Mixed typefaces are a common cause of a messy look.",
  "Check the idea first. If the concept is weak, polishing the visuals won't save it.",
  "Look at the small details: alignment, spacing, edges. Small flaws add up to a design that feels off.",
  "Put the layout on a grid. If things don't line up, fix the structure before touching anything else.",
  "Say the main message in one sentence. If the design doesn't show it clearly, rework it until it does.",
  "Ask if anyone would react to it. If the answer is a shrug, push the idea further instead of tweaking.",
  "Add more space around and between elements. Use wider margins and clear gaps so the eye knows where to go.",
  "Squint at the design or step back from it. Whatever stands out first should be the most important thing. If it isn't, adjust size, color, or weight until it is."
];

/**
 * Returns a preview tip other than the one on screen when another is available.
 *
 * @param current - Tip currently shown
 * @returns A randomly chosen tip
 */
const nextPreviewTip = (current?: string) => {
  const pool = PREVIEW_TIPS.filter((tip) => tip !== current);
  const source = pool.length ? pool : PREVIEW_TIPS;
  return source[Math.floor(Math.random() * source.length)];
};

/**
 * Saves an image as a PNG file.
 *
 * @param url - Image to save
 * @param name - File name without an extension
 */
const downloadPng = async (url: string, name = "palette-output") => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not download the image.");
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare the PNG.");
  ctx.drawImage(bitmap, 0, 0);
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  bitmap.close();
  if (!png) throw new Error("Could not prepare the PNG.");
  const href = URL.createObjectURL(png);
  const link = document.createElement("a");
  link.href = href;
  link.download = `${name}.png`;
  link.click();
  URL.revokeObjectURL(href);
};

export { PREVIEW_TIPS, nextPreviewTip, downloadPng };
