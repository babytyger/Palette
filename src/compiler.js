// Palette Admin — prompt compiler.
// Takes a template definition + the user's parameter values and builds
// the exact prompt string sent to the image API.
// No imports, so the browser admin panel uses this same code.
//
// Components: a component is a reusable master prompt block (for example
// Duotone or Geometric Shapes) with its own controls. Users stack components
// on top of any template. compilePrompt() appends them in three sections:
//   ADDITIONAL ELEMENTS  (scope "element")  things added inside the image
//   THEME                (scope "theme")    treatments applied to the whole image
//   ADDITIONAL RULES     (scope "rule" + every component's rules list)

export const PARAM_TYPES = ["text", "textarea", "color", "palette", "select", "multiselect", "slider", "switch", "image"];
export const COMPONENT_SCOPES = ["theme", "element", "rule"];
export const IMAGE_FIDELITY = ["exact", "source", "style"];
export const COMPONENT_CATEGORIES = ["Colour", "Texture", "Shape", "Background", "Layout", "Subject", "Rules"];

const TOKEN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/**
 * Reads a config value as a placeholder name.
 *
 * @param token - Raw config value, with or without {{ }}
 * @returns Placeholder id
 */
const normalizeConfigToken = (token) => String(token ?? "").trim().replace(/^\{\{/, "").replace(/\}\}$/, "").trim();

/**
 * Turns a config key into a studio label.
 *
 * @param key - Snake-case config key
 * @returns Title-case label
 */
const labelFromConfigKey = (key) => String(key || "")
  .replace(/_/g, " ")
  .replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * True when a config key names an uploaded image.
 *
 * @param key - Config key
 * @returns Whether the control is an image
 */
const isImageConfigKey = (key) => /(?:^|_)image(?:_|$)/.test(key);
const HEX_VALUE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Reads a config value that may also carry a chosen text or image level.
 *
 * @param token - String value, or `{ value, type }`
 * @returns Plain value and an explicit type when one was stored
 */
const readConfigEntry = (token) => {
  if (token && typeof token === "object" && !Array.isArray(token)) {
    const value = token.value ?? token.token ?? token.placeholder ?? "";
    const type = token.type === "image" || token.type === "text" ? token.type : "";
    return { value: value == null ? "" : String(value), type };
  }
  return { value: token == null ? "" : String(token), type: "" };
};

/**
 * Type a config key would get before any chosen level.
 *
 * @param key - Config key
 * @param value - Config value
 * @returns image, color, or text
 */
const naturalParamType = (key, value) => {
  const bare = normalizeConfigToken(value);
  if (isImageConfigKey(key) || isImageConfigKey(bare)) return "image";
  if (/_color$/.test(key) || HEX_VALUE.test(bare)) return "color";
  return "text";
};

/**
 * Stores a config value, keeping a type only when it differs from the key.
 *
 * @param key - Config key
 * @param token - Current value or `{ value, type }`
 * @param type - Chosen text or image level
 * @returns Plain value, or `{ value, type }` when the choice is an override
 */
const packConfigValue = (key, token, type) => {
  const { value } = readConfigEntry(token);
  if (type !== "text" && type !== "image") return value;
  if (naturalParamType(key, value) === type) return value;
  return { value, type };
};

/**
 * Builds one studio control from a config entry.
 *
 * The key is the control kind. The value is the {{placeholder}} in the prompt.
 * A stored type of text or image wins over that guess.
 *
 * @param key - Config key, such as subject_image or highlight_color
 * @param token - Placeholder name used in the prompt
 * @returns Param definition the studio and compiler already understand
 */
const paramFromConfigEntry = (key, token, placeholders = new Set()) => {
  const { value: rawInput, type: forced } = readConfigEntry(token);
  const raw = rawInput.trim();
  const bare = normalizeConfigToken(raw);
  const linked = Boolean(bare) && placeholders.has(bare);
  const id = linked ? bare : placeholders.has(key) ? key : (TOKEN.test(bare) ? bare : key);
  const label = isImageConfigKey(key) && /(?:^|_)bg(?:_|$)/.test(key) && !/background/.test(key)
    ? "Background image"
    : labelFromConfigKey(key);
  const literal = !linked && raw && !placeholders.has(bare) ? raw : "";
  if (forced === "image" || (!forced && (isImageConfigKey(key) || isImageConfigKey(id)))) {
    return { id, label, type: "image", fidelity: "exact" };
  }
  if (!forced && (/_color$/.test(key) || HEX_VALUE.test(bare))) {
    const param = { id, label, type: "color" };
    if (HEX_VALUE.test(literal)) param.defaultHex = literal.toUpperCase();
    return param;
  }
  const param = { id, label, type: "text" };
  if (literal) param.defaultValue = literal;
  return param;
};

