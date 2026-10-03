import { useEffect, useState, type DragEvent, type ReactNode } from "react";
import { ChevronDown, Download } from "lucide-react";
import { useTheme } from "next-themes";
import GlareHover from "@/components/GlareHover";
import { Button } from "@/components/ui/button";
import RefineFrame, { type RefineFrameStatus } from "@/components/RefineFrame";
import { compilePrompt, defaultParamValue } from "@lib/compiler";
import { PageHeader } from "@/components/PageHeader";
import { ParamControl } from "@/components/ParamControl";
import { ColorControl } from "@/components/ColorControl";
import { ImageControl } from "@/components/ImageControl";
import { ComponentPalette } from "@/components/ComponentPalette";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/components/Toast";
import { tryJson } from "@/db/api";
import { SLOT_LABEL, padIndex } from "@/util/format";
import { cn } from "@/util/cn";
import {
  inferParamFunction, isBackgroundImageParam, paramForControl, pickStatus
} from "@/util/params";
import { downloadPng, nextPreviewTip } from "@/util/preview";
import { readEventStream } from "@/util/stream";
import { emptyStudioSession } from "@/util/studio";
import type { Slot, StackItem, Template } from "@/types/app";

type Props = {
  template: Template;
  onEdit: () => void;
  onWorkspace: () => void;
  onFresh: () => void;
};

/**
 * Design studio: compact params, preview, and right-side library.
 *
 * @param props.template - Open template
 * @param props.onEdit - Opens the template editor
 * @param props.onWorkspace - Returns to the Themes workspace
 * @param props.onFresh - Clears uploads, stack, and preview for this template
 */
