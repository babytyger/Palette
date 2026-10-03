import { useCallback, useEffect, useRef, useState } from "react";
import { ThemeProvider } from "next-themes";
import { ThemeLockDialog } from "@/components/ThemeLockDialog";
import { TopNav } from "@/components/TopNav";
import { ToastProvider, useToast } from "@/components/Toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider, useApp } from "@/context/AppContext";
import { loadRegistry } from "@/db/api";
import { deleteStudioSession, readStudioSessions, writeStudioSession } from "@/db/sessions";
import { cn } from "@/util/cn";
import { publicTemplates } from "@/util/params";
import { emptyStudioSession } from "@/util/studio";
import { themeCodeMatches } from "@/util/themeLock";
import { readLocation, resolveLocation, writeLocation } from "@/util/location";
import { ComponentEditor } from "@/views/ComponentEditor";
import { ComponentsLib } from "@/views/ComponentsLib";
import { EditThemes } from "@/views/EditThemes";
import { Jobs } from "@/views/Jobs";
import { PromptRail } from "@/views/PromptRail";
import { Studio } from "@/views/Studio";
import { TemplateEditor } from "@/views/TemplateEditor";
import { Themes } from "@/views/Themes";
import type { ComponentDef, StudioSession, Template, WorkspaceNav } from "@/types/app";

/**
 * App chrome: sidebar, palette, top bar, and the active workspace view.
 */
