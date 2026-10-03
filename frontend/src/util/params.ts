import { checkComponents, COMPONENT_CATEGORIES, defaultParamValue } from "@lib/compiler";
import type { ComponentDef, Param, Registry, StackItem, Template } from "@/types/app";
import { SLOT_LABEL } from "@/util/format";

const PARAM_FUNCTIONS = [
  { id: "color", label: "Colour selection" },
  { id: "select", label: "Dropdown" },
  { id: "multiselect", label: "Multi-select" },
  { id: "slider", label: "Number slider" },
  { id: "switch", label: "Switch" },
  { id: "text", label: "Text" },
  { id: "textarea", label: "Long text" },
  { id: "palette", label: "Colour palette" }
];

const PARAM_DEF_KEYS = new Set([
  "id", "label", "type", "defaultValue", "defaultHex", "options", "min", "max", "step",
  "optional", "description", "unit", "bands", "onPrompt", "offPrompt", "configPath", "fidelity", "order"
]);

/**
 * Turns a param id into a readable label.
 *
 * @param id - CamelCase or snake_case param id
 * @returns Human-readable label
 */
const labelFromParamId = (id: string) => String(id || "")
  .replace(/_/g, " ")
  .replace(/([a-z])([A-Z])/g, "$1 $2")
  .replace(/^\w/, (c) => c.toUpperCase())
  .trim();

/**
 * Infers the studio control type from a param id, label, or explicit type.
 *
 * @param p - Component param
 * @returns One of PARAM_FUNCTIONS ids
 */
const inferParamFunction = (p: Param) => {
  if (p?.type && PARAM_FUNCTIONS.some((f) => f.id === p.type)) return p.type;
  const key = `${p?.id || ""} ${p?.label || ""}`.toLowerCase();
  if (/colou?r|hex|tone|tint|duotone|overlay|wash/.test(key)) return "color";
  if (/palette|swatch/.test(key)) return "palette";
  if (/amount|opacity|strength|grain|size|scale|count/.test(key)) return "slider";
  if (/\b(on|off|enable|enabled|toggle)\b/.test(key)) return "switch";
  if (/style|look|mode|contrast|option/.test(key)) return "select";
  return "text";
};

/**
 * Reads a value stored under the param's label key, if that key is not a schema field.
 *
 * @param p - Component param
 * @returns Stray value or undefined
 */
const strayParamValue = (p: Param) => {
  if (!p?.label || PARAM_DEF_KEYS.has(p.label)) return undefined;
  if (!Object.prototype.hasOwnProperty.call(p, p.label)) return undefined;
  return p[p.label];
};

/**
 * Returns the default/sample value stored on a param definition.
 *
 * @param p - Component param
 * @returns Stored value
 */
const paramStoredValue = (p: Param) => {
  if (p?.type === "color") return p.defaultHex ?? p.defaultValue ?? strayParamValue(p) ?? "";
  if (p?.defaultValue !== undefined && p.defaultValue !== null && p.defaultValue !== "") return p.defaultValue;
  const stray = strayParamValue(p);
  if (stray !== undefined && stray !== "") return stray;
  return defaultParamValue(p);
};

/**
 * Writes a sample value onto a param as defaultValue/defaultHex and drops a stray label-named key.
 *
 * @param p - Component param
 * @param v - Value from Try it or the Parameters form
 */
const setParamStoredValue = (p: Param, v: any) => {
  if (p.type === "color") p.defaultHex = v;
  else p.defaultValue = v;
  if (p.label && !PARAM_DEF_KEYS.has(p.label) && Object.prototype.hasOwnProperty.call(p, p.label)) {
    delete p[p.label];
  }
};

/**
 * Moves label-named extra keys onto defaultValue/defaultHex.
 *
 * @param def - Component definition
 */
const migrateStrayParamValues = (def: ComponentDef) => {
  for (const p of def?.params || []) {
    const stray = strayParamValue(p);
    if (stray === undefined) continue;
    delete p[p.label];
    if (p.type === "color") {
      if (p.defaultHex == null || p.defaultHex === "") p.defaultHex = stray;
    } else if (p.defaultValue == null || p.defaultValue === "") {
      p.defaultValue = stray;
    }
  }
};

