import { checkComponents, COMPONENT_CATEGORIES, defaultParamValue, packConfigValue, readConfigEntry } from "@lib/compiler";
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
  if (type === "color") next.defaultHex = p.defaultHex || seeded || "";
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
 * Builds a config key for a placeholder that is missing from config.
 *
 * @param id - Placeholder name
 * @param taken - Keys already used
 * @returns Snake-case config key
 */
const configKeyForToken = (id: string, taken: Set<string>) => {
  let key = id.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
  if (/tone|tint|colou?r/.test(key) && !key.endsWith("_color")) {
    key = `${key.replace(/_(tone|tint|colou?r)$/, "")}_color`;
  }
  if (/image/.test(key) && !/_image(?:_|$)/.test(key)) {
    key = key.includes("background") ? "background_image" : "subject_image";
  }
  const base = key || "param";
  let next = base;
  let n = 2;
  while (taken.has(next)) {
    next = `${base}_${n}`;
    n += 1;
  }
  return next;
};

/**
 * Adds config entries for {{placeholders}} that the component prompt uses.
 *
 * @param def - Component definition
 * @returns Whether config entries were added
 */
const ensureConfigForPrompt = (def: ComponentDef) => {
  if (!def || typeof def !== "object") return false;
  if (!def.systemPrompt && def.prompt) def.systemPrompt = def.prompt;
  const config: Record<string, string> = { ...(def.config || {}) };
  const taken = new Set(Object.keys(config));
  const tokens = new Set(Object.values(config));
  let added = false;
  for (const id of promptPlaceholders(def.systemPrompt || "")) {
    if (tokens.has(id)) continue;
    const key = configKeyForToken(id, taken);
    config[key] = id;
    taken.add(key);
    tokens.add(id);
    added = true;
  }
  def.config = config;
  delete def.params;
  delete def.prompt;
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
 * True when a value is a map of snake_case keys to placeholder strings.
 *
 * @param value - Candidate config
 * @returns Whether every entry is a config pair
 */
/**
 * Balanced `{...}` slices in source order.
 *
 * @param text - Editor text
 * @returns Object source strings
 */
const jsonObjectsIn = (text: string) => {
  const found: string[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== "{") continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = i; j < text.length; j += 1) {
      const c = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === "\"") inStr = false;
        continue;
      }
      if (c === "\"") inStr = true;
      else if (c === "{") depth += 1;
      else if (c === "}") {
        depth -= 1;
        if (depth === 0) {
          found.push(text.slice(i, j + 1));
          i = j;
          break;
        }
      }
    }
  }
  return found;
};

type ParamLevel = "text" | "image";

type PromptDraft = {
  title: string;
  name: string;
  id: string;
  systemPrompt: string;
  config: Record<string, string>;
  paramTypes: Record<string, ParamLevel>;
  components: string[];
  configError: string;
  parsed: boolean;
};

type ConfigMap = {
  config: Record<string, string>;
  paramTypes: Record<string, ParamLevel>;
};

/**
 * Reads a config object without requiring a fixed key or value shape.
 *
 * @param value - Candidate config
 * @returns String map plus any chosen text or image levels, or null when the value is not an object
 */
const configRecord = (value: unknown): ConfigMap | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const config: Record<string, string> = {};
  const paramTypes: Record<string, ParamLevel> = {};
  for (const [key, token] of Object.entries(value)) {
    const read = readConfigEntry(token);
    config[key] = read.value;
    if (read.type === "text" || read.type === "image") paramTypes[key] = read.type;
  }
  return { config, paramTypes };
};

/**
 * Names listed in a components array.
 *
 * @param value - JSON components field
 * @returns Display names
 */
const componentLabels = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      return String(record.name || record.id || "");
    }
    return "";
  }).filter(Boolean);
};

/**
 * Reads config from a template object or from a prompt plus CONFIG block.
 *
 * @param raw - Template editor text
 * @returns Parsed config, or null when the field is empty
 */
const readPromptDraft = (raw: string): PromptDraft | null => {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    const def = JSON.parse(text) as Record<string, unknown>;
    if (def && typeof def === "object" && !Array.isArray(def)) {
      const ownConfig = configRecord(def.config);
      const picked = ownConfig || (!def.systemPrompt && !def.name ? configRecord(def) : null);
      const name = typeof def.name === "string" ? def.name : "";
      const id = typeof def.id === "string" ? def.id : "";
      return {
        title: [name, id].filter(Boolean).join(" · "),
        name,
        id,
        systemPrompt: typeof def.systemPrompt === "string" ? def.systemPrompt : (typeof def.prompt === "string" ? def.prompt : ""),
        config: picked?.config || {},
        paramTypes: picked?.paramTypes || {},
        components: componentLabels(def.components),
        configError: "",
        parsed: true
      };
    }
  } catch {
    // A prompt with a CONFIG block is not one JSON document.
  }
  const objects = jsonObjectsIn(text);
  for (let i = objects.length - 1; i >= 0; i -= 1) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(objects[i]);
    } catch {
      continue;
    }
    const record = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    if (!record) continue;
    const nested = configRecord(record.config);
    const picked = nested || configRecord(record);
    if (!picked) continue;
    const cut = text.lastIndexOf(objects[i]);
    return {
      title: "",
      name: typeof record.name === "string" ? record.name : "",
      id: typeof record.id === "string" ? record.id : "",
      systemPrompt: text.slice(0, cut).replace(/\bCONFIG\s*$/i, "").trim(),
      config: picked.config,
      paramTypes: picked.paramTypes,
      components: componentLabels(record.components),
      configError: "",
      parsed: false
    };
  }
  const configError = /(?:^|\n)\s*CONFIG\s*(?:\n|$)/i.test(text) ? "The CONFIG block is not valid JSON." : "";
  return { title: "", name: "", id: "", systemPrompt: text, config: {}, paramTypes: {}, components: [], configError, parsed: false };
};