const Shell = () => {
  const app = useApp();
  const toast = useToast();
  const studioTemplate = app.selectedTemplateId ? app.registry.templates[app.selectedTemplateId] : null;
  const sessionsRef = useRef<Record<string, StudioSession>>({});
  const sessionsReady = useRef(false);
  const appliedId = useRef<string | null>(null);
  const saveTimer = useRef(0);
  const saveGen = useRef<Record<string, number>>({});
  const templateIdRef = useRef<string | null>(null);
  const booted = useRef(false);
  const viewRef = useRef(app.view);
  const bootView = useRef(app.view);
  const editorReturn = useRef<"themes" | "studio">("themes");
  const lockIntent = useRef<"list" | string>("list");
  const [themesUnlocked, setThemesUnlocked] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  viewRef.current = app.view;
  templateIdRef.current = app.selectedTemplateId;

  useEffect(() => {
    const boot = async () => {
      const [server, sessions] = await Promise.all([loadRegistry(), readStudioSessions()]);
      const registry = server || { templates: {}, components: {} };
      sessionsRef.current = sessions;
      sessionsReady.current = true;
      if (server) {
        app.setRegistry(server);
        app.setMode("server");
      }
      booted.current = true;
      if (viewRef.current !== bootView.current) return;
      const next = resolveLocation(readLocation(), registry);
      if (next.view.startsWith("template:") && next.selectedTemplateId) {
        const t = registry.templates[next.selectedTemplateId];
        if (t) applySession(sessionsRef.current[next.selectedTemplateId] || emptyStudioSession(t), next.selectedTemplateId);
      }
      app.setView(next.view);
      app.setCrumb(next.crumb);
      app.setNavView(next.navView);
      app.setSelectedTemplateId(next.selectedTemplateId);
      app.setPromptRailVisible(next.promptRailVisible);
      app.setPromptDrawerOpen(false);
    };
    boot();
  }, []);

  useEffect(() => {
    const flush = () => {
      if (!sessionsReady.current) return;
      window.clearTimeout(saveTimer.current);
      const id = templateIdRef.current;
      if (!id || appliedId.current !== id) return;
      const session = sessionsRef.current[id];
      if (session) void writeStudioSession(id, session);
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  useEffect(() => {
    if (!booted.current) return;
    writeLocation({
      view: app.view,
      navView: app.navView,
      crumb: app.crumb,
      selectedTemplateId: app.selectedTemplateId,
      promptRailVisible: app.promptRailVisible
    });
  }, [app.view, app.navView, app.crumb, app.selectedTemplateId, app.promptRailVisible]);

  /**
   * Snapshot of the live studio workspace.
   *
   * @returns Current session
   */
  const snapshotSession = (): StudioSession => ({
    values: app.liveValues,
    components: app.liveComponents,
    previewJob: app.previewJob,
    selectedPaletteId: app.selectedPaletteId
  });

  /**
   * Applies a stored studio session to live state.
   *
   * @param session - Session to restore
   * @param id - Template the session belongs to
   */
  const applySession = (session: StudioSession, id?: string) => {
    if (id) appliedId.current = id;
    app.setLiveValues(session.values);
    app.setLiveComponents(session.components);
    app.setPreviewJob(session.previewJob);
    app.setSelectedPaletteId(session.selectedPaletteId);
  };

  /**
   * Keeps a template workspace in memory and writes it after a short pause.
   *
   * @param id - Template id
   * @param session - Workspace to keep across refresh
   */
  const rememberSession = (id: string, session: StudioSession) => {
    sessionsRef.current[id] = session;
    const gen = (saveGen.current[id] || 0) + 1;
    saveGen.current[id] = gen;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      if (saveGen.current[id] !== gen) return;
      const latest = sessionsRef.current[id];
      if (latest) void writeStudioSession(id, latest);
    }, 200);
  };

  /**
   * Shows Design studio for a template without changing its stored work.
   *
   * @param id - Template id
   */
  const showStudio = (id: string) => {
    app.setSelectedTemplateId(id);
    app.setView(`template:${id}`);
    app.setCrumb("Design studio");
    app.setNavView("studio");
    app.setPromptRailVisible(true);
  };

  /**
   * Opens a template in Design studio, restoring that template's history.
   *
   * @param id - Template id
   * @param registry - Optional registry snapshot from boot
   */
  const openTemplate = (id: string, registry = app.registry) => {
    const t = registry.templates[id];
    if (!t) return;
    const currentId = app.selectedTemplateId;
    if (currentId && currentId !== id && appliedId.current === currentId) {
      const snap = snapshotSession();
      sessionsRef.current[currentId] = snap;
      void writeStudioSession(currentId, snap);
    }
    if (currentId === id) {
      showStudio(id);
      return;
    }
    applySession(sessionsRef.current[id] || emptyStudioSession(t), id);
    showStudio(id);
  };

  /**
   * Clears the current template workspace back to defaults.
   */
  const startFresh = () => {
    const t = studioTemplate;
    if (!t) return;
    const next = emptyStudioSession(t);
    window.clearTimeout(saveTimer.current);
    const gen = (saveGen.current[t.id] || 0) + 1;
    saveGen.current[t.id] = gen;
    sessionsRef.current[t.id] = next;
    void deleteStudioSession(t.id).then(() => {
      if (saveGen.current[t.id] !== gen) return;
      void writeStudioSession(t.id, next);
    });
    applySession(next, t.id);
  };

  useEffect(() => {
    if (!sessionsReady.current) return;
    const id = app.selectedTemplateId;
    if (!id || app.view !== `template:${id}`) return;
    rememberSession(id, snapshotSession());
  }, [app.liveValues, app.liveComponents, app.previewJob, app.selectedPaletteId, app.selectedTemplateId, app.view]);

  /**
   * Returns to Design studio for the current or first template.
   */
  const goStudio = () => {
    const selected = app.selectedTemplateId ? app.registry.templates[app.selectedTemplateId] : null;
    const id = selected && !selected.archived
      ? selected.id
      : publicTemplates(app.registry)[0]?.id;
    if (!id) {
      app.setView("studio");
      app.setCrumb("Design studio");
      app.setNavView("studio");
      app.setPromptRailVisible(false);
      return;
    }
    openTemplate(id);
  };

  /**
   * Opens the theme editor list. The visit stays unlocked until refresh.
   */
  const showEditThemes = () => {
    app.setView("editThemes");
    app.setNavView("templates");
    app.setCrumb("Edit themes");
    app.setPromptRailVisible(false);
    app.setPromptDrawerOpen(false);
  };

  /**
   * Opens the template editor and remembers where save should return.
   *
   * @param id - Theme to edit, or null for a new theme
   * @param back - Page to open after save or delete
   */
  const openEditor = (id: string | null, back: "themes" | "studio") => {
    editorReturn.current = back;
    if (id) {
      app.setView(`edit:${id}`);
      app.setCrumb("Edit template");
      app.setSelectedTemplateId(id);
    } else {
      app.setView("newTemplate");
      app.setCrumb("New template");
    }
    app.setNavView(back === "studio" ? "studio" : "templates");
    app.setPromptRailVisible(false);
    app.setPromptDrawerOpen(false);
  };

  /**
   * Runs a theme edit action, asking for the code once per visit.
   *
   * @param intent - "list" for Edit themes, or a theme id for the studio editor
   * @param run - Action to take when this visit is already unlocked
   */
  const askOr = (intent: "list" | string, run: () => void) => {
    if (themesUnlocked) {
      run();
      return;
    }
    lockIntent.current = intent;
    setLockOpen(true);
  };

  /**
   * Checks the code and opens the edit destination for this visit.
   *
   * @param code - Code typed into the lock
   */
  const submitCode = (code: string) => {
    if (!themeCodeMatches(code)) {
      toast("That code is not right.", "error");
      return;
    }
    setThemesUnlocked(true);
    setLockOpen(false);
    if (lockIntent.current === "list") showEditThemes();
    else openEditor(lockIntent.current, "studio");
  };

  /**
   * Closes the code dialog without unlocking.
   */
  const closeLock = useCallback(() => setLockOpen(false), []);

  /**
   * Opens a workspace page from the top nav.
   *
   * @param view - Workspace destination
   */
  const go = (view: WorkspaceNav) => {
    if (view === "studio") { goStudio(); return; }
    app.setView(view);
    app.setPromptRailVisible(false);
    app.setPromptDrawerOpen(false);
    app.setNavView(view);
    app.setCrumb(view === "templates" ? "Themes" : view === "components" ? "Components" : view === "jobs" ? "Recent designs" : "New template");
  };

  return (
    <div className="shell">
      <div className="shell-body">
        <TopNav
          active={app.navView}
          onNavigate={go}
          connected={app.mode === "server"}
        />
        <ShellMain
          studioTemplate={studioTemplate}
          go={go}
          goStudio={goStudio}
          openTemplate={openTemplate}
          onFresh={startFresh}
          openEditor={openEditor}
          onEditThemes={() => askOr("list", showEditThemes)}
          onEditStudio={() => {
            if (!studioTemplate) return;
            askOr(studioTemplate.id, () => openEditor(studioTemplate.id, "studio"));
          }}
          onEditorSaved={(saved) => {
            if (editorReturn.current === "studio") openTemplate(saved.id);
            else showEditThemes();
          }}
          onEditorDeleted={() => {
            if (editorReturn.current === "studio") go("templates");
            else showEditThemes();
          }}
        />
      </div>
      <PromptRail />
      {lockOpen ? <ThemeLockDialog onCancel={closeLock} onSubmit={submitCode} /> : null}
    </div>
  );
};

type MainProps = {
  studioTemplate: Template | null;
  go: (view: WorkspaceNav) => void;
  goStudio: () => void;
  openTemplate: (id: string) => void;
  onFresh: () => void;
  openEditor: (id: string | null, back: "themes" | "studio") => void;
  onEditThemes: () => void;
  onEditStudio: () => void;
  onEditorSaved: (saved: Template) => void;
  onEditorDeleted: () => void;
};

/**
 * Top bar and the active workspace page.
 *
 * @param props.studioTemplate - Template open in Design studio
 * @param props.go - Workspace navigation
 * @param props.goStudio - Opens Design studio
 * @param props.openTemplate - Loads a template into the studio
 * @param props.onFresh - Clears the current template workspace
 * @param props.openEditor - Opens the template editor
 * @param props.onEditThemes - Asks for the code, then opens the edit list
 * @param props.onEditStudio - Asks for the code, then opens the studio theme editor
 * @param props.onEditorSaved - Returns after a theme is saved
 * @param props.onEditorDeleted - Returns after a theme is deleted
 */
const ShellMain = ({
  studioTemplate, go, goStudio, openTemplate, onFresh, openEditor, onEditThemes, onEditStudio, onEditorSaved, onEditorDeleted
}: MainProps) => {
  const app = useApp();
  const editing = app.view.startsWith("editComponent:")
    ? app.registry.components[app.view.slice("editComponent:".length)]
    : app.view === "newComponent" ? null : undefined;
  const editingTpl = app.view.startsWith("edit:")
    ? app.registry.templates[app.view.slice("edit:".length)]
    : app.view === "newTemplate" ? null : undefined;

  return (
    <div className="main min-h-0">
      <div className={cn("main-scroll", app.view.startsWith("template:") && "studio-scroll")}>
        {app.view.startsWith("template:") && studioTemplate ? (
          <Studio
            template={studioTemplate}
            onEdit={onEditStudio}
            onWorkspace={() => go("templates")}
            onFresh={onFresh}
          />
        ) : app.view === "studio" && !studioTemplate ? (
          <>
            <div className="page-header">
              <div>
                <h1>Design studio</h1>
                <p className="page-sub">Create a template to start generating.</p>
              </div>
            </div>
            <p className="empty-copy">No themes yet. Use Edit themes on the Themes page to add one.</p>
          </>
        ) : app.view === "templates" ? (
          <Themes onOpen={openTemplate} onEditThemes={onEditThemes} onJobs={() => go("jobs")} />
        ) : app.view === "editThemes" ? (
          <EditThemes onBack={() => go("templates")} onAdd={() => openEditor(null, "themes")} onEdit={(id) => openEditor(id, "themes")} />
        ) : app.view === "jobs" ? (
          <Jobs />
        ) : app.view === "components" ? (
          <ComponentsLib
            onEdit={(c: ComponentDef | null) => {
              app.setView(c ? `editComponent:${c.id}` : "newComponent");
              app.setCrumb(c ? "Edit component" : "New component");
              app.setNavView("components");
            }}
          />
        ) : app.view === "newTemplate" || editingTpl !== undefined ? (
          <TemplateEditor
            template={editingTpl ?? null}
            onStudio={goStudio}
            onSaved={onEditorSaved}
            onDeleted={onEditorDeleted}
          />
        ) : editing !== undefined ? (
          <ComponentEditor component={editing} onBack={() => go("components")} />
        ) : null}
      </div>
    </div>
  );
};

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <ToastProvider>
      <TooltipProvider>
        <AppProvider>
          <Shell />
        </AppProvider>
      </TooltipProvider>
    </ToastProvider>
  </ThemeProvider>
);

export { App };
