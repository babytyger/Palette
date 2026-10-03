import { useMemo, useState } from "react";
import { validateTemplate } from "@lib/compiler";
import { PageHeader } from "@/components/PageHeader";
import { ImageControl } from "@/components/ImageControl";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/components/Toast";
import { storeTemplate, deleteTemplate } from "@/db/api";
import { labelFromParamId, paramQuickRefDetail, promptPlaceholders } from "@/util/params";
import { typeEmoji } from "@/util/format";
import type { Template } from "@/types/app";

type Props = {
  template: Template | null;
  onStudio: () => void;
  onSaved: (t: Template) => void;
  onDeleted: () => void;
};

/**
 * Template JSON editor with reference image and quick reference.
 */
const TemplateEditor = ({ template: t, onSaved, onDeleted }: Props) => {
  const { mode, registry, setRegistry } = useApp();
  const toast = useToast();
  const isNew = !t;
  const starter = useMemo(() => {
    if (!t) return {};
    const copy = JSON.parse(JSON.stringify(t));
    delete copy.referenceImage;
    delete copy.updatedAt;
    return copy;
  }, [t]);
  const [json, setJson] = useState(isNew ? "" : JSON.stringify(starter, null, 2));
  const [referenceImage, setReferenceImage] = useState<string | null>(t?.referenceImage || null);
  const [errors, setErrors] = useState<string[]>([]);
  const [armed, setArmed] = useState(false);

  const save = async () => {
    setErrors([]);
    let def: Template;
    try { def = JSON.parse(json); }
    catch (e: any) { setErrors([`Invalid JSON: ${e.message}`]); return; }
    if (isNew && registry.templates[def.id]) def.id = `${def.id}_copy`;
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
        subtitle={isNew ? "Paste your own template JSON. The editor starts empty." : "Press Save to keep changes. The version goes up when the prompt or params change."}
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
            <h2>Template definition (JSON)</h2>
            <button className="btn small ghost" type="button" onClick={() => setJson(isNew ? "" : JSON.stringify(starter, null, 2))}>{isNew ? "Clear" : "Reset"}</button>
          </div>
          <div className="editor-panel-body">
            <p className="comp-form-hint">
              {isNew
                ? "Paste the full template JSON. Quick reference below updates from the params and {{placeholders}} in your prompt."
                : <>The <code style={{ background: "var(--surface2)", padding: "1px 5px", borderRadius: 4 }}>systemPrompt</code> field is the master prompt. Every {"{{paramId}}"} must have a matching entry in params.</>}
            </p>
            <textarea className="code" spellCheck={false} aria-label="Template definition JSON" placeholder="Paste your template JSON here." value={json} onChange={(e) => setJson(e.target.value)} />
            {errors.length ? (
              <div className="notice error"><ul className="errs">{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>
            ) : null}
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "10px 0 0" }}>
              {mode === "server" ? `Saves to library/templates/${isNew ? "<id>" : t.id}.json on the server.` : "Demo mode: themes are saved in this browser only."}
            </p>
          </div>
        </div>
      </div>
      <QuickReference raw={json} />
    </>
  );
};

/**
 * Parameter quick-reference from the JSON editor.
 *
 * @param props.raw - Raw textarea contents
 */
const QuickReference = ({ raw }: { raw: string }) => {
  let body = <p style={{ color: "var(--faint)", margin: 0, fontSize: 13 }}>Paste your template JSON. Parameters from that prompt will appear here.</p>;
  const text = String(raw || "").trim();
  if (text) {
    try {
      const def = JSON.parse(text);
      if (!def || typeof def !== "object" || Array.isArray(def)) {
        body = <p style={{ color: "var(--faint)", margin: 0, fontSize: 13 }}>The JSON must be a template object.</p>;
      } else {
        const params = Array.isArray(def.params) ? def.params : [];
        const placeholders = promptPlaceholders(def.systemPrompt);
        const paramIds = new Set(params.map((p: any) => p && p.id).filter(Boolean));
        const missing = placeholders.filter((id) => !paramIds.has(id));
        if (!params.length && !placeholders.length) {
          body = <p style={{ color: "var(--faint)", margin: 0, fontSize: 13 }}>No parameters found. Add a params array, or use {"{{paramId}}"} in systemPrompt.</p>;
        } else {
          body = (
            <>
              {def.name || def.id ? <p style={{ fontSize: 13, margin: "0 0 10px", color: "var(--muted)" }}>{[def.name, def.id].filter(Boolean).join(" · ")}</p> : null}
              <div className="qref-list">
                {params.map((p: any, i: number) => (
                  <div key={p.id || i} className="qref-row">
                    <span className={`param-type-badge ${p.type || ""}`}>{typeEmoji[p.type] || "·"} {p.type || "unknown"}</span>
                    <div>
                      <b>{p.id || "(missing id)"}</b>
                      {paramQuickRefDetail(p) ? <small>{paramQuickRefDetail(p)}</small> : null}
                    </div>
                  </div>
                ))}
                {missing.map((id) => (
                  <div key={id} className="qref-row">
                    <span className="param-type-badge">{"{{ }}"}</span>
                    <div>
                      <b>{id}</b>
                      <small>Used in the prompt as {`{{${id}}}`} ({labelFromParamId(id)}). Add a matching params entry.</small>
                    </div>
                  </div>
                ))}
              </div>
            </>
          );
        }
      }
    } catch {
      body = <p style={{ color: "var(--faint)", margin: 0, fontSize: 13 }}>JSON is not valid yet. Parameters will appear once it parses.</p>;
    }
  }
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-head"><h2>Quick reference</h2><span style={{ fontSize: 12, color: "var(--muted)" }}>From your JSON</span></div>
      <div className="card-body">{body}</div>
    </div>
  );
};

export { TemplateEditor };