const Studio = ({ template: t, onEdit, onWorkspace, onFresh }: Props) => {
  const app = useApp();
  const toast = useToast();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const [overSlot, setOverSlot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refineStatus, setRefineStatus] = useState<RefineFrameStatus | null>(null);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState<"fit" | "50" | "100" | "150">("fit");
  const [tip, setTip] = useState(() => nextPreviewTip());

  const params = t.params || [];
  const subjectParams = params.filter((p) => p.type === "image" && !isBackgroundImageParam(p));
  const backgroundParams = params.filter(isBackgroundImageParam);
  const accentParams = params.filter((p) => p.type === "color");
  const styleParams = params.filter((p) => p.type !== "image" && p.type !== "color");
  const lib = app.registry.components || {};
  const rail = [
    "subject",
    ...(backgroundParams.length ? ["background"] : []),
    "accent",
    "style",
    "stack"
  ];
  /**
   * Number for a studio rail block, skipping unused sections.
   *
   * @param id - Block id
   * @returns 1-based index
   */
  const blockNum = (id: string) => rail.indexOf(id) + 1;

  const refresh = (values = app.liveValues, stack = app.liveComponents) => {
    try {
      const compiled = compilePrompt(t, values, {
        components: [...stack].sort((a, b) => (a.slot === "subject" ? 0 : a.slot === "background" ? 2 : 1) - (b.slot === "subject" ? 0 : b.slot === "background" ? 2 : 1)).map(({ id, values: v }) => ({ id, values: v })),
        library: lib
      });
      app.setCompiled(compiled);
    } catch (e: any) {
      app.setCompiled({ error: e.message });
    }
  };

  useEffect(() => {
    refresh();
  }, [t.id]);

  const setValue = (id: string, v: any) => {
    const next = { ...app.liveValues, [id]: v };
    app.setLiveValues(next);
    refresh(next);
  };

  /**
   * Stacks a library component onto a slot.
   *
   * @param id - Component id
   * @param slot - Target slot
   * @param silent - Skip toasts when true
   */
  const addComponent = (id: string, slot: Slot = "canvas", silent = false) => {
    const c = lib[id];
    if (!c) return { ok: false as const };
    const status = pickStatus(t, c, app.liveComponents, lib);
    if (status.kind === "blocked") {
      if (!silent) toast(status.reason, "error");
      return { ok: false as const, reason: status.reason };
    }
    if (status.kind === "added") {
      const where = SLOT_LABEL[status.slot] || status.slot || "the design";
      if (!silent) toast(`Already on ${where}.`);
      return { ok: false as const, reason: "already" };
    }
    const values: Record<string, any> = {};
    for (const p of c.params || []) values[p.id] = defaultParamValue(paramForControl(p));
    const item: StackItem = { id, values, slot };
    let next = [...app.liveComponents];
    if (status.kind === "swap") {
      const i = next.indexOf(status.replaces as StackItem);
      next.splice(i, 1, item);
      if (!silent) toast(`${c.name} replaced ${lib[(status.replaces as StackItem).id].name}.`);
    } else {
      next.push(item);
      if (!silent) toast(`Added ${c.name}.`);
    }
    app.setLiveComponents(next);
    if (!silent) refresh(app.liveValues, next);
    return { ok: true as const, name: c.name };
  };

  /**
   * Removes every stacked instance of a component.
   *
   * @param id - Component id
   */
  const removeById = (id: string) => {
    const next = app.liveComponents.filter((s) => s.id !== id);
    app.setLiveComponents(next);
    refresh(app.liveValues, next);
  };

  /**
   * Drops a palette component onto a slot.
   *
   * @param slot - Target slot
   * @param e - Drag event
   */
  const dropOn = (slot: Slot, e: DragEvent) => {
    e.preventDefault();
    setOverSlot(null);
    const id = e.dataTransfer.getData("text/plain") || app.selectedPaletteId;
    if (!id || !lib[id]) return;
    addComponent(id, slot);
  };

  const generate = async () => {
    if (app.compiled?.missingImages?.length) {
      toast(`Upload ${app.compiled.missingImages.join(" and ")} first.`, "error");
      return;
    }
    setBusy(true);
    if (app.mode === "server") {
      setRefineStatus("queued");
      setFrameUrl(null);
    }
    try {
      let job: any;
      if (app.mode === "server") {
        const r = await fetch("api/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ templateId: t.id, values: app.liveValues, components: app.componentsForCompile() })
        });
        const type = r.headers.get("content-type") || "";
        if (!type.includes("text/event-stream")) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || "Generation failed.");
        }
        await readEventStream(r, ({ event, data }) => {
          if (event === "partial" && data?.url) {
            setFrameUrl(data.url);
            setRefineStatus(data.index > 0 ? "refining" : "generating");
          } else if (event === "done") {
            job = data;
          } else if (event === "error") {
            throw new Error(data?.error || "Generation failed.");
          }
        });
        if (!job || job.status === "failed") throw new Error(job?.error || "Generation failed.");
        setRefineStatus(null);
        setFrameUrl(null);
      } else {
        await new Promise((r) => setTimeout(r, 900));
        job = {
          id: "demo_" + Date.now(), status: "done", templateId: t.id, templateName: t.name,
          prompt: app.compiled?.prompt || "", warnings: app.compiled?.warnings || [],
          result: { imageUrl: null, cached: false }
        };
      }
      app.setPreviewJob(job);
      if (app.mode === "server") {
        const j = await tryJson("api/jobs?limit=50");
        if (j) app.setRegistry((r) => ({ ...r, _jobs: j }));
      } else {
        app.setRegistry((r) => ({ ...r, _jobs: [{ ...job, createdAt: new Date().toISOString(), size: t.apiSize }, ...(r._jobs || [])] }));
      }
    } catch (e: any) {
      app.setPreviewJob(null);
      setRefineStatus("error");
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  /**
   * Updates one stacked component param.
   *
   * @param sel - Stack item
   * @param pid - Param id
   * @param v - New value
   */
  const setStackParam = (sel: StackItem, pid: string, v: any) => {
    const next = app.liveComponents.map((s) => s === sel ? { ...s, values: { ...s.values, [pid]: v } } : s);
    app.setLiveComponents(next);
    refresh(app.liveValues, next);
  };

  /**
   * Clears this template's uploads, stack, and preview.
   */
  const startFresh = () => {
    const next = emptyStudioSession(t);
    onFresh();
    setRefineStatus(null);
    setFrameUrl(null);
    refresh(next.values, next.components);
    toast("Started a fresh workspace.");
  };

  const job = app.previewJob;
  const imgUrl = job?.result?.imageUrl;
  const stack = app.liveComponents;
  const generating = busy || (!!job && job.status !== "done" && job.status !== "failed");
  const showingStart = !generating && !imgUrl && job?.status !== "failed";
  const showFrame = Boolean(refineStatus);
  const statusNote = refineStatus === "queued"
    ? "Queued"
    : refineStatus === "refining"
      ? "Refining"
      : refineStatus === "error"
        ? "Generation failed"
        : generating
          ? "Generating…"
          : job?.status === "failed"
            ? "Generation failed"
            : imgUrl
              ? "Generated"
              : "Not generated yet";
  const previewW = 1024;
  const previewH = 1024;

  /**
   * Saves the finished preview as a PNG file.
   */
  const downloadPreview = async () => {
    if (!imgUrl) return;
    try {
      await downloadPng(imgUrl, "palette-output");
    } catch (error: any) {
      toast(error.message || "Could not download the image.", "error");
    }
  };
  const zoomScale = zoom === "50" ? 0.5 : zoom === "150" ? 1.5 : 1;

  useEffect(() => {
    if (!showingStart) return;
    const id = window.setInterval(() => setTip((current) => nextPreviewTip(current)), 8000);
    return () => window.clearInterval(id);
  }, [showingStart]);

  return (
    <div className="studio-page" id="studioLayout">
      <PageHeader
        title={t.name}
        actions={
          <>
            <StudioAction onClick={onWorkspace}>Back to workspace</StudioAction>
            <StudioAction onClick={() => app.setPromptDrawerOpen(!app.promptDrawerOpen)}>{"{ } Prompt"}</StudioAction>
            <StudioAction onClick={startFresh}>Start Fresh</StudioAction>
            <StudioAction onClick={onEdit}>Edit template</StudioAction>
          </>
        }
      />
      <div className="studio-layout">
        <ResizablePanelGroup orientation="horizontal" className="studio-split">
          <ResizablePanel defaultSize="26" minSize="18" maxSize="38" className="min-h-0">
            <div className="studio-rail">
              <div className="studio-rail-scroll">
              <ParamBlock n={blockNum("subject")} title="Subject">
                {subjectParams.length
                  ? (
                    <div className="studio-drops">
                      {subjectParams.map((p) => (
                        <ImageControl
                          key={p.id}
                          param={p}
                          compact
                          emptyTitle="Drop image"
                          emptyHint="or browse files"
                          value={app.liveValues[p.id]}
                          onChange={(v) => setValue(p.id, v)}
                        />
                      ))}
                    </div>
                  )
                  : <p className="studio-sec-hint">No subject image on this template.</p>}
              </ParamBlock>
              {backgroundParams.length ? (
                <ParamBlock n={blockNum("background")} title="Background">
                  <div className="studio-drops">
                    {backgroundParams.map((p) => (
                      <ImageControl
                        key={p.id}
                        param={p}
                        compact
                        emptyTitle="+ Add image"
                        emptyHint=""
                        value={app.liveValues[p.id]}
                        onChange={(v) => setValue(p.id, v)}
                      />
                    ))}
                  </div>
                </ParamBlock>
              ) : null}
              <ParamBlock n={blockNum("accent")} title="Accent">
                {accentParams.length
                  ? accentParams.map((p) => (
                    <ColorControl key={p.id} param={p} compact value={app.liveValues[p.id]} onChange={(v) => setValue(p.id, v)} />
                  ))
                  : <p className="studio-sec-hint">No colour settings on this template.</p>}
              </ParamBlock>
              <ParamBlock n={blockNum("style")} title="Style" extra={<span className="ai-mark">AI</span>}>
                {styleParams.length
                  ? styleParams.map((p) => (
                    <div key={p.id} className="studio-style">
                      <ParamControl param={p} value={app.liveValues[p.id]} onChange={(v) => setValue(p.id, v)} />
                    </div>
                  ))
                  : <p className="studio-sec-hint">No style settings on this template.</p>}
              </ParamBlock>
              <ParamBlock
                n={blockNum("stack")}
                title="Stack"
                extra={stack.length ? <span className="stack-count">{stack.length} added</span> : null}
              >
                <div
                  className={cn("stack-drop", overSlot === "canvas" && "over")}
                  onDragOver={(e) => { if ([...e.dataTransfer.types].includes("text/plain")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOverSlot("canvas"); } }}
                  onDragLeave={() => setOverSlot(null)}
                  onDrop={(e) => dropOn("canvas", e)}
                >
                  {stack.length ? (
                    <div className="stack-chips">
                      {stack.map((sel, i) => {
                        const c = lib[sel.id];
                        if (!c) return null;
                        return (
                          <span key={`${sel.id}-${i}`} className="stack-chip">
                            {c.name}
                            <button type="button" aria-label={`Remove ${c.name}`} onClick={() => {
                              const next = app.liveComponents.filter((s) => s !== sel);
                              app.setLiveComponents(next);
                              refresh(app.liveValues, next);
                            }}>×</button>
                          </span>
                        );
                      })}
                    </div>
                  ) : <p className="studio-sec-hint">Add from the library, or drop here.</p>}
                </div>
                {stack.map((sel, i) => {
                  const c = lib[sel.id];
                  if (!c || !(c.params || []).length) return null;
                  const problem = app.compiled?.componentProblems?.find((pr: any) => pr.id === c.id);
                  return (
                    <div key={`${sel.id}-params-${i}`} className="stack-params">
                      <span className="ctl-label">{c.name}</span>
                      {problem ? <div className="notice error full" style={{ margin: 0 }}>{problem.reason}</div> : null}
                      {(c.params || []).map((p: any) => {
                        const controlParam = paramForControl(p, inferParamFunction(p));
                        return (
                          <div key={p.id}>
                            <span className="ctl-label">{p.label}</span>
                            <ParamControl param={controlParam} value={sel.values[p.id]} onChange={(v) => setStackParam(sel, p.id, v)} />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </ParamBlock>
              </div>
              <button className={cn("btn primary gen-btn", dark && "gen-btn-dark")} type="button" disabled={busy} onClick={generate}>
                {busy ? "Generating…" : "Generate design"} <span aria-hidden>→</span>
              </button>
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="50" minSize="32" className="min-h-0">
            <div
              className={cn("studio-preview", overSlot === "preview" && "over")}
              onDragOver={(e) => { if ([...e.dataTransfer.types].includes("text/plain")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOverSlot("preview"); } }}
              onDragLeave={() => setOverSlot(null)}
              onDrop={(e) => dropOn("canvas", e)}
            >
              <div className="preview-bar">
                <div className="preview-bar-side">
                  <span className="preview-bar-title">Preview</span>
                  <span className="preview-bar-div" aria-hidden />
                  <span className="preview-bar-note">{statusNote}</span>
                </div>
                <div className="preview-bar-side">
                  <label className="preview-zoom">
                    <select aria-label="Preview zoom" value={zoom} onChange={(event) => setZoom(event.target.value as typeof zoom)}>
                      <option value="fit">Fit</option>
                      <option value="50">50%</option>
                      <option value="100">100%</option>
                      <option value="150">150%</option>
                    </select>
                    <ChevronDown aria-hidden />
                  </label>
                  <span className="preview-bar-div" aria-hidden />
                  <span className="preview-bar-zoom">{zoom === "fit" ? "100%" : `${zoom}%`}</span>
                </div>
              </div>
              <div className="preview-stage">
                <div
                  className="preview-canvas"
                  style={{ ["--preview-w" as string]: previewW, ["--preview-h" as string]: previewH, ["--zoom-scale" as string]: zoomScale }}
                >
                  {showFrame ? (
                    <RefineFrame
                      status={refineStatus || "queued"}
                      aspectRatio={`${previewW} / ${previewH}`}
                      width={previewW}
                      radius={0}
                      background={dark ? "#000000" : "#ffffff"}
                      color={dark ? "#f5f5f5" : "#111827"}
                      onRetry={refineStatus === "error" ? generate : undefined}
                      className="preview-refine"
                    >
                      {frameUrl ? <img src={frameUrl} alt="" /> : null}
                    </RefineFrame>
                  ) : imgUrl ? (
                    <img src={imgUrl} alt="Generated image" />
                  ) : job?.status === "failed" ? (
                    <div className="preview-start">
                      <p className="preview-start-title">Generation failed</p>
                      <p className="preview-tip">{job.error || "Try generating again."}</p>
                    </div>
                  ) : (
                    <div className="preview-start">
                      <p className="preview-start-title">Your design starts here</p>
                      <p className="preview-tip">{app.mode === "demo" && job?.status === "done" && !imgUrl ? "Demo mode: in a live environment the generated image would appear here." : <><span className="preview-tip-label">Tips:</span> {tip}</>}</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="preview-foot">
                <span className="preview-dim">
                  <FrameMark />
                  {previewW} × {previewH} px
                </span>
                <button className="preview-download" type="button" disabled={!imgUrl} onClick={downloadPreview}>
                  <Download size={14} aria-hidden />
                  Download PNG
                </button>
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="24" minSize="16" maxSize="34" className="min-h-0">
            <ComponentPalette
              template={t}
              onAdd={(id) => addComponent(id, "canvas")}
              onRemove={removeById}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

type ActionProps = {
  onClick: () => void;
  children: ReactNode;
};

/**
 * Studio header button with a glare highlight.
 *
 * @param props.onClick - Action for the button
 * @param props.children - Button label
 */
const StudioAction = ({ onClick, children }: ActionProps) => (
  <GlareHover
    width="auto"
    height="auto"
    background="transparent"
    borderRadius="7px"
    borderColor="transparent"
    glareColor="#ffffff"
    glareOpacity={0.85}
    glareAngle={-28}
    glareSize={240}
    transitionDuration={550}
    className="studio-glare"
  >
    <Button variant="ghost" className="studio-action" type="button" onClick={onClick}>{children}</Button>
  </GlareHover>
);

/**
 * Small crop mark used beside the preview dimensions.
 */
const FrameMark = () => (
  <svg className="preview-frame-ic" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3 6V3h3M10 3h3v3M13 10v3h-3M6 13H3v-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

type BlockProps = {
  n: number;
  title: string;
  extra?: ReactNode;
  children: React.ReactNode;
};

/**
 * Numbered compact param block in the studio rail.
 *
 * @param props.n - 1-based index
 * @param props.title - Block label
 * @param props.extra - Optional trailing mark
 * @param props.children - Controls
 */
const ParamBlock = ({ n, title, extra, children }: BlockProps) => (
  <section className="studio-block">
    <div className="studio-block-head">
      <span className="studio-block-num">{padIndex(n)}</span>
      <h2>{title}</h2>
      {extra}
    </div>
    {children}
  </section>
);

export { Studio };
