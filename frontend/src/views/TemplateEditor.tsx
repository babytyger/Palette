import { useState } from "react";
import { paramsFromConfig, validateTemplate } from "@lib/compiler";
import { PageHeader } from "@/components/PageHeader";
import { ImageControl } from "@/components/ImageControl";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/components/Toast";
import { storeTemplate, deleteTemplate } from "@/db/api";
import { bareConfigTokens, formatPromptDocument, labelFromParamId, paramQuickRefDetail, promptPlaceholders, readPromptDraft, templateIdFromName } from "@/util/params";
import { typeEmoji } from "@/util/format";
import type { Template } from "@/types/app";

type Props = {
  template: Template | null;
  onStudio: () => void;
  onSaved: (t: Template) => void;
  onDeleted: () => void;
};

/**
 * Template editor. The prompt stays plain text; only the CONFIG block is JSON.
 */
const TemplateEditor = ({ template: t, onSaved, onDeleted }: Props) => {
  const { mode, registry, setRegistry } = useApp();
  const toast = useToast();
  const isNew = !t;
  const [name, setName] = useState(t?.name || "");
  const [themeId, setThemeId] = useState(t?.id || "");
  const [idTouched, setIdTouched] = useState(!isNew);
  const [doc, setDoc] = useState(isNew ? "" : formatPromptDocument(t));
  const [referenceImage, setReferenceImage] = useState<string | null>(t?.referenceImage || null);
  const [errors, setErrors] = useState<string[]>([]);
  const [armed, setArmed] = useState(false);

  /**
   * Restores the editor to the stored theme, or clears a new one.
   */
  const reset = () => {
    setErrors([]);
    if (isNew) {
      setName("");
      setThemeId("");
      setIdTouched(false);
      setDoc("");
      return;
    }
    setName(t.name);
    setThemeId(t.id);
    setDoc(formatPromptDocument(t));
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
    let nextId = isNew ? (themeId.trim() || draft.id || templateIdFromName(nextName)) : t.id;
    if (isNew && nextId && registry.templates[nextId]) nextId = `${nextId}_copy`;
    const def: Template = { ...(t || {}), id: nextId, name: nextName, systemPrompt: draft.systemPrompt, config: bareConfigTokens(draft.config) };
    delete def.params;
    delete def.updatedAt;
    if (referenceImage) def.referenceImage = referenceImage;
    else delete def.referenceImage;
    const errs = validateTemplate(def);
    if (errs.length) { setErrors(errs); return; }
    try {
      const saved = await storeTemplate(def, mode, registry);
      setRegistry((r) => ({ ...r, templates: { ...r.templates, [saved.id]: saved } }));
      toast(`Saved "${saved.name}" v${saved.version}.`);
      onSaved(saved);
    } catch (e: any) {
      setErrors([e.message || "Could not save."]);
    }
  };

  const remove = async () => {
    if (!t) return;
    if (!armed) { setArmed(true); return; }
    try {
      await deleteTemplate(t.id, mode);
      setRegistry((r) => {
        const templates = { ...r.templates };
        delete templates[t.id];
        return { ...r, templates };
      });
      toast(`Deleted ${t.name}.`);
      onDeleted();
    } catch (e: any) {
      toast(e.message || "Could not delete.", "error");
    }
  };

  return (
    <>
      <PageHeader
        title={isNew ? "New template" : `Edit: ${t.name}`}
        subtitle={isNew ? "Write the prompt in plain text, then a CONFIG block." : "Press Save to keep changes. The version goes up when the prompt or config changes."}
        actions={
          <>
            <button className="btn primary" type="button" onClick={save}>{isNew ? "Create template" : "Save template"}</button>
            {t ? <button className="btn danger" type="button" onClick={remove}>{armed ? "Click again to delete" : "Delete"}</button> : null}
          </>
        }
      />
      <div className="split tpl-editor-split">
        <div className="editor-panel ref-panel">
          <div className="editor-panel-head"><h2>Reference</h2></div>
          <div className="editor-panel-body">
            <p className="comp-form-hint">Square tile for the theme card. Stays with this template only.</p>
            <div className="ref-tile">
              <ImageControl
                param={{ id: "reference", label: "Reference image", type: "image", fitSquare: true }}
                value={referenceImage}
                onChange={(url) => setReferenceImage(url)}
              />
            </div>
          </div>
        </div>
        <div className="editor-panel">
          <div className="editor-panel-head">
            <h2>Prompt</h2>
            <button className="btn small ghost" type="button" onClick={reset}>{isNew ? "Clear" : "Reset"}</button>
          </div>
          <div className="editor-panel-body">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="comp-form-row">
                <label htmlFor="tpl-name">Name</label>
                <input id="tpl-name" type="text" value={name} placeholder="Archival Experimental Editorial" onChange={(e) => {
                  const next = e.target.value;
                  setName(next);
                  if (isNew && !idTouched) setThemeId(templateIdFromName(next));
                }} />
              </div>
              <div className="comp-form-row">
                <label htmlFor="tpl-id">Id</label>
                <input id="tpl-id" type="text" value={themeId} placeholder="archival_experimental_editorial" disabled={!isNew} onChange={(e) => { setIdTouched(true); setThemeId(e.target.value); }} />
              </div>
            </div>
            <p className="comp-form-hint">
              Write the prompt as plain text. End with a CONFIG block. Each value is the {"{{placeholder}}"} that the control fills.
            </p>
            <textarea className="code" spellCheck={false} aria-label="Template prompt" placeholder={"OPENING IN\nDescribe the image. Use {{subjectImage}} where the subject goes.\n\nCONFIG\n{\n  \"subject_image\": \"{{subjectImage}}\"\n}"} value={doc} onChange={(e) => setDoc(e.target.value)} />
            {errors.length ? (
              <div className="notice error"><ul className="errs">{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>
            ) : null}
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "10px 0 0" }}>
              {mode === "server" ? `Saves to library/templates/${themeId || "<id>"}.json on the server.` : "Demo mode: themes are saved in this browser only."}
            </p>
          </div>
        </div>
      </div>
      <QuickReference raw={doc} />
    </>
  );
};

