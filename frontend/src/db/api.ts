import { hydrateComponent, hydrateTemplate } from "@lib/compiler";
import type { ComponentDef, Registry, Template } from "@/types/app";

/**
 * Fetches JSON, returning null on failure.
 *
 * @param url - Request URL
 */
const tryJson = async (url: string) => {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 2000);
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) return null;
    return await r.json();
  } catch {
    return null;
  }
};

/**
 * Loads the registry from the API, or null if the server is offline.
 */
const loadRegistry = async (): Promise<Registry | null> => {
  const server = await tryJson("api/registry");
  if (server?.templates) {
    server.components ||= {};
    return server;
  }
  return null;
};

/**
 * Saves a template to the API or into the in-memory registry.
 *
 * @param def - Template definition
 * @param mode - Server or demo
 * @param registry - Current registry
 */
const storeTemplate = async (def: Template, mode: string, registry: Registry) => {
  if (mode === "server") {
    const r = await fetch(`api/templates/${encodeURIComponent(def.id)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(def)
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Save failed.");
    return data.template as Template;
  }
  const existing = registry.templates[def.id];
  const next: Template = { ...(existing || {}), ...def };
  delete next.params;
  if ((!def.config || typeof def.config !== "object") && existing?.config) {
    next.config = existing.config;
    next.systemPrompt = existing.systemPrompt;
  }
  const changed = !existing || JSON.stringify([existing.systemPrompt, existing.config]) !== JSON.stringify([next.systemPrompt, next.config]);
  const saved = { ...next, version: existing ? (existing.version || 1) + (changed ? 1 : 0) : 1 };
  delete saved.params;
  return hydrateTemplate(saved) as Template;
};

/**
 * Deletes a template.
 *
 * @param id - Template id
 * @param mode - Server or demo
 */
const deleteTemplate = async (id: string, mode: string) => {
  if (mode === "server") {
    const r = await fetch(`api/templates/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!r.ok) throw new Error("Could not delete.");
  }
};

/**
 * Saves a component definition.
 *
 * @param def - Component definition
 * @param mode - Server or demo
 * @param registry - Current registry
 */
const storeComponent = async (def: ComponentDef, mode: string, registry: Registry) => {
  const body = { ...def };
  if (!body.group) delete body.group;
  if (!body.overrideNote) delete body.overrideNote;
  if (mode === "server") {
    const r = await fetch(`api/components/${encodeURIComponent(def.id)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Save failed.");
    return data.component as ComponentDef;
  }
  const existing = registry.components[def.id];
  const saved = { ...body, version: existing ? (existing.version || 1) + 1 : 1 };
  delete saved.params;
  delete saved.prompt;
  return hydrateComponent(saved) as ComponentDef;
};

/**
 * Deletes a component.
 *
 * @param id - Component id
 * @param mode - Server or demo
 */
const deleteComponent = async (id: string, mode: string) => {
  if (mode === "server") {
    const r = await fetch(`api/components/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!r.ok) throw new Error("Could not delete.");
  }
};

/**
 * Deletes generated designs by job id.
 *
 * @param ids - Selected design ids
 * @returns Ids the server removed
 */
const deleteJobs = async (ids: string[]) => {
  const r = await fetch("api/jobs", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Could not delete.");
  return (data.removed || []) as string[];
};

export { tryJson, loadRegistry, storeTemplate, deleteTemplate, storeComponent, deleteComponent, deleteJobs };
