// Template and component registry.
// Each template is one JSON file in library/templates/.
// Each component is one JSON file in library/components/.
// Files are read fresh on every request, so edits apply without restart.
import fs from "node:fs/promises";
import path from "node:path";
import { validateTemplate, validateComponent } from "./compiler.js";
import { resolveReferenceImage, deleteReferenceImages } from "../util/referenceImage.js";

const LIB = path.resolve(process.env.LIBRARY_DIR || "library");
const TMPL_DIR = path.join(LIB, "templates");
const COMP_DIR = path.join(LIB, "components");

export async function loadTemplates() {
  await fs.mkdir(TMPL_DIR, { recursive: true });
  const out = {};
  for (const f of (await fs.readdir(TMPL_DIR)).filter((x) => x.endsWith(".json"))) {
    try {
      const d = JSON.parse(await fs.readFile(path.join(TMPL_DIR, f), "utf8"));
      out[d.id] = d;
    } catch (e) { console.warn(`Skipped ${f}: ${e.message}`); }
  }
  return out;
}

export async function getTemplate(id) {
  return (await loadTemplates())[id] || null;
}

export async function saveTemplate(tpl) {
  const errors = validateTemplate(tpl);
  if (errors.length) throw Object.assign(new Error(errors.join(" ")), { status: 400, errors });
  const existing = await getTemplate(tpl.id);
  const referenceImage = await resolveReferenceImage(tpl.id, tpl.referenceImage);
  const changed = !existing || JSON.stringify([existing.systemPrompt, existing.params]) !== JSON.stringify([tpl.systemPrompt, tpl.params]);
  const saved = { ...tpl, version: existing ? (existing.version || 1) + (changed ? 1 : 0) : 1, updatedAt: new Date().toISOString() };
  if (referenceImage) saved.referenceImage = referenceImage;
  else delete saved.referenceImage;
  const file = path.join(TMPL_DIR, `${tpl.id.replace(/[^a-z0-9_-]/g, "_")}.json`);
  await fs.writeFile(file, JSON.stringify(saved, null, 2) + "\n");
  return { template: saved, created: !existing };
}

export async function deleteTemplate(id) {
  const t = await getTemplate(id);
  if (!t) throw Object.assign(new Error(`No template called ${id}.`), { status: 404 });
  await fs.unlink(path.join(TMPL_DIR, `${id}.json`));
  await deleteReferenceImages(id);
}

// ── Components ───────────────────────────────────────────────────────────────
// Each component is one JSON file in library/components/.
// Components replace the old "fragments": they are prompt blocks with controls
// that users stack on top of any template.

export async function loadComponents() {
  await fs.mkdir(COMP_DIR, { recursive: true });
  const out = {};
  for (const f of (await fs.readdir(COMP_DIR)).filter((x) => x.endsWith(".json"))) {
    try {
      const d = JSON.parse(await fs.readFile(path.join(COMP_DIR, f), "utf8"));
      out[d.id] = d;
    } catch (e) { console.warn(`Skipped component ${f}: ${e.message}`); }
  }
  return out;
}

export async function getComponent(id) {
  return (await loadComponents())[id] || null;
}

export async function saveComponent(comp) {
  const errors = validateComponent(comp);
  if (errors.length) throw Object.assign(new Error(errors.join(" ")), { status: 400, errors });
  await fs.mkdir(COMP_DIR, { recursive: true });
  const existing = await getComponent(comp.id);
  const changed = !existing || JSON.stringify([existing.prompt, existing.params, existing.rules]) !== JSON.stringify([comp.prompt, comp.params, comp.rules]);
  const saved = { ...comp, version: existing ? (existing.version || 1) + (changed ? 1 : 0) : 1, updatedAt: new Date().toISOString() };
  await fs.writeFile(path.join(COMP_DIR, `${comp.id}.json`), JSON.stringify(saved, null, 2) + "\n");
  return { component: saved, created: !existing };
}

export async function deleteComponent(id) {
  if (!/^[a-z0-9_-]{2,80}$/.test(id)) throw Object.assign(new Error("Invalid component id."), { status: 400 });
  try { await fs.unlink(path.join(COMP_DIR, `${id}.json`)); }
  catch { throw Object.assign(new Error(`No component called ${id}.`), { status: 404 }); }
}