/**
 * Derives studio controls from a prompt config object.
 *
 * @param config - Map of control key to placeholder name
 * @returns Controls in config order
 */
const paramsFromConfig = (config, promptText = "") => {
  if (!config || typeof config !== "object" || Array.isArray(config)) return [];
  const placeholders = new Set(promptTokens(promptText));
  return Object.entries(config).map(([key, token]) => paramFromConfigEntry(key, token, placeholders));
};

/**
 * Unique {{placeholder}} names in a prompt, in first-seen order.
 *
 * @param text - Prompt text
 * @returns Placeholder ids
 */
const promptTokens = (text) => {
  const seen = new Set();
  const out = [];
  for (const match of String(text || "").matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)) {
    if (seen.has(match[1])) continue;
    seen.add(match[1]);
    out.push(match[1]);
  }
  return out;
};

/**
 * Checks that config keys, placeholder names, and the prompt agree.
 *
 * @param config - Prompt config
 * @param promptText - systemPrompt text
 * @param options.allowImage - Templates may declare image keys
 * @returns Plain-English errors
 */
const validateConfig = (config) => {
  if (config == null || typeof config !== "object" || Array.isArray(config)) {
    return ["config must be an object."];
  }
  return [];
};

/**
 * Attaches derived controls so the studio can read template.params.
 *
 * @param tpl - Template from disk or the editor
 * @returns Template with params derived from config
 */
const hydrateTemplate = (tpl) => {
  if (!tpl || typeof tpl !== "object") return tpl;
  return { ...tpl, params: paramsFromConfig(tpl.config, tpl.systemPrompt) };
};

/**
 * Attaches derived controls and keeps systemPrompt as the component text.
 *
 * @param comp - Component from disk or the editor
 * @returns Component with params derived from config
 */
const hydrateComponent = (comp) => {
  if (!comp || typeof comp !== "object") return comp;
  const systemPrompt = typeof comp.systemPrompt === "string" ? comp.systemPrompt : (comp.prompt || "");
  const config = comp.config && typeof comp.config === "object" && !Array.isArray(comp.config) ? comp.config : {};
  return { ...comp, systemPrompt, config, params: paramsFromConfig(config, systemPrompt) };
};

// Validates a template definition. Returns an array of plain-English errors.
export function validateTemplate(tpl) {
  const errors = [];
  if (!tpl || typeof tpl !== "object") return ["Template must be a JSON object."];
  if (!tpl.id || !/^[a-z0-9_-]{2,80}$/.test(tpl.id)) errors.push("id must use lowercase letters, numbers, underscores or hyphens.");
  if (!tpl.name) errors.push("Template needs a name.");
  if (!tpl.systemPrompt || typeof tpl.systemPrompt !== "string") errors.push("Template needs a systemPrompt.");
  if (tpl.config == null || typeof tpl.config !== "object" || Array.isArray(tpl.config)) {
    errors.push("Template needs a config object.");
  }
  if (tpl.locks != null && !Array.isArray(tpl.locks)) errors.push("locks must be an array of tags, e.g. [\"subject_colour\"].");
  if (tpl.referenceImage != null && tpl.referenceImage !== "") {
    if (typeof tpl.referenceImage !== "string") errors.push("referenceImage must be a string.");
    else if (!tpl.referenceImage.startsWith("data:image") && !tpl.referenceImage.startsWith("/references/")) {
      errors.push("referenceImage must be an uploaded image.");
    }
  }
  errors.push(...validateConfig(tpl.config));
  return errors;
}

