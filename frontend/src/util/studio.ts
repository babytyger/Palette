import { defaultParamValue } from "@lib/compiler";
import type { StudioSession, Template } from "@/types/app";

const CONTROL_TYPES = ["color", "select", "multiselect", "slider", "switch"];

/**
 * Default live values for a template's colour and option controls.
 *
 * @param template - Template whose params to seed
 * @returns Param id to default value
 */
const defaultStudioValues = (template: Template) => {
  const values: Record<string, any> = {};
  for (const p of template.params || []) {
    if (CONTROL_TYPES.includes(p.type)) values[p.id] = defaultParamValue(p);
  }
  return values;
};

/**
 * Empty studio session for a template (no uploads, stack, or preview).
 *
 * @param template - Template to reset
 * @returns Fresh session
 */
const emptyStudioSession = (template: Template): StudioSession => ({
  values: defaultStudioValues(template),
  components: [],
  previewJob: null,
  selectedPaletteId: null
});

export { defaultStudioValues, emptyStudioSession };
