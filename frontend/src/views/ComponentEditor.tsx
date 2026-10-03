import { useState } from "react";
import { compileComponent, defaultParamValue, validateComponent } from "@lib/compiler";
import { PageHeader } from "@/components/PageHeader";
import { ParamControl } from "@/components/ParamControl";
import { AppSelect } from "@/components/AppSelect";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/components/Toast";
import { storeComponent, deleteComponent } from "@/db/api";
import {
  applyParamFunction, ensureParamsForPrompt, formatParamValue, inferParamFunction,
  migrateStrayParamValues, paletteGroups, paramForControl, paramStoredValue,
  parseParamValue, PARAM_FUNCTIONS, promptParamIds, setParamStoredValue, starterComponent
} from "@/util/params";
import { scopeLabel } from "@/util/format";
import type { ComponentDef, Param } from "@/types/app";

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
  const writeDef = (nextDef: ComponentDef, nextTry = tryValues) => {
    migrateStrayParamValues(nextDef);
    for (const p of nextDef.params || []) {
      if (nextTry[p.id] !== undefined) setParamStoredValue(p, nextTry[p.id]);
    }
    setJson(JSON.stringify(nextDef, null, 2));
  };

  const def = parseDef();
  const jsonError = (() => { try { JSON.parse(json); return ""; } catch (e: any) { return e.message; } })();
  const errors = def && !jsonError ? validateComponent(def) : [];

  const persistTry = (p: Param, v: any) => {
    const nextTry = { ...tryValues, [p.id]: v };
    setTryValues(nextTry);
    const live = parseDef();
    if (!live) return;
    migrateStrayParamValues(live);
    const target = (live.params || []).find((x) => x.id === p.id);
    if (!target) return;
    setParamStoredValue(target, v);
    setJson(JSON.stringify(live, null, 2));
  };

  const save = async () => {
    let next: ComponentDef;
    try { next = JSON.parse(json); } catch { toast("Invalid JSON.", "error"); return; }
    migrateStrayParamValues(next);
    for (const p of next.params || []) {
      if (tryValues[p.id] !== undefined) setParamStoredValue(p, tryValues[p.id]);
    }
    ensureParamsForPrompt(next);
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
    for (const p of def.params || []) {
      const controlParam = paramForControl(p, inferParamFunction(p));
      if (values[p.id] === undefined) values[p.id] = paramStoredValue(controlParam) ?? defaultParamValue(controlParam);
    }
    const c = compileComponent(def, values);
    compiledText = [c.text, c.overrideNote].filter(Boolean).join(" ") + (c.rules.length ? `\n\nRules:\n${c.rules.map((r) => `- ${r}`).join("\n")}` : "");
  }

  const groups = def ? paletteGroups(registry) : [];
  const current = def?.category || "";
  if (current && !groups.includes(current)) groups.push(current);
  const missing = def ? promptParamIds(def.prompt).filter((id) => (def.params || []).every((p) => p.id !== id)) : [];

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
              <h2><span className="studio-block-num">03</span> Parameters</h2>
              <span className="stack-count">{(def?.params || []).length}</span>
            </div>
            <div className="editor-panel-body">
              <p className="comp-form-hint">Colour, dropdown or slider. Users only fill in the value.</p>
              {missing.length && def ? (
                <>
                  <p className="comp-form-hint">Prompt placeholders without a control: {missing.join(", ")}.</p>
                  <button type="button" className="btn small" onClick={() => { ensureParamsForPrompt(def); writeDef(def); }}>Add inferred controls</button>
                </>
              ) : null}
              {(def?.params || []).map((p, i) => {
                const fn = inferParamFunction(p);
                return (
                  <div key={i} className="param-fn-card">
                    <div className="param-fn-grid">
                      <div className="comp-form-row">
                        <label>Id</label>
                        <input type="text" value={p.id || ""} onChange={(e) => {
                          const params = [...(def.params || [])];
                          params[i] = { ...p, id: e.target.value.trim() };
                          writeDef({ ...def, params });
                        }} />
                      </div>
                      <div className="comp-form-row">
                        <label>Label</label>
                        <input type="text" value={p.label || ""} onChange={(e) => {
                          const params = [...(def.params || [])];
                          params[i] = { ...p, label: e.target.value };
                          writeDef({ ...def, params });
                        }} />
                      </div>
                      <div className="comp-form-row full">
                        <label>Value</label>
                        <input data-param-value={p.id} type="text" defaultValue={formatParamValue(paramStoredValue(p))} onBlur={(e) => {
                          const v = parseParamValue(p, e.target.value);
                          const nextTry = { ...tryValues, [p.id]: v };
                          setTryValues(nextTry);
                          const params = [...(def.params || [])];
                          const copy = { ...p };
                          setParamStoredValue(copy, v);
                          params[i] = copy;
                          writeDef({ ...def, params }, nextTry);
                        }} />
                      </div>
                      <div className="comp-form-row full">
                        <label>Functionality</label>
                        <AppSelect
                          className="comp-fn-select"
                          ariaLabel={`${p.label || p.id || "Parameter"} functionality`}
                          value={fn}
                          options={PARAM_FUNCTIONS.map((f) => ({ value: f.id, label: f.label }))}
                          onChange={(next) => {
                            const nextTry = { ...tryValues };
                            delete nextTry[p.id];
                            setTryValues(nextTry);
                            const params = [...(def.params || [])];
                            params[i] = applyParamFunction(p, next);
                            writeDef({ ...def, params }, nextTry);
                          }}
                        />
                      </div>
                    </div>
                    <button type="button" className="btn small danger" onClick={() => {
                      const params = [...(def.params || [])];
                      params.splice(i, 1);
                      writeDef({ ...def, params });
                    }}>Remove</button>
                  </div>
                );
              })}
              {def ? (
                <button type="button" className="btn small add-param-btn" onClick={() => {
                  const params = Array.isArray(def.params) ? [...def.params] : [];
                  const n = params.length + 1;
                  params.push(applyParamFunction({ id: `param${n}`, label: `Parameter ${n}`, type: "text" }, "text"));
                  writeDef({ ...def, params });
                }}>+ Add parameter</button>
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
                  {(def.params || []).length ? (
                    <div className="try-params">
                      {(def.params || []).map((p) => {
                        const controlParam = paramForControl(p, inferParamFunction(p));
                        const v = tryValues[p.id] === undefined ? (paramStoredValue(controlParam) ?? defaultParamValue(controlParam)) : tryValues[p.id];
                        return (
                          <div key={p.id}>
                            <span className="ctl-label">{p.label || p.id}</span>
                            <ParamControl param={controlParam} value={v} onChange={(nv) => persistTry(p, nv)} />
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