// Validates a component definition. Returns an array of plain-English errors.
export function validateComponent(c) {
  const errors = [];
  if (!c || typeof c !== "object") return ["Component must be a JSON object."];
  if (!c.id || !/^[a-z0-9_-]{2,80}$/.test(c.id)) errors.push("id must use lowercase letters, numbers, underscores or hyphens.");
  if (!c.name) errors.push("Component needs a name.");
  if (!COMPONENT_SCOPES.includes(c.scope)) errors.push(`scope must be one of: ${COMPONENT_SCOPES.join(", ")}.`);
  if (!c.systemPrompt || typeof c.systemPrompt !== "string") errors.push("Component needs a systemPrompt.");
  if (c.config == null || typeof c.config !== "object" || Array.isArray(c.config)) errors.push("Component needs a config object.");
  for (const key of ["rules", "affects", "conflictsWith"]) {
    if (c[key] != null && !Array.isArray(c[key])) errors.push(`${key} must be an array.`);
  }
  errors.push(...validateConfig(c.config));
  return errors;
}

// Returns the default value for any param, used to pre-fill the UI.
export function defaultParamValue(p) {
  switch (p.type) {
    case "color": return p.defaultHex || "";
    case "select": return p.defaultValue ?? p.options?.[0]?.value;
    case "multiselect": return Array.isArray(p.defaultValue) ? [...p.defaultValue] : (p.options?.[0] ? [p.options[0].value] : []);
    case "slider": return p.defaultValue ?? Math.round((Number(p.min) + Number(p.max)) / 2);
    case "switch": return Boolean(p.defaultValue);
    case "palette": return Array.isArray(p.defaultValue) ? p.defaultValue.map((c) => ({ ...c })) : [];
    default: return p.defaultValue ?? null;
  }
}

// Checks a list of chosen components against each other and the template.
// selections: [{ id, values }]. library: { componentId: definition }.
// Returns { accepted: [{ component, values }], problems: [{ id, reason }] }.
// A later selection that clashes with an earlier one is dropped.
export function checkComponents(template, selections = [], library = {}) {
  const accepted = [];
  const problems = [];
  const locks = new Set(template?.locks || []);
  const blocked = new Set(template?.blockedComponents || []);
  for (const sel of selections) {
    const component = library[sel?.id];
    if (!component) { problems.push({ id: sel?.id, reason: `Unknown component "${sel?.id}".` }); continue; }
    if (accepted.some((a) => a.component.id === component.id)) {
      problems.push({ id: component.id, reason: `"${component.name}" was added twice. Only the first one is used.` });
      continue;
    }
    if (blocked.has(component.id)) {
      problems.push({ id: component.id, reason: `"${component.name}" is not allowed on the "${template.name}" template.` });
      continue;
    }
    const lockHit = (component.affects || []).filter((tag) => locks.has(tag));
    if (lockHit.length) {
      problems.push({ id: component.id, reason: `"${component.name}" changes ${lockHit.map(humanTag).join(" and ")}, which the "${template.name}" template locks.` });
      continue;
    }
    const clash = accepted.find((a) =>
      (component.group && a.component.group === component.group) ||
      (component.conflictsWith || []).includes(a.component.id) ||
      (a.component.conflictsWith || []).includes(component.id));
    if (clash) {
      const why = component.group && clash.component.group === component.group
        ? `both are ${humanTag(component.group)} options`
        : "they give opposite instructions";
      problems.push({ id: component.id, reason: `"${component.name}" can't be used with "${clash.component.name}" because ${why}.` });
      continue;
    }
    accepted.push({ component, values: sel.values || {} });
  }
  return { accepted, problems };
}

const humanTag = (t) => String(t).replace(/_/g, " ");

// Turns a rule list item into prompt text. Objects use text/prompt/rule.
function ruleToText(r) {
  if (r == null) return "";
  if (typeof r === "string") return r;
  if (typeof r === "object") {
    const text = r.text ?? r.prompt ?? r.rule;
    if (typeof text === "string") return text;
    try { return JSON.stringify(r); } catch { return ""; }
  }
  return String(r);
}

// Substitutes {{id}} and {id} using resolved param phrases.
function fillPlaceholders(text, resolvedValues) {
  return String(text ?? "")
    .replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (m, id) => (resolvedValues[id] !== undefined ? resolvedValues[id] : m))
    .replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (m, id) => (resolvedValues[id] !== undefined ? resolvedValues[id] : m));
}

