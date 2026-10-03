/**
 * Formats a byte count as KB or MB.
 *
 * @param b - Size in bytes
 * @returns Human-readable size
 */
const fmtBytes = (b: number) =>
  b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

/**
 * Formats a timestamp as a short relative string.
 *
 * @param iso - ISO date or epoch
 * @returns Relative time label
 */
const relativeTime = (iso: string | number) => {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString();
};

/**
 * Returns a short typographic mark for a template card without a reference image.
 *
 * @param t - Template
 * @returns Card mark
 */
const templateMark = (t: { category?: string; name?: string }) => {
  if (t.category === "News") return "NEWS";
  if (t.category === "Portrait") return "Aa";
  const name = String(t.name || "");
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return name.slice(0, 6);
  return parts.slice(0, 2).map((p) => p[0]).join("").toUpperCase();
};

const SLOT_LABEL = { subject: "Subject", background: "Background", canvas: "Canvas" } as const;
const SLOT_ORDER = { subject: 0, canvas: 1, background: 2 } as const;
const typeEmoji: Record<string, string> = {
  image: "🖼", color: "🎨", select: "☰", multiselect: "☷", slider: "⟺",
  text: "T", textarea: "¶", switch: "⏻", palette: "🎨"
};
const scopeLabel = { theme: "Theme", element: "Element", rule: "Rule" };

/**
 * Pads a 1-based index to two digits.
 *
 * @param n - Index
 * @returns Zero-padded label such as `01`
 */
const padIndex = (n: number) => String(n).padStart(2, "0");

export { fmtBytes, relativeTime, templateMark, SLOT_LABEL, SLOT_ORDER, typeEmoji, scopeLabel, padIndex };
