import { useState } from "react";
import { compileComponent, defaultParamValue, paramsFromConfig, validateComponent } from "@lib/compiler";
import { PageHeader } from "@/components/PageHeader";
import { ParamControl } from "@/components/ParamControl";
import { AppSelect } from "@/components/AppSelect";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/components/Toast";
import { storeComponent, deleteComponent } from "@/db/api";
import {
  ensureConfigForPrompt, inferParamFunction, paletteGroups, paramForControl, promptPlaceholders, starterComponent
} from "@/util/params";
import { scopeLabel } from "@/util/format";
import type { ComponentDef } from "@/types/app";

type Props = {
  component: ComponentDef | null;
  onBack: () => void;
};

/**
 * Component JSON editor with group, parameters, and Try it panel.
 */
const ComponentEditor = ({ component: comp, onBack }: Props) => {
  const { mode, registry, setRegistry } = useApp();
  const toast = useToast();
  const isNew = !comp;
  const [json, setJson] = useState(() => {
    const start = isNew ? starterComponent() : JSON.parse(JSON.stringify(comp));
    delete start.updatedAt;
    delete start.params;
    delete start.prompt;
    return JSON.stringify(start, null, 2);
  });
  const [tryValues, setTryValues] = useState<Record<string, any>>({});
  const [addingGroup, setAddingGroup] = useState(false);
  const [armed, setArmed] = useState(false);
  const [newGroup, setNewGroup] = useState("");

  /**
   * Parses the JSON editor contents.
   *
   * @returns Component definition or null
   */
  const parseDef = (): ComponentDef | null => {
    try { return JSON.parse(json); } catch { return null; }
  };

  /**
   * Writes a definition back to the JSON editor.
   *
   * @param nextDef - Component definition
   * @param nextTry - Try-it values to persist
   */
  /**
   * Writes a definition back to the JSON editor, keeping config as the control list.
   *
   * @param nextDef - Component definition
   */
  const writeDef = (nextDef: ComponentDef) => {
    const stored: ComponentDef = { ...nextDef, config: { ...(nextDef.config || {}) } };
    delete stored.params;
    delete stored.prompt;
    delete stored.updatedAt;
    setJson(JSON.stringify(stored, null, 2));
  };

  const def = parseDef();
  const jsonError = (() => { try { JSON.parse(json); return ""; } catch (e: any) { return e.message; } })();
  const errors = def && !jsonError ? validateComponent(def) : [];

  const persistTry = (id: string, v: any) => {
    setTryValues((current) => ({ ...current, [id]: v }));
  };

  const save = async () => {
    let next: ComponentDef;
    try { next = JSON.parse(json); } catch { toast("Invalid JSON.", "error"); return; }
    ensureConfigForPrompt(next);
    delete next.params;
    delete next.prompt;
    if (isNew && registry.components?.[next.id]) {
      toast(`A component called ${next.id} already exists. Change the id.`, "error");
      return;
    }
    if (validateComponent(next).length) { toast("Fix the errors first.", "error"); return; }
    try {
      const saved = await storeComponent(next, mode, registry);
      setRegistry((r) => ({ ...r, components: { ...r.components, [saved.id]: saved } }));
      toast(`Saved "${saved.name}" v${saved.version || 1}.`);
      onBack();
    } catch (e: any) {
      toast(e.message || "Save failed.", "error");
    }
  };

  const remove = async () => {
    if (!comp) return;
    if (!armed) { setArmed(true); return; }
    try {
      await deleteComponent(comp.id, mode);
      setRegistry((r) => {
        const components = { ...r.components };
        delete components[comp.id];
        return { ...r, components };
      });
      toast(`Deleted ${comp.name}.`);
      onBack();
    } catch (e: any) {
      toast(e.message || "Could not delete.", "error");
    }
  };

  let compiledText = "";
  if (def) {
    const values = { ...tryValues };
    for (const p of paramsFromConfig(def.config)) {
      if (values[p.id] === undefined) values[p.id] = defaultParamValue(p);
    }
    const c = compileComponent(def, values);
    compiledText = [c.text, c.overrideNote].filter(Boolean).join(" ") + (c.rules.length ? `\n\nRules:\n${c.rules.map((r) => `- ${r}`).join("\n")}` : "");
  }

  const groups = def ? paletteGroups(registry) : [];
  const current = def?.category || "";
  if (current && !groups.includes(current)) groups.push(current);
  const controls = def ? paramsFromConfig(def.config) : [];
  const entries = Object.entries(def?.config || {});
  const configTokens = new Set(Object.values(def?.config || {}));
  const missing = def ? promptPlaceholders(def.systemPrompt || "").filter((id) => !configTokens.has(id)) : [];

  /**
   * Replaces the config object while preserving key order.
   *
   * @param next - Config entries in order
   */
  const writeConfig = (next: Array<[string, string]>) => {
    if (!def) return;
    const config: Record<string, string> = {};
    for (const [key, token] of next) config[key] = token;
    writeDef({ ...def, config });
  };

  return (
    <>
      <PageHeader
        title={isNew ? "New component" : `Edit: ${comp.name}`}
        subtitle={isNew ? "Define a prompt block and its controls." : "Press Save to keep changes. The version goes up when the prompt, controls or rules change."}
        actions={
          <>
            <button className="btn" type="button" onClick={onBack}>Cancel</button>
            <button className="btn primary" type="button" onClick={save}>{isNew ? "Create component" : "Save component"}</button>
            {comp ? <button className="btn danger" type="button" onClick={remove}>{armed ? "Click again to delete" : "Delete"}</button> : null}
          </>
        }
      />
      <div className="split editor-split">
        <div className="editor-panel">
          <div className="editor-panel-head">
            <h2><span className="studio-block-num">01</span> Definition JSON</h2>
            <button className="btn small ghost" type="button" onClick={() => { setAddingGroup(false); setTryValues({}); setJson(JSON.stringify(starterComponent(), null, 2)); }}>Clear</button>
          </div>
          <div className="editor-panel-body">
            <textarea className="code" spellCheck={false} aria-label="Component definition JSON" style={{ minHeight: 420 }} value={json} onChange={(e) => setJson(e.target.value)} />
            {jsonError ? <div className="notice error">Invalid JSON: {jsonError}</div> : null}
            {errors.length ? <div className="notice error"><ul className="errs">{errors.map((e) => <li key={e}>{e}</li>)}</ul></div> : null}
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "10px 0 0" }}>
              {mode === "server" ? `Saves to library/components/${isNew ? "<id>" : comp.id}.json on the server.` : "Demo mode: components are saved in this browser only."}
            </p>
          </div>
        </div>
        <div className="editor-side">
          <div className="editor-panel">
            <div className="editor-panel-head"><h2><span className="studio-block-num">02</span> Group</h2></div>
            <div className="editor-panel-body">
              {!def ? <p className="comp-form-hint">Fix the JSON to edit group and parameters.</p> : (
                <>
                  <div className="comp-form-row">
                    <label>Group</label>
                    <AppSelect
                      ariaLabel="Component group"
                      placeholder="Select a group"
                      value={addingGroup ? "__new__" : current}
                      options={groups.map((g) => ({ value: g, label: g }))}
                      footer={[{ value: "__new__", label: "+ Add new group" }]}
                      onChange={(next) => {
                        if (next === "__new__") { setAddingGroup(true); return; }
                        setAddingGroup(false);
                        writeDef({ ...def, category: next });
                      }}
                    />
                  </div>
                  {addingGroup ? (
                    <div className="comp-form-row">
                      <label>New group name</label>
                      <input type="text" value={newGroup} placeholder="e.g. Lighting" aria-label="New group name" onChange={(e) => setNewGroup(e.target.value)} onBlur={() => {
                        const name = newGroup.trim();
                        if (!name) return;
                        setAddingGroup(false);
                        setNewGroup("");
                        writeDef({ ...def, category: name });
                      }} />
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
          <div className="editor-panel">
            <div className="editor-panel-head">
              <h2><span className="studio-block-num">03</span> Config</h2>
              <span className="stack-count">{entries.length}</span>
            </div>
            <div className="editor-panel-body">
              <p className="comp-form-hint">The key is the control. The placeholder is the {"{{name}}"} inside systemPrompt.</p>
              {missing.length && def ? (
                <>
                  <p className="comp-form-hint">Prompt placeholders without a control: {missing.join(", ")}.</p>
                  <button type="button" className="btn small" onClick={() => { ensureConfigForPrompt(def); writeDef(def); }}>Add inferred controls</button>
                </>
              ) : null}
              {entries.map(([key, token], i) => {
                const kind = key.endsWith("_color") ? "color" : "text";
                return (
                  <div key={`${key}-${i}`} className="param-fn-card">
                    <div className="param-fn-grid">
                      <div className="comp-form-row">
                        <label>Key</label>
                        <input type="text" value={key} onChange={(e) => {
                          const next = [...entries] as Array<[string, string]>;
                          next[i] = [e.target.value.trim(), token];
                          writeConfig(next);
                        }} />
                      </div>
                      <div className="comp-form-row">
                        <label>Placeholder</label>
                        <input type="text" value={token} onChange={(e) => {
                          const next = [...entries] as Array<[string, string]>;
                          next[i] = [key, e.target.value.trim()];
                          writeConfig(next);
                        }} />
                      </div>
                      <div className="comp-form-row full">
                        <label>Control</label>
                        <AppSelect
                          className="comp-fn-select"
                          ariaLabel={`${key} control`}
                          value={kind}
                          options={[{ value: "text", label: "Text" }, { value: "color", label: "Colour selection" }]}
                          onChange={(nextKind) => {
                            const base = key.replace(/_color$/, "") || "param";
                            const nextKey = nextKind === "color" ? `${base}_color` : base;
                            const next = [...entries] as Array<[string, string]>;
                            next[i] = [nextKey, token];
                            writeConfig(next);
                          }}
                        />
                      </div>
                    </div>
                    <button type="button" className="btn small danger" onClick={() => {
                      writeConfig(entries.filter((_, index) => index !== i));
                    }}>Remove</button>
                  </div>
                );
              })}
              {def ? (
                <button type="button" className="btn small add-param-btn" onClick={() => {
                  const n = entries.length + 1;
                  writeConfig([...entries, [`param_${n}`, `param${n}`]]);
                }}>+ Add control</button>
              ) : null}
            </div>
          </div>
          <div className="editor-panel">
            <div className="editor-panel-head"><h2><span className="studio-block-num">04</span> Try it</h2></div>
            <div className="editor-panel-body">
              {def ? (
                <>
                  <div className="try-head">
                    {def.scope ? <span className={`scope ${def.scope}`}>{scopeLabel[def.scope] || def.scope}</span> : null}
                    <b>{def.name || "Untitled"}</b>
                  </div>
                  {controls.length ? (
                    <div className="try-params">
                      {controls.map((p) => {
                        const controlParam = paramForControl(p, inferParamFunction(p));
                        const v = tryValues[p.id] === undefined ? defaultParamValue(controlParam) : tryValues[p.id];
                        return (
                          <div key={p.id}>
                            <span className="ctl-label">{p.label || p.id}</span>
                            <ParamControl param={controlParam} value={v} onChange={(nv) => persistTry(p.id, nv)} />
                          </div>
                        );
                      })}
                    </div>
                  ) : <p className="comp-form-hint">No controls yet.</p>}
                  <span className="ctl-label">Prompt block this component adds</span>
                  <pre className="comp-preview">{compiledText}</pre>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export { ComponentEditor };