// Resolves one component into its final prompt text.
export function compileComponent(component, values = {}) {
  const resolvedValues = {};
  const parts = [];
  for (const p of paramsFromConfig(component.config, component.systemPrompt)) {
    const raw = values[p.id] ?? defaultParamValue(p);
    const phrase = resolveParam(p, raw, component.paramPromptFragments || {});
    if (phrase !== "") resolvedValues[p.id] = phrase;
    parts.push({ paramId: p.id, label: p.label, type: p.type, rawValue: raw, resolvedPhrase: phrase });
  }
  const fill = (text) => fillPlaceholders(text, resolvedValues);
  return {
    id: component.id,
    name: component.name,
    scope: component.scope,
    affects: component.affects || [],
    text: fill(component.systemPrompt).trim(),
    overrideNote: component.overrideNote ? fill(component.overrideNote).trim() : "",
    rules: (component.rules || []).map(ruleToText).map(fill).map((r) => r.trim()).filter(Boolean),
    parts
  };
}

// Resolves one parameter value into a plain-English phrase for the prompt.
// For image params: the placeholder becomes a short reference ("the attached subject photograph").
// For color: it becomes the hex value and a colour name if available.
// For select: it becomes the option's own prompt text, or its label.
export function resolveParam(param, value, paramFragments = {}) {
  switch (param.type) {
    case "image": {
      return paramFragments[param.id]
        ? paramFragments[param.id].replace("{{value}}", value || "(no image)")
        : `the attached ${(param.label || param.id).toLowerCase()} (image {{index}})`;
    }
    case "color": {
      const hex = String(value || param.defaultHex || "").trim().toUpperCase();
      if (!hex) return "";
      const name = colorName(hex);
      const fragment = paramFragments[param.id] || "{{value}}";
      return fragment.replace("{{value}}", name ? `${name} (${hex})` : hex);
    }
    case "select": {
      const chosen = param.options?.find((o) => o.value === value) ?? param.options?.[0];
      if (!chosen) return "";
      const fragment = paramFragments[param.id];
      if (fragment && fragment.includes("{{optionPrompt}}")) return fragment.replace("{{optionPrompt}}", chosen.prompt || chosen.label);
      return chosen.prompt || chosen.label || String(value);
    }
    case "multiselect": {
      const chosen = (param.options || []).filter((o) => (Array.isArray(value) ? value : [value]).includes(o.value));
      const phrase = joinList(chosen.map((o) => o.prompt || o.label));
      const fragment = paramFragments[param.id];
      if (fragment && fragment.includes("{{optionPrompt}}")) return fragment.replace("{{optionPrompt}}", phrase);
      return phrase || "(nothing selected)";
    }
    case "slider": {
      const n = Number(value ?? param.defaultValue ?? param.min ?? 0);
      if (Array.isArray(param.bands)) {
        const band = param.bands.find((b) => n <= Number(b.upTo)) || param.bands[param.bands.length - 1];
        return band?.prompt || String(n);
      }
      return `${n}${param.unit || ""}`;
    }
    case "switch": return value ? (param.onPrompt || "enabled") : (param.offPrompt || "");
    case "palette": {
      const colours = Array.isArray(value) ? value : [];
      const names = colours.map((c) => (c.name ? `${c.name} (${c.hex})` : c.hex)).join(", ");
      return names || "(no colours selected)";
    }
    default: return String(value ?? "").trim();
  }
}