/**
 * Parameter quick-reference from the JSON editor.
 *
 * @param props.raw - Raw textarea contents
 */
const QuickReference = ({ raw }: { raw: string }) => {
  let body = <p style={{ color: "var(--faint)", margin: 0, fontSize: 13 }}>Write the prompt, then a CONFIG block. Controls from that block appear here.</p>;
  const text = String(raw || "").trim();
  if (text) {
    const draft = readPromptDraft(text);
    const config = draft?.config || {};
    const params = paramsFromConfig(config);
    const placeholders = promptPlaceholders(draft?.systemPrompt || "");
    const paramIds = new Set(params.map((p) => p.id));
    const missing = placeholders.filter((id) => !paramIds.has(id));
    const entries = Object.entries(config);
    if (!entries.length && !missing.length) {
      body = draft?.parsed
        ? <p style={{ color: "var(--faint)", margin: 0, fontSize: 13 }}>No controls found. Add a CONFIG block, or use {"{{placeholder}}"} in the prompt.</p>
        : <p style={{ color: "var(--faint)", margin: 0, fontSize: 13 }}>{draft?.configError || "Add a CONFIG block. Controls appear once that object parses."}</p>;
    } else {
      body = (
        <>
          {draft?.title ? <p style={{ fontSize: 13, margin: "0 0 10px", color: "var(--muted)" }}>{draft.title}</p> : null}
          <div className="qref-list">
            {entries.map(([key], index) => {
              const param = params[index];
              return (
                <div key={key} className="qref-row">
                  <span className={`param-type-badge ${param?.type || ""}`}>{typeEmoji[param?.type || ""] || "·"} {param?.type || "unknown"}</span>
                  <div>
                    <b>{param?.id || "(missing placeholder)"}</b>
                    <small>{[key, param ? paramQuickRefDetail(param) : ""].filter(Boolean).join(" · ")}</small>
                  </div>
                </div>
              );
            })}
            {missing.map((id) => (
              <div key={id} className="qref-row">
                <span className="param-type-badge">{"{{ }}"}</span>
                <div>
                  <b>{id}</b>
                  <small>Used in the prompt as {`{{${id}}}`} ({labelFromParamId(id)}). Add it as a config value.</small>
                </div>
              </div>
            ))}
          </div>
        </>
      );
    }
  }
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-head"><h2>Quick reference</h2><span style={{ fontSize: 12, color: "var(--muted)" }}>From the CONFIG block</span></div>
      <div className="card-body">{body}</div>
    </div>
  );
};

export { TemplateEditor };
