import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { cn } from "@/util/cn";

/**
 * Right-hand live prompt preview drawer.
 */
const PromptRail = () => {
  const app = useApp();
  const compiled = app.compiled;
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  if (!app.promptRailVisible) return null;

  const toggle = (key: string) => {
    const next = new Set(openKeys);
    if (next.has(key)) next.delete(key); else next.add(key);
    setOpenKeys(next);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(compiled?.prompt || "");
    } catch { /* ignore */ }
  };

  return (
    <>
      <div className={cn("rail-backdrop", app.promptDrawerOpen && "open")} onClick={() => app.setPromptDrawerOpen(false)} />
      <aside className={cn("right-rail", app.promptDrawerOpen && "open")} aria-hidden={!app.promptDrawerOpen}>
        <div className="rail-head">
          <h2>Live prompt preview</h2>
          <span className="btn-row">
            {compiled?.prompt ? <span className="badge grey">{compiled.prompt.length} chars</span> : null}
            <button type="button" className="icon-btn" aria-label="Close live prompt preview" onClick={() => app.setPromptDrawerOpen(false)}>✕</button>
          </span>
        </div>
        <div className="rail-scroll">
          {compiled?.error ? <div className="notice error">{compiled.error}</div> : null}
          {!compiled || compiled.error ? (
            <p style={{ color: "var(--faint)", fontSize: 13 }}>Select a template to see its prompt build up as you fill in the parameters.</p>
          ) : (
            <PromptBody compiled={compiled} liveValues={app.liveValues} openKeys={openKeys} toggle={toggle} copy={copy} />
          )}
        </div>
      </aside>
    </>
  );
};

const PromptBody = ({ compiled, liveValues, openKeys, toggle, copy }: any) => {
  const allFilled = (compiled.parts || []).every((p: any) => p.type !== "image" || p.hasFile);
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span className={`badge ${allFilled ? "green" : "yellow"}`}>{allFilled ? "Ready to generate" : "Missing inputs"}</span>
        <span className="badge grey">{(compiled.parts || []).length} params</span>
        <span className={`badge ${compiled.components?.length ? "orange" : "grey"}`}>{compiled.components?.length || 0} components</span>
      </div>
      {(compiled.parts || []).map((part: any) => (
        <div key={part.paramId} className="segment">
          {part.type === "image" ? (
            <>
              <div className="seg-head image">🖼 {part.index ? `Image ${part.index}: ` : ""}{part.label}<span className="pill">{part.hasFile ? "✓ Attached" : "⚠ No file"}</span></div>
              <div className="seg-body" style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12, color: "var(--muted)" }}>
                {part.hasFile && liveValues[part.paramId] ? <img src={liveValues[part.paramId]} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)", flex: "none" }} /> : null}
                <div><div style={{ color: "var(--ink)" }}>{part.resolvedPhrase}</div></div>
              </div>
            </>
          ) : (
            <>
              <div className={`seg-head ${part.rawValue != null && part.rawValue !== "" ? "resolved" : "placeholder"}`}>
                {part.label}<span className="pill">{part.rawValue != null && part.rawValue !== "" ? "✓ Set" : "⚠ Default"}</span>
              </div>
              <div className="seg-body">{part.resolvedPhrase}</div>
            </>
          )}
        </div>
      ))}
      {compiled.warnings?.length ? (
        <div className="notice warn"><b>Warnings:</b><ul className="errs">{compiled.warnings.map((w: string) => <li key={w}>{w}</li>)}</ul></div>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
        <b style={{ fontSize: 13 }}>Master prompt, by section</b>
        <button className="btn small ghost" type="button" onClick={copy}>Copy full prompt</button>
      </div>
      {(compiled.sections || []).map((sec: any) => {
        const items = Array.isArray(sec.items) && sec.items.length
          ? sec.items
          : sec.text ? [{ name: "Template", text: sec.text }] : [];
        return (
          <div key={sec.kind} className="segment">
            <div className={`seg-head sec-${sec.kind}`}>{sec.title}{items.length ? <span className="pill">{items.length} {items.length === 1 ? "item" : "items"}</span> : null}</div>
            <div className="seg-items">
              {items.map((it: any, i: number) => {
                const key = `${sec.kind}:${it.id || it.name || i}`;
                const open = openKeys.has(key);
                return (
                  <div key={key} className={cn("prompt-item", open && "open")}>
                    <button type="button" className="prompt-item-head" aria-expanded={String(open)} onClick={() => toggle(key)}>
                      <span>{it.name}</span>
                      <span className="prompt-chevron" aria-hidden>▾</span>
                    </button>
                    <div className="prompt-item-body">{it.text || ""}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
};

export { PromptRail };