// Builds the complete prompt string.
// values: { paramId: userValue, ... }
// options.components: [{ id, values }] chosen by the user, in order.
// options.library: { componentId: definition } — the component registry.
// Returns { prompt, parts, components, componentProblems, warnings, resolvedValues }
export function compilePrompt(template, values = {}, options = {}) {
  const errors = validateTemplate(template);
  if (errors.length) throw Object.assign(new Error(errors.join(" ")), { errors });

  const warnings = [];
  const parts = [];
  const resolvedValues = {};
  const fragments = template.paramPromptFragments || {};

  // Attached images are sent to the API in param order. Optional images
  // with no upload are skipped, so number only the ones that will be sent.
  const params = paramsFromConfig(template.config, template.systemPrompt);
  const imageParams = params.filter((p) => p.type === "image");
  const imageValue = (p) => values[p.id] ?? values[p.configPath] ?? null;
  const sentImages = imageParams.filter((p) => imageValue(p) || !p.optional);
  const imageIndex = Object.fromEntries(sentImages.map((p, i) => [p.id, i + 1]));
  const missingImages = imageParams.filter((p) => !p.optional && !imageValue(p)).map((p) => p.label || p.id);

  // Resolve every param
  for (const param of params) {
    const userValue = values[param.id] ?? values[param.configPath] ?? null;
    const isImage = param.type === "image";

    // Missing required non-image param
    if (!isImage && (userValue == null || userValue === "") && !param.defaultHex && !param.defaultValue && !param.optional) {
      warnings.push(`"${param.label}" has no value in the prompt JSON.`);
    }

    let resolved = resolveParam(param, userValue ?? param.defaultHex ?? param.defaultValue, fragments);
    if (isImage) resolved = resolved.replace(/\s*\(image \{\{index\}\}\)/, imageIndex[param.id] ? ` (image ${imageIndex[param.id]})` : "").replace("{{index}}", imageIndex[param.id] || "");
    if (resolved !== "") resolvedValues[param.id] = resolved;

    if (param.type !== "image") {
      parts.push({
        paramId: param.id,
        label: param.label,
        type: param.type,
        rawValue: userValue ?? param.defaultHex ?? param.defaultValue ?? null,
        resolvedPhrase: resolved
      });
    } else {
      parts.push({
        paramId: param.id,
        label: param.label,
        type: "image",
        hasFile: Boolean(userValue),
        index: imageIndex[param.id] || null,
        fidelity: param.fidelity || "exact",
        resolvedPhrase: resolved
      });
    }
  }

  // Substitute every {{placeholder}} in the system prompt
  const base = template.systemPrompt.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, id) => {
    if (resolvedValues[id] !== undefined) return resolvedValues[id];
    warnings.push(`No resolved value found for {{${id}}}.`);
    return `{{${id}}}`;
  });

  // Components
  const { accepted, problems } = checkComponents(template, options.components || [], options.library || {});
  for (const pr of problems) warnings.push(pr.reason);
  const components = accepted.map((a) => compileComponent(a.component, a.values));
  const inputImages = sentImages.map((p) => ({
    index: imageIndex[p.id], id: p.id, label: p.label || p.id,
    fidelity: p.fidelity || "exact", usage: p.usage || ""
  }));
  const { prompt, sections } = assemblePrompt(base, components, { inputImages, templateName: template.name });

  return {
    prompt, parts, components, sections, componentProblems: problems, inputImages, missingImages,
    warnings, resolvedValues, templateId: template.id, version: template.version
  };
}

// Joins the template prompt and the compiled components into one master prompt.
// Returns the full prompt and the list of sections, so the UI can highlight them.
// Each section item has a short `name` for the live preview and `text` for the prompt.
export function assemblePrompt(base, components = [], { inputImages = [], templateName = "Template" } = {}) {
  const sections = [];
  const elements = components.filter((c) => c.scope === "element");
  const themes = components.filter((c) => c.scope === "theme");
  const recolours = themes.some((c) => c.affects?.includes("subject_colour"));
  const imageRules = [];

  // ATTACHED IMAGES comes first, so the model knows what each file is
  // before it reads the design instructions.
  if (inputImages.length) {
    sections.push({
      kind: "input", title: "ATTACHED IMAGES",
      intro: inputImages.length === 1
        ? "One image is attached to this request. It is referred to below as image 1."
        : `${inputImages.length} images are attached to this request, in this order. They are referred to below by number.`,
      items: inputImages.map((im) => ({ id: im.id, name: `Image ${im.index}: ${im.label}`, text: imageInstruction(im, recolours) }))
    });
    if (inputImages.some((im) => im.fidelity === "exact")) {
      imageRules.push({
        id: "exact-subject",
        name: "Exact subject",
        text: "Use the subject from the attached image exactly as photographed. Do not distort, stretch, warp, redraw, retouch or replace it, and do not change its identity, features or proportions."
      });
    }
  }
  sections.push({
    kind: "template",
    title: "TEMPLATE",
    text: base.trim(),
    items: [{ id: "template", name: templateName, text: base.trim() }]
  });

  const ruleItems = [];
  const seenRules = new Set();
  const pushRule = (item) => {
    if (!item?.text || seenRules.has(item.text)) return;
    seenRules.add(item.text);
    ruleItems.push(item);
  };
  for (const c of components.filter((c) => c.scope === "rule")) {
    pushRule({ id: c.id, name: c.name, text: c.text });
  }
  for (const c of components) {
    (c.rules || []).forEach((text, i) => pushRule({ id: `${c.id}-rule-${i}`, name: c.name, text }));
  }
  imageRules.forEach(pushRule);

  if (elements.length) {
    sections.push({
      kind: "element", title: "ADDITIONAL ELEMENTS",
      intro: "Add the following to the composition. Keep the layout and hierarchy described above.",
      items: elements.map((c) => ({ id: c.id, name: c.name, text: c.text }))
    });
  }
  if (themes.length) {
    sections.push({
      kind: "theme", title: "THEME",
      intro: "The following treatment applies to the whole finished image. Where it conflicts with any earlier instruction, follow this section.",
      items: themes.map((c) => ({ id: c.id, name: c.name, text: [c.text, c.overrideNote].filter(Boolean).join(" ") }))
    });
  }
  if (ruleItems.length) {
    sections.push({ kind: "rule", title: "ADDITIONAL RULES", items: ruleItems });
  }

  const blocks = sections.map((s) => {
    if (s.kind === "template") return s.text;
    const body = s.kind === "rule"
      ? s.items.map((i) => `- ${i.text}`).join("\n")
      : (s.items || []).map((i) => i.text).join("\n\n");
    return [s.title, s.intro, body].filter(Boolean).join("\n");
  });
  return { prompt: blocks.join("\n\n"), sections };
}

