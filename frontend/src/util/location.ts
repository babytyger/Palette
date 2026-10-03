import type { AppLocation, Registry, View } from "@/types/app";

const KEY = "palette.location";

const THEMES: AppLocation = {
  view: "templates",
  navView: "templates",
  crumb: "Themes",
  selectedTemplateId: null,
  promptRailVisible: false
};

/**
 * Reads the last workspace page for this tab.
 *
 * @returns Saved location, or null when nothing is stored
 */
const readLocation = (): AppLocation | null => {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppLocation;
    if (!parsed || typeof parsed.view !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
};

/**
 * Remembers the current workspace page across refresh.
 *
 * @param location - Page to restore next load
 */
const writeLocation = (location: AppLocation) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(location));
  } catch {
    /* ignore quota errors */
  }
};

/**
 * Keeps a saved page only when its template or component still exists.
 *
 * @param saved - Location from this tab
 * @param registry - Loaded templates and components
 * @returns Location safe to open
 */
const resolveLocation = (saved: AppLocation | null, registry: Registry): AppLocation => {
  if (!saved) return THEMES;
  const view = saved.view;
  const templateId = (prefix: string) => view.startsWith(prefix) ? view.slice(prefix.length) : "";
  if (view.startsWith("template:")) {
    const id = templateId("template:");
    if (!registry.templates[id]) return THEMES;
    return { view, navView: "studio", crumb: "Design studio", selectedTemplateId: id, promptRailVisible: true };
  }
  if (view.startsWith("edit:")) {
    const id = templateId("edit:");
    if (!registry.templates[id]) return THEMES;
    return { view: view as View, navView: "studio", crumb: "Edit template", selectedTemplateId: id, promptRailVisible: false };
  }
  if (view.startsWith("editComponent:")) {
    const id = templateId("editComponent:");
    if (!registry.components[id]) {
      return { view: "components", navView: "components", crumb: "Components", selectedTemplateId: saved.selectedTemplateId, promptRailVisible: false };
    }
    return { view, navView: "components", crumb: "Edit component", selectedTemplateId: saved.selectedTemplateId, promptRailVisible: false };
  }
  if (view === "newComponent") {
    return { view, navView: "components", crumb: "New component", selectedTemplateId: saved.selectedTemplateId, promptRailVisible: false };
  }
  if (view === "editThemes") return THEMES;
  if (view === "newTemplate") {
    return { view, navView: "newTemplate", crumb: "New template", selectedTemplateId: saved.selectedTemplateId, promptRailVisible: false };
  }
  if (view === "studio") {
    const id = saved.selectedTemplateId && registry.templates[saved.selectedTemplateId] ? saved.selectedTemplateId : null;
    if (!id) return { view: "studio", navView: "studio", crumb: "Design studio", selectedTemplateId: null, promptRailVisible: false };
    return { view: `template:${id}`, navView: "studio", crumb: "Design studio", selectedTemplateId: id, promptRailVisible: true };
  }
  if (view === "components" || view === "jobs" || view === "templates") {
    const crumb = view === "components" ? "Components" : view === "jobs" ? "Recent designs" : "Themes";
    return { view, navView: view, crumb, selectedTemplateId: saved.selectedTemplateId, promptRailVisible: false };
  }
  return THEMES;
};

export { readLocation, writeLocation, resolveLocation };
