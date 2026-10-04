import { useState } from "react";
import { compileComponent, defaultParamValue, paramsFromConfig, validateComponent } from "@lib/compiler";
import { PageHeader } from "@/components/PageHeader";
import { ParamControl } from "@/components/ParamControl";
import { PromptQuickReference } from "@/components/PromptQuickReference";
import { AppSelect } from "@/components/AppSelect";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/components/Toast";
import { storeComponent, deleteComponent } from "@/db/api";
import {
  bareConfigTokens, fixPromptConfig, formatPromptDocument, inferParamFunction, paletteGroups, paramForControl, readPromptDraft, templateIdFromName
} from "@/util/params";
import { scopeLabel } from "@/util/format";
import type { ComponentDef } from "@/types/app";

type Props = {
  component: ComponentDef | null;
  onBack: () => void;
};

const SCOPES = ["theme", "element", "rule"] as const;

/**
 * Component editor. The prompt stays plain text; only the CONFIG block is JSON.
 *
 * @param props.component - Component being edited, or null for a new one
 * @param props.onBack - Returns to the component library
 */
const ComponentEditor = ({ component: comp, onBack }: Props) => {
  const { mode, registry, setRegistry } = useApp();
  const toast = useToast();
  const isNew = !comp;
  const [name, setName] = useState(comp?.name || "");
  const [componentId, setComponentId] = useState(comp?.id || "");
  const [idTouched, setIdTouched] = useState(!isNew);
  const [scope, setScope] = useState(comp?.scope || "element");
  const [category, setCategory] = useState(comp?.category || "");
  const [doc, setDoc] = useState(isNew ? "" : formatPromptDocument(comp));
  const [tryValues, setTryValues] = useState<Record<string, any>>({});
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroup, setNewGroup] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [armed, setArmed] = useState(false);

  /**
   * Restores the editor to the stored component, or clears a new one.
   */
  const reset = () => {
    setErrors([]);
    setTryValues({});
    setAddingGroup(false);
    setNewGroup("");
    if (isNew) {
      setName("");
      setComponentId("");
      setIdTouched(false);
      setScope("element");
      setCategory("");
      setDoc("");
      return;
    }
    setName(comp.name);
    setComponentId(comp.id);
    setScope(comp.scope || "element");
    setCategory(comp.category || "");
    setDoc(formatPromptDocument(comp));
  };

  /**
   * Saves the prompt document as systemPrompt plus config.
   */
  const save = async () => {
    setErrors([]);
    const draft = readPromptDraft(doc);
    if (!draft) { setErrors(["Paste the prompt, then a CONFIG block."]); return; }
    if (draft.configError) { setErrors([draft.configError]); return; }
    const nextName = name.trim() || draft.name;
    let nextId = isNew ? (componentId.trim() || draft.id || templateIdFromName(nextName)) : comp.id;
    if (isNew && nextId && registry.components?.[nextId]) nextId = `${nextId}_copy`;
    const def: ComponentDef = {
      ...(comp || {}),
      ...pastedJson(doc),
      id: nextId,
      name: nextName,
      scope,
      category,
      systemPrompt: draft.systemPrompt,
      config: bareConfigTokens(draft.config)
    };
    if (draft.components.length) def.components = draft.components;
    if (!Array.isArray(def.rules)) def.rules = [];
    if (!Array.isArray(def.affects)) def.affects = [];
    if (!Array.isArray(def.conflictsWith)) def.conflictsWith = [];
    delete def.params;
    delete def.prompt;
    delete def.updatedAt;
    const errs = validateComponent(def);
    if (errs.length) { setErrors(errs); return; }
    try {
      const saved = await storeComponent(def, mode, registry);
      setRegistry((r) => ({ ...r, components: { ...r.components, [saved.id]: saved } }));
      toast(`Saved "${saved.name}" v${saved.version || 1}.`);
      onBack();
    } catch (e: any) {
      setErrors([e.message || "Could not save."]);
    }
  };

  /**
   * Deletes the open component after a second click.
   */
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

  const draft = readPromptDraft(doc);
  const controls = paramsFromConfig(draft?.config, draft?.systemPrompt || "");
  const groups = paletteGroups(registry);
  if (category && !groups.includes(category)) groups.push(category);

  let compiledText = "";
  if (draft && !draft.configError) {
    const values = { ...tryValues };
    for (const p of controls) {
      if (values[p.id] === undefined) values[p.id] = defaultParamValue(p);
    }
    const compiled = compileComponent({ systemPrompt: draft.systemPrompt, config: draft.config, scope, name }, values);
    compiledText = compiled.text;
  }

  return (
    <>
      <PageHeader
        title={isNew ? "New component" : `Edit: ${comp.name}`}
        subtitle={isNew ? "Paste a JSON prompt, or write the prompt and end with a CONFIG block." : "Press Save to keep changes. The version goes up when the prompt or config changes."}
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
            <h2>Prompt</h2>
            <button className="btn small ghost" type="button" onClick={reset}>{isNew ? "Clear" : "Reset"}</button>
          </div>
          <div className="editor-panel-body">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="comp-form-row">
                <label htmlFor="comp-name">Name</label>
                <input id="comp-name" type="text" value={name} placeholder="Duotone" onChange={(e) => {
                  const next = e.target.value;
                  setName(next);
                  if (isNew && !idTouched) setComponentId(templateIdFromName(next));
                }} />
              </div>
              <div className="comp-form-row">
                <label htmlFor="comp-id">Id</label>
                <input id="comp-id" type="text" value={componentId} placeholder="duotone" disabled={!isNew} onChange={(e) => { setIdTouched(true); setComponentId(e.target.value); }} />
              </div>
              <div className="comp-form-row">
                <label>Scope</label>
                <AppSelect
                  ariaLabel="Component scope"
                  value={scope}
                  options={SCOPES.map((id) => ({ value: id, label: scopeLabel[id] || id }))}
                  onChange={setScope}
                />
              </div>
              <div className="comp-form-row">
                <label>Group</label>
                <AppSelect
                  ariaLabel="Component group"
                  placeholder="Select a group"
                  value={addingGroup ? "__new__" : category}
                  options={groups.map((g) => ({ value: g, label: g }))}
                  footer={[{ value: "__new__", label: "+ Add new group" }]}
                  onChange={(next) => {
                    if (next === "__new__") { setAddingGroup(true); return; }
                    setAddingGroup(false);
                    setCategory(next);
                  }}
                />
              </div>
            </div>
            {addingGroup ? (
              <div className="comp-form-row">
                <label htmlFor="comp-group">New group name</label>
                <input id="comp-group" type="text" value={newGroup} placeholder="e.g. Lighting" onChange={(e) => setNewGroup(e.target.value)} onBlur={() => {
                  const next = newGroup.trim();
                  if (!next) return;
                  setAddingGroup(false);
                  setNewGroup("");
                  setCategory(next);
                }} />
              </div>
            ) : null}
            <p className="comp-form-hint">
              Paste any JSON prompt, or write the prompt and end with a CONFIG block. Config values and components are read from that JSON.
            </p>
            <textarea className="code" spellCheck={false} aria-label="Component prompt" placeholder={"Render the image as a two-colour duotone. Map shadows to {{darkTone}}.\n\nCONFIG\n{\n  \"dark_color\": \"{{darkTone}}\"\n}"} value={doc} onChange={(e) => setDoc(e.target.value)} />
            {errors.length ? (
              <div className="notice error"><ul className="errs">{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>
            ) : null}
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "10px 0 0" }}>
              {mode === "server" ? `Saves to library/components/${componentId || "<id>"}.json on the server.` : "Demo mode: components are saved in this browser only."}
            </p>
          </div>
        </div>
        <div className="editor-side">
          <div className="editor-panel">
            <div className="editor-panel-head"><h2>Try it</h2></div>
            <div className="editor-panel-body">
              <div className="try-head">
                {scope ? <span className={`scope ${scope}`}>{scopeLabel[scope] || scope}</span> : null}
                <b>{name || "Untitled"}</b>
              </div>
              {controls.length ? (
                <div className="try-params">
                  {controls.map((p) => {
                    const controlParam = paramForControl(p, inferParamFunction(p));
                    const v = tryValues[p.id] === undefined ? defaultParamValue(controlParam) : tryValues[p.id];
                    return (
                      <div key={p.id}>
                        <span className="ctl-label">{p.label || p.id}</span>
                        <ParamControl param={controlParam} value={v} onChange={(nv) => setTryValues((current) => ({ ...current, [p.id]: nv }))} />
                      </div>
                    );
                  })}
                </div>
              ) : <p className="comp-form-hint">No controls yet. They appear from the config values in the prompt.</p>}
              <span className="ctl-label">Prompt block this component adds</span>
              <pre className="comp-preview">{compiledText}</pre>
            </div>
          </div>
        </div>
      </div>
      <PromptQuickReference raw={doc} onFix={() => setDoc((current) => fixPromptConfig(current))} />
    </>
  );
};

/**
 * Parses a full JSON document from the editor, when the field is JSON.
 *
 * @param raw - Editor text
 * @returns Fields from that JSON, or an empty object
 */
const pastedJson = (raw: string) => {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as ComponentDef;
  } catch {
    // Plain prompt text is not a JSON document.
  }
  return {} as ComponentDef;
};

export { ComponentEditor };