// Plain-English instruction for one attached image, based on its fidelity.
//   exact  - use the real subject unchanged (people, products, logos)
//   source - raw material that may be cropped and recoloured
//   style  - reference for look and feel only
function imageInstruction(im, recolours) {
  const n = `image ${im.index}`;
  if (im.fidelity === "source") {
    return [
      `Use ${n} (${im.label}) only as ${im.usage || "source material"}, in the way the instructions below describe.`,
      "You may crop it, scale it evenly and recolour it where the instructions say so.",
      "Do not stretch, warp or distort the content inside it, and do not invent content that is not in it."
    ].join(" ");
  }
  if (im.fidelity === "style") {
    return [
      `Use ${n} (${im.label}) only as ${im.usage || "a reference for style, colour and mood"}.`,
      "Do not copy its people, faces, text, logos or specific objects into the output."
    ].join(" ");
  }
  return [
    `${n[0].toUpperCase() + n.slice(1)} (${im.label}) is ${im.usage || "the main subject"}. Treat it as the exact source, not as inspiration.`,
    "Use the real person or object from this photograph exactly as it appears.",
    "Keep the identity, face and facial structure, expression, hairstyle, body shape and proportions, pose, clothing, accessories and every distinguishing detail unchanged.",
    "You may cut it out from its original background, scale it evenly, and crop or position it as the layout requires.",
    "Do not distort, stretch, squash, warp, reshape, redraw, retouch, beautify, age or de-age it. Do not replace it with a similar-looking person or object, and do not add or remove details.",
    recolours
      ? "Only the colour treatment in the THEME section may change how it looks. Its shape, features and identity must stay exactly the same."
      : "Keep its original, natural colours, skin tones and lighting."
  ].join(" ");
}

export { paramsFromConfig, hydrateTemplate, hydrateComponent, readConfigEntry, packConfigValue };

function joinList(items) {
  const xs = items.filter(Boolean);
  if (xs.length <= 1) return xs[0] || "";
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

// Builds a cache key payload string from the compiled prompt + model settings.
export function cacheKeyPayload(compiled, { model, quality, imageHashes = [], variation = 0, size = "1024x1024" }) {
  return stableJson({ prompt: compiled.prompt, model, quality, size, images: imageHashes, variation });
}

export function stableJson(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(",")}}`;
}

// Very small colour name lookup for common editorial palette values.
function colorName(hex) {
  const MAP = {
    "#FF0000": "red", "#DC2626": "signal red", "#EF4444": "bright red",
    "#0000FF": "blue", "#0047AB": "cobalt blue", "#1D4ED8": "strong blue", "#3B82F6": "sky blue",
    "#000000": "black", "#1A1A1A": "near-black", "#FFFFFF": "white", "#F3EFE6": "cream",
    "#FF6A13": "orange", "#F59E0B": "amber", "#10B981": "emerald green", "#7C3AED": "violet",
    "#EC4899": "pink", "#D97706": "golden yellow", "#6B7280": "grey",
    "#1D2B53": "deep navy", "#FACC15": "yellow", "#0F766E": "teal", "#111111": "black"
  };
  return MAP[hex.toUpperCase()] || null;
}