/**
 * Returns a copy of a param shaped for the chosen control type.
 *
 * @param p - Existing param
 * @param fn - Target PARAM_FUNCTIONS id
 * @returns Shaped param
 */
const applyParamFunction = (p: Param, fn: string) => {
  const type = PARAM_FUNCTIONS.some((f) => f.id === fn) ? fn : inferParamFunction(p);
  const next: Param = { id: p.id, label: p.label || labelFromParamId(p.id), type };
  const seeded = p.defaultValue ?? strayParamValue(p);
  if (type === "color") next.defaultHex = p.defaultHex || seeded || "#0047AB";
  else if (type === "select" || type === "multiselect") {
    next.options = Array.isArray(p.options) && p.options.length
      ? p.options
      : [
          { value: "option_a", label: "Option A", prompt: "option A" },
          { value: "option_b", label: "Option B", prompt: "option B" }
        ];
    next.defaultValue = seeded ?? next.options[0].value;
    if (type === "multiselect" && !Array.isArray(next.defaultValue)) {
      next.defaultValue = [next.options[0].value];
    }
  } else if (type === "slider") {
    next.min = p.min ?? 1;
    next.max = p.max ?? 10;
    next.step = p.step ?? 1;
    next.defaultValue = seeded ?? 5;
  } else if (type === "switch") {
    next.defaultValue = Boolean(seeded);
  } else if (type === "palette") {
    next.defaultValue = Array.isArray(seeded) ? seeded : (Array.isArray(p.defaultValue) ? p.defaultValue : []);
  } else {
    next.defaultValue = seeded ?? "";
  }
  return next;
};

/**
 * Formats a stored param value for a text field.
 *
 * @param v - Stored value
 * @returns Display string
 */
const formatParamValue = (v: any) => {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  try { return JSON.stringify(v); } catch { return ""; }
};

/**
 * Parses a Value field string into the type the param expects.
 *
 * @param p - Component param
 * @param raw - Input text
 * @returns Parsed value
 */
const parseParamValue = (p: Param, raw: string) => {
  const text = String(raw ?? "");
  if (p.type === "slider") {
    const n = Number(text);
    return Number.isFinite(n) ? n : text;
  }
  if (p.type === "switch") return /^(true|1|yes|on|enabled)$/i.test(text);
  if (p.type === "multiselect" || p.type === "palette") {
    try { return JSON.parse(text); } catch { return text; }
  }
  return text;
};

/**
 * Param used to render a studio/editor control, after function override or inference.
 *
 * @param p - Component param
 * @param fn - Optional function override
 * @returns Control param
 */
const paramForControl = (p: Param, fn?: string) => {
  const type = fn || inferParamFunction(p);
  return type === p.type ? p : applyParamFunction(p, type);
};

/**
 * Placeholder ids used in a component prompt.
 *
 * @param prompt - Component prompt text
 * @returns Unique ids
 */
const promptParamIds = (prompt: string) => {
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (id: string) => { if (!seen.has(id)) { seen.add(id); ids.push(id); } };
  for (const m of String(prompt || "").matchAll(/\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g)) add(m[1]);
  for (const m of String(prompt || "").matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)) add(m[1]);
  return ids;
};

/**
 * Collects unique `{{placeholder}}` ids from a prompt string.
 *
 * @param text - Prompt text
 * @returns Unique placeholder ids
 */
const promptPlaceholders = (text: string) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of String(text || "").matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push(m[1]);
  }
  return out;
};

/**
 * Adds missing params inferred from placeholders in the prompt.
 *
 * @param def - Component definition
 * @returns Whether params were added
 */
const ensureParamsForPrompt = (def: ComponentDef) => {
  if (!def || typeof def !== "object") return false;
  const params = Array.isArray(def.params) ? def.params : (def.params = []);
  let added = false;
  for (const id of promptParamIds(def.prompt)) {
    if (params.some((p) => p.id === id)) continue;
    const label = labelFromParamId(id);
    params.push(applyParamFunction({ id, label, type: "text" }, inferParamFunction({ id, label, type: "text" })));
    added = true;
  }
  return added;
};

/**
 * Builds a short extras line for one analyzed parameter.
 *
 * @param p - Template param definition
 * @returns Extra detail shown under the param name
 */
