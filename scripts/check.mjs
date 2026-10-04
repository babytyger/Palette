import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compilePrompt, validateTemplate, validateComponent, defaultParamValue, paramsFromConfig } from "../src/compiler.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "library", "templates");
const compDir = path.join(root, "library", "components");
let ok = 0, bad = 0;

// Components
const library = {};
await fs.mkdir(compDir, { recursive: true });
for (const f of (await fs.readdir(compDir)).filter(f=>f.endsWith(".json"))) {
  const c = JSON.parse(await fs.readFile(path.join(compDir, f), "utf8"));
  const errs = validateComponent(c);
  if (errs.length) { bad++; console.log(`✗ component ${f}\n  ${errs.join("\n  ")}`); continue; }
  library[c.id] = c; ok++;
}
console.log(`${Object.keys(library).length} components valid.\n`);

// Templates, each compiled alone and with every component (one at a time)
for (const f of (await fs.readdir(dir)).filter(f=>f.endsWith(".json"))) {
  const tpl = JSON.parse(await fs.readFile(path.join(dir, f), "utf8"));
  const errs = validateTemplate(tpl);
  if (errs.length) { bad++; console.log(`✗ ${f}\n  ${errs.join("\n  ")}`); continue; }
  const values = {};
  for (const p of paramsFromConfig(tpl.config)) if (p.type !== "image") values[p.id] = defaultParamValue(p);
  const compiled = compilePrompt(tpl, values);
  const leaked = compiled.prompt.includes("data:image");
  console.log(`✓ ${tpl.id}  ${compiled.prompt.length} chars  ${compiled.warnings.length} warnings  image-leaked:${leaked}`);
  let unresolved = 0;
  for (const id of Object.keys(library)) {
    const withComp = compilePrompt(tpl, values, { library, components: [{ id, values: {} }] });
    if (/\{\{[a-zA-Z0-9_]+\}\}/.test(withComp.prompt) || withComp.componentProblems.length) {
      unresolved++; console.log(`  ✗ with ${id}: ${withComp.componentProblems.map(p=>p.reason).join(" ") || "unresolved placeholder"}`);
    }
  }
  console.log(`  ${Object.keys(library).length - unresolved}/${Object.keys(library).length} components compile cleanly on this template`);
  ok++;
}
console.log(`\n${ok} valid, ${bad} invalid.`);
if (bad) process.exitCode = 1;
