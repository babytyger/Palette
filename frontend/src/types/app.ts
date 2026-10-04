export type Mode = "server" | "demo";

export type WorkspaceNav = "studio" | "templates" | "components" | "jobs" | "newTemplate";

export type View =
  | WorkspaceNav
  | "newComponent"
  | "editThemes"
  | `edit:${string}`
  | `editComponent:${string}`
  | `template:${string}`;

export type Slot = "subject" | "canvas" | "background";

export type ParamOption = { value: string; label: string; prompt?: string };

export type Param = {
  id: string;
  label: string;
  type: string;
  description?: string;
  defaultValue?: any;
  defaultHex?: string;
  options?: ParamOption[];
  min?: number;
  max?: number;
  step?: number;
  optional?: boolean;
  fitSquare?: boolean;
  fidelity?: string;
  [key: string]: any;
};

export type Template = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  systemPrompt?: string;
  config?: Record<string, string>;
  params?: Param[];
  referenceImage?: string;
  archived?: boolean;
  version?: number;
  apiSize?: string;
  export?: unknown;
  locks?: string[];
  blockedComponents?: string[];
  [key: string]: any;
};

export type ComponentDef = {
  id: string;
  name: string;
  category?: string;
  scope: string;
  description?: string;
  group?: string;
  systemPrompt?: string;
  config?: Record<string, string>;
  prompt?: string;
  params?: Param[];
  rules?: any[];
  version?: number;
  [key: string]: any;
};

export type StackItem = {
  id: string;
  values: Record<string, any>;
  slot: Slot;
};

export type StudioSession = {
  values: Record<string, any>;
  components: StackItem[];
  previewJob: any;
  selectedPaletteId: string | null;
};

export type AppLocation = {
  view: View;
  navView: string;
  crumb: string;
  selectedTemplateId: string | null;
  promptRailVisible: boolean;
};

export type Registry = {
  templates: Record<string, Template>;
  components: Record<string, ComponentDef>;
  engine?: { model?: string; mock?: boolean };
  _jobs?: any[];
};

export type Job = {
  id: string;
  status: string;
  templateId?: string;
  templateName?: string;
  createdAt?: string;
  size?: string;
  error?: string;
  warnings?: string[];
  result?: { imageUrl?: string; cached?: boolean };
};
