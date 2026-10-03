import { createContext, useContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { Mode, Registry, Slot, StackItem, View } from "@/types/app";
import { SLOT_ORDER } from "@/util/format";
import { readLocation } from "@/util/location";

type AppCtx = {
  mode: Mode;
  setMode: Dispatch<SetStateAction<Mode>>;
  registry: Registry;
  setRegistry: Dispatch<SetStateAction<Registry>>;
  view: View;
  setView: Dispatch<SetStateAction<View>>;
  crumb: string;
  setCrumb: Dispatch<SetStateAction<string>>;
  navView: string;
  setNavView: Dispatch<SetStateAction<string>>;
  selectedTemplateId: string | null;
  setSelectedTemplateId: Dispatch<SetStateAction<string | null>>;
  liveValues: Record<string, any>;
  setLiveValues: Dispatch<SetStateAction<Record<string, any>>>;
  liveComponents: StackItem[];
  setLiveComponents: Dispatch<SetStateAction<StackItem[]>>;
  selectedPaletteId: string | null;
  setSelectedPaletteId: Dispatch<SetStateAction<string | null>>;
  promptDrawerOpen: boolean;
  setPromptDrawerOpen: Dispatch<SetStateAction<boolean>>;
  promptRailVisible: boolean;
  setPromptRailVisible: Dispatch<SetStateAction<boolean>>;
  compiled: any;
  setCompiled: Dispatch<SetStateAction<any>>;
  previewJob: any;
  setPreviewJob: Dispatch<SetStateAction<any>>;
  editingComponentId: string | null;
  setEditingComponentId: Dispatch<SetStateAction<string | null>>;
  componentsForCompile: () => Array<{ id: string; values: object }>;
};

const Context = createContext<AppCtx | null>(null);

/**
 * Holds workspace navigation, registry, and studio stack state.
 *
 * @param props.children - App tree
 */
const AppProvider = ({ children }: { children: ReactNode }) => {
  const [seed] = useState(() => readLocation());
  const [mode, setMode] = useState<Mode>("demo");
  const [registry, setRegistry] = useState<Registry>({ templates: {}, components: {} });
  const [view, setView] = useState<View>(seed?.view || "templates");
  const [crumb, setCrumb] = useState(seed?.crumb || "Themes");
  const [navView, setNavView] = useState(seed?.navView || "templates");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(seed?.selectedTemplateId ?? null);
  const [liveValues, setLiveValues] = useState<Record<string, any>>({});
  const [liveComponents, setLiveComponents] = useState<StackItem[]>([]);
  const [selectedPaletteId, setSelectedPaletteId] = useState<string | null>(null);
  const [promptDrawerOpen, setPromptDrawerOpen] = useState(false);
  const [promptRailVisible, setPromptRailVisible] = useState(seed?.promptRailVisible ?? false);
  const [compiled, setCompiled] = useState<any>(null);
  const [previewJob, setPreviewJob] = useState<any>(null);
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null);

  const value = useMemo<AppCtx>(() => ({
    mode, setMode, registry, setRegistry, view, setView, crumb, setCrumb, navView, setNavView,
    selectedTemplateId, setSelectedTemplateId, liveValues, setLiveValues, liveComponents, setLiveComponents,
    selectedPaletteId, setSelectedPaletteId, promptDrawerOpen, setPromptDrawerOpen, promptRailVisible, setPromptRailVisible,
    compiled, setCompiled, previewJob, setPreviewJob, editingComponentId, setEditingComponentId,
    componentsForCompile: () =>
      [...liveComponents]
        .sort((a, b) => (SLOT_ORDER[a.slot] ?? 1) - (SLOT_ORDER[b.slot] ?? 1))
        .map(({ id, values }) => ({ id, values }))
  }), [
    mode, registry, view, crumb, navView, selectedTemplateId, liveValues, liveComponents,
    selectedPaletteId, promptDrawerOpen, promptRailVisible, compiled, previewJob, editingComponentId
  ]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
};

/**
 * Access app workspace state.
 */
const useApp = () => {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
};

export { AppProvider, useApp };
export type { Slot };