const paramQuickRefDetail = (p: Param) => {
  const bits: string[] = [];
  if (p.label && p.label !== p.id) bits.push(p.label);
  if (p.type === "color" && p.defaultHex) bits.push(`default ${p.defaultHex}`);
  if (p.type === "image" && p.fidelity) bits.push(`fidelity ${p.fidelity}`);
  if ((p.type === "select" || p.type === "multiselect") && Array.isArray(p.options)) {
    bits.push(p.options.map((o) => o.label || o.value).filter(Boolean).join(", ") || `${p.options.length} options`);
  }
  if (p.type === "slider") bits.push(`${p.min}–${p.max}`);
  if (p.optional) bits.push("optional");
  return bits.join(" · ");
};

/**
 * True when an image param belongs on the background tile.
 *
 * @param p - Template param
 */
const isBackgroundImageParam = (p: Param) =>
  p?.type === "image" && /background/i.test(`${p.id || ""} ${p.label || ""}`);

/**
 * Sorted component list from the registry.
 *
 * @param registry - Loaded registry
 */
const compList = (registry: Registry) =>
  Object.values(registry.components || {}).sort((a, b) =>
    catOrder(a.category) - catOrder(b.category) || a.name.localeCompare(b.name));

/**
 * Template list from the registry.
 *
 * @param registry - Loaded registry
 */
const tmplList = (registry: Registry) => Object.values(registry.templates || {});

/**
 * Themes that stay on the public gallery.
 *
 * @param registry - Loaded registry
 */
const publicTemplates = (registry: Registry) => tmplList(registry).filter((t) => !t.archived);

/**
 * Category sort index.
 *
 * @param c - Category name
 */
const catOrder = (c?: string) => {
  const i = COMPONENT_CATEGORIES.indexOf(c);
  return i < 0 ? 99 : i;
};

/**
 * Palette groups: built-in categories plus any custom component groups.
 *
 * @param registry - Loaded registry
 */
const paletteGroups = (registry: Registry) => {
  const set = new Set(COMPONENT_CATEGORIES);
  for (const c of compList(registry)) if (c.category) set.add(c.category);
  return [...set];
};

/**
 * Decides whether a component can be added to the current stack.
 *
 * @param t - Open template
 * @param c - Candidate component
 * @param liveComponents - Current stack
 * @param library - Component library
 * @param pending - Extra pending selections
 */
const pickStatus = (
  t: Template,
  c: ComponentDef,
  liveComponents: StackItem[],
  library: Record<string, ComponentDef>,
  pending: Array<{ id: string }> = []
) => {
  const existing = liveComponents.find((s) => s.id === c.id);
  if (existing) {
    const where = SLOT_LABEL[existing.slot] || existing.slot || "Canvas";
    return { kind: "added" as const, reason: `Already on ${where}.`, slot: existing.slot };
  }
  const pendingOthers = pending.filter((s) => s.id !== c.id);
  const stack = [...liveComponents, ...pendingOthers];
  const sameGroup = c.group && stack.find((s) => library[s.id]?.group === c.group);
  const others = stack.filter((s) => s !== sameGroup);
  const { problems } = checkComponents(t, [...others, { id: c.id, values: {} }], library);
  const own = problems.find((pr) => pr.id === c.id);
  if (own) return { kind: "blocked" as const, reason: own.reason };
  if (sameGroup) {
    const otherName = library[sameGroup.id]?.name || sameGroup.id;
    return { kind: "swap" as const, reason: `Replaces ${otherName}.`, replaces: sameGroup };
  }
  return { kind: "ok" as const };
};

/**
 * Blank component used by New component.
 */
const starterComponent = (): ComponentDef => ({
  id: "",
  name: "",
  category: "",
  scope: "element",
  description: "",
  group: "",
  affects: [],
  conflictsWith: [],
  prompt: "",
  overrideNote: "",
  params: [],
  rules: []
});

export {
  PARAM_FUNCTIONS,
  labelFromParamId,
  inferParamFunction,
  paramStoredValue,
  setParamStoredValue,
  migrateStrayParamValues,
  applyParamFunction,
  formatParamValue,
  parseParamValue,
  paramForControl,
  promptParamIds,
  promptPlaceholders,
  ensureParamsForPrompt,
  paramQuickRefDetail,
  isBackgroundImageParam,
  compList,
  tmplList,
  publicTemplates,
  paletteGroups,
  pickStatus,
  starterComponent
};