/**
 * Prints a template as prompt text plus a CONFIG block.
 *
 * @param tpl - Template prompt and config
 * @returns Editor document
 */
const formatPromptDocument = (tpl: { systemPrompt?: string; config?: Record<string, unknown> | null }) => {
  const prompt = String(tpl?.systemPrompt || "").replace(/\s+$/, "");
  const config = tpl?.config && typeof tpl.config === "object" && !Array.isArray(tpl.config) ? tpl.config : {};
  const placeholders = new Set(promptPlaceholders(prompt));
  const shown = Object.fromEntries(Object.entries(config).map(([key, token]) => {
    const read = readConfigEntry(token);
    const text = read.value.trim();
    const bare = text.replace(/^\{\{/, "").replace(/\}\}$/, "").trim();
    const display = placeholders.has(bare) ? `{{${bare}}}` : text;
    return [key, read.type ? packConfigValue(key, display, read.type) : display];
  }));
  const block = `CONFIG\n${JSON.stringify(shown, null, 2)}\n`;
  return prompt ? `${prompt}\n\n${block}` : block;
};

/**
 * Sets one config entry to text or image and writes that choice back into the prompt.
 *
 * @param raw - Editor text
 * @param key - Config key
 * @param type - Chosen level
 * @returns Updated editor text
 */
const applyConfigParamType = (raw: string, key: string, type: ParamLevel) => {
  const text = String(raw || "");
  const write = (token: unknown) => packConfigValue(key, token, type);
  try {
    const def = JSON.parse(text.trim()) as Record<string, unknown>;
    if (def && typeof def === "object" && !Array.isArray(def)) {
      const nested = def.config && typeof def.config === "object" && !Array.isArray(def.config)
        ? def.config as Record<string, unknown>
        : null;
      if (nested && Object.prototype.hasOwnProperty.call(nested, key)) {
        nested[key] = write(nested[key]);
        return JSON.stringify(def, null, 2);
      }
      if (!nested && !def.systemPrompt && !def.name && Object.prototype.hasOwnProperty.call(def, key)) {
        def[key] = write(def[key]);
        return JSON.stringify(def, null, 2);
      }
    }
  } catch {
    // A prompt with a CONFIG block is not one JSON document.
  }
  const objects = jsonObjectsIn(text);
  for (let i = objects.length - 1; i >= 0; i -= 1) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(objects[i]);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    const record = parsed as Record<string, unknown>;
    const nested = record.config && typeof record.config === "object" && !Array.isArray(record.config)
      ? record.config as Record<string, unknown>
      : null;
    const target = nested || record;
    if (!Object.prototype.hasOwnProperty.call(target, key)) continue;
    target[key] = write(target[key]);
    const cut = text.lastIndexOf(objects[i]);
    return `${text.slice(0, cut)}${JSON.stringify(record, null, 2)}${text.slice(cut + objects[i].length)}`;
  }
  return text;
};

/**
 * Placeholder ids in the prompt that no config key or value covers.
 *
 * @param raw - Editor text
 * @returns Missing placeholder ids, or none when the CONFIG block is invalid
 */
const missingConfigPlaceholders = (raw: string) => {
  const draft = readPromptDraft(raw);
  if (!draft || draft.configError) return [];
  const covered = new Set<string>();
  for (const [key, value] of Object.entries(draft.config)) {
    covered.add(key);
    const bare = String(value).replace(/^\{\{/, "").replace(/\}\}$/, "").trim();
    if (bare) covered.add(bare);
  }
  return promptPlaceholders(draft.systemPrompt).filter((id) => !covered.has(id));
};

/**
 * True when a JSON object is a stored text or image value, not a config map.
 *
 * @param record - Parsed object
 * @returns Whether the object is `{ value, type }`
 */
const isPackedConfigValue = (record: Record<string, unknown>) => {
  const keys = Object.keys(record);
  return keys.length > 0 && keys.every((key) => key === "value" || key === "token" || key === "placeholder" || key === "type");
};

const SNAKE_KEY = /^[a-z][a-z0-9_]*$/;

/**
 * Turns a config key into lowercase snake_case.
 *
 * @param key - Config key, such as subjectImage1
 * @returns Key such as subject_image_1
 */
