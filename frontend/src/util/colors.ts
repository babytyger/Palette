import type { Param } from "@/types/app";

type ColorSwatch = { name: string; hex: string };

const DEFAULT_SWATCHES: ColorSwatch[] = [
  { name: "Cobalt", hex: "#285AC5" },
  { name: "Terracotta", hex: "#B56A4A" },
  { name: "Olive", hex: "#6F7A4E" },
  { name: "Plum", hex: "#7A5A8C" },
  { name: "Charcoal", hex: "#3A4046" }
];

/**
 * Normalizes a colour string to `#RRGGBB`, or null if invalid.
 *
 * @param raw - User or stored colour
 * @returns Uppercase hex, or null
 */
const normalizeHex = (raw: string) => {
  const v = String(raw || "").trim();
  const withHash = v.startsWith("#") ? v : `#${v}`;
  if (!/^#[0-9A-Fa-f]{6}$/.test(withHash)) return null;
  return withHash.toUpperCase();
};

/**
 * Swatches shown for a colour param. Named `options` win when they look like hex.
 *
 * @param p - Colour param
 * @returns Named swatches
 */
const swatchesForParam = (p: Param): ColorSwatch[] => {
  const fromOptions = (p.options || [])
    .map((o) => {
      const hex = normalizeHex(o.value);
      return hex ? { name: o.label || hex, hex } : null;
    })
    .filter(Boolean) as ColorSwatch[];
  return fromOptions.length ? fromOptions : DEFAULT_SWATCHES;
};

/**
 * Display name for a hex, matching a swatch or "Custom".
 *
 * @param hex - Normalized hex
 * @param swatches - Available swatches
 * @returns Colour name
 */
const nameForHex = (hex: string, swatches: ColorSwatch[]) =>
  swatches.find((s) => s.hex === hex)?.name || "Custom";

export { DEFAULT_SWATCHES, nameForHex, normalizeHex, swatchesForParam };
export type { ColorSwatch };
