import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmplDir = path.join(root, "library", "templates");
const compDir = path.join(root, "library", "components");

const templates = {}, components = {};
for (const f of (await fs.readdir(tmplDir)).filter(f=>f.endsWith(".json"))) {
  const d = JSON.parse(await fs.readFile(path.join(tmplDir, f), "utf8"));
  templates[d.id] = d;
}
await fs.mkdir(compDir, { recursive: true });
for (const f of (await fs.readdir(compDir)).filter(f=>f.endsWith(".json"))) {
  const d = JSON.parse(await fs.readFile(path.join(compDir, f), "utf8"));
  components[d.id] = d;
}

const compiler = (await fs.readFile(path.join(root, "src", "compiler.js"), "utf8")).replace(/^export /gm, "");
const template = await fs.readFile(path.join(root, "frontend", "admin.template.html"), "utf8");

const registry = { templates, components, engine: { model: "demo", mock: true } };
// Inject compiler into module script, registry into its own plain script tag
const out = template
  .replace("/*__COMPILER__*/", () => compiler)
  .replace("/*__REGISTRY__*/null", () => JSON.stringify(registry));

await fs.mkdir(path.join(root, "public"), { recursive: true });
await fs.writeFile(path.join(root, "public", "index.html"), out);
console.log(`Built admin with ${Object.keys(templates).length} templates, ${Object.keys(components).length} components.`);