const snakeConfigKey = (key: string) => {
  if (SNAKE_KEY.test(key)) return key;
  const snake = String(key || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([A-Za-z])(\d)/g, "$1_$2")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return snake || "param";
};

/**
 * Config keys that are not lowercase snake_case.
 *
 * @param raw - Editor text
 * @returns Keys Fix will rename
 */
const configKeysToFix = (raw: string) => {
  const draft = readPromptDraft(raw);
  if (!draft || draft.configError) return [];
  return Object.keys(draft.config).filter((key) => snakeConfigKey(key) !== key);
};

/**
 * Renames config keys to snake_case without changing their values.
 *
 * @param target - Config object
 * @returns Whether any key changed
 */
const renameConfigKeys = (target: Record<string, unknown>) => {
  const taken = new Set<string>();
  const next: Record<string, unknown> = {};
  let changed = false;
  for (const [key, value] of Object.entries(target)) {
    let name = snakeConfigKey(key);
    if (name !== key) changed = true;
    const base = name;
    let n = 2;
    while (taken.has(name)) {
      name = `${base}_${n}`;
      n += 1;
      changed = true;
    }
    taken.add(name);
    next[name] = value;
  }
  if (!changed) return false;
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, next);
  return true;
};

/**
 * Adds missing placeholders and renames config keys to snake_case.
 *
 * @param raw - Editor text
 * @returns Updated editor text
 */
const fixPromptConfig = (raw: string) => {
  const missing = missingConfigPlaceholders(raw);
  const text = String(raw || "");
  const repair = (target: Record<string, unknown>) => {
    renameConfigKeys(target);
    for (const id of missing) {
      if (!Object.prototype.hasOwnProperty.call(target, id)) target[id] = `{{${id}}}`;
    }
  };
  if (!missing.length && !configKeysToFix(raw).length) return raw;
  try {
    const def = JSON.parse(text.trim()) as Record<string, unknown>;
    if (def && typeof def === "object" && !Array.isArray(def)) {
      const nested = def.config && typeof def.config === "object" && !Array.isArray(def.config)
        ? def.config as Record<string, unknown>
        : null;
      if (nested) {
        repair(nested);
        return JSON.stringify(def, null, 2);
      }
      if (def.systemPrompt || def.prompt || def.name) {
        def.config = {};
        repair(def.config as Record<string, unknown>);
        return JSON.stringify(def, null, 2);
      }
      repair(def);
      return JSON.stringify(def, null, 2);
    }
  } catch {
    // A prompt with a CONFIG block is not one JSON document.
  }
  const objects = jsonObjectsIn(text);
  for (let i = objects.length - 1; i >= 0; i -= 1) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(objects[i]);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    const record = parsed as Record<string, unknown>;
    if (isPackedConfigValue(record)) continue;
    const nested = record.config && typeof record.config === "object" && !Array.isArray(record.config)
      ? record.config as Record<string, unknown>
      : null;
    repair(nested || record);
    const cut = text.lastIndexOf(objects[i]);
    return `${text.slice(0, cut)}${JSON.stringify(record, null, 2)}${text.slice(cut + objects[i].length)}`;
  }
  const block = `CONFIG\n${JSON.stringify(Object.fromEntries(missing.map((id) => [id, `{{${id}}}`])), null, 2)}\n`;
  const trimmed = text.replace(/\s+$/, "");
  return trimmed ? `${trimmed}\n\n${block}` : block;
};

/**
 * Writes config values, keeping a text or image level when one was chosen.
 *
 * @param config - Bare config values
 * @param paramTypes - Chosen levels keyed by config key
 * @returns Config ready to save
 */
const configWithLevels = (config: Record<string, string>, paramTypes: Record<string, ParamLevel>) => Object.fromEntries(
  Object.entries(config).map(([key, value]) => [key, paramTypes[key] ? packConfigValue(key, value, paramTypes[key]) : value])
);

/**
 * Stores config values as placeholder names, without {{ }}.
 *
 * @param config - Config map from the editor
 * @returns Bare placeholder names
 */
const bareConfigTokens = (config: Record<string, string>) => Object.fromEntries(
  Object.entries(config).map(([key, token]) => [key, String(token ?? "").trim().replace(/^\{\{/, "").replace(/\}\}$/, "").trim()])
);

/**
 * Builds a template id from a display name.
 *
 * @param name - Theme name
 * @returns Lowercase id
 */
const templateIdFromName = (name: string) => String(name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);

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
  systemPrompt: "",
  overrideNote: "",
  config: {},
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
  readPromptDraft,
  formatPromptDocument,
  applyConfigParamType,
  fixPromptConfig,
  configKeysToFix,
  snakeConfigKey,
  configWithLevels,
  bareConfigTokens,
  templateIdFromName,
  ensureConfigForPrompt,
  paramQuickRefDetail,
  isBackgroundImageParam,
  compList,
  tmplList,
  publicTemplates,
  paletteGroups,
  pickStatus,
  starterComponent
};
