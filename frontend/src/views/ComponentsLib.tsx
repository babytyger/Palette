import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/components/Toast";
import { deleteComponent } from "@/db/api";
import { compList } from "@/util/params";
import { padIndex, scopeLabel } from "@/util/format";
import { cn } from "@/util/cn";
import type { ComponentDef } from "@/types/app";

type ScopeFilter = "all" | "theme" | "element" | "rule";

/**
 * Compact component library grouped by category, with Theme / Element / Rule filters.
 *
 * @param props.onEdit - Open editor
 */
const ComponentsLib = ({ onEdit }: { onEdit: (c: ComponentDef | null) => void }) => {
  const { mode, registry, setRegistry } = useApp();
  const toast = useToast();
  const [armed, setArmed] = useState<string | null>(null);
  const [scope, setScope] = useState<ScopeFilter>("all");
  const all = compList(registry);
  const items = scope === "all" ? all : all.filter((c) => c.scope === scope);
  const groups: Record<string, ComponentDef[]> = {};
  for (const c of items) (groups[c.category || "Other"] ||= []).push(c);

  const remove = async (c: ComponentDef) => {
    if (armed !== c.id) { setArmed(c.id); return; }
    try {
      await deleteComponent(c.id, mode);
      const next = { ...registry, components: { ...registry.components } };
      delete next.components[c.id];
      setRegistry(next);
      toast(`Deleted ${c.name}.`);
      setArmed(null);
    } catch (e: any) {
      toast(e.message || "Could not delete.", "error");
    }
  };

  const counts = {
    theme: all.filter((c) => c.scope === "theme").length,
    element: all.filter((c) => c.scope === "element").length,
    rule: all.filter((c) => c.scope === "rule").length
  };

  return (
    <>
      <PageHeader
        title="Components"
        subtitle="Prompt blocks you stack on any template."
        actions={<button className="btn primary" type="button" onClick={() => onEdit(null)}>+ New component</button>}
      />
      <div className="scope-tabs" role="tablist" aria-label="Component scope">
        <button type="button" className={cn("scope-tab", scope === "theme" && "active")} onClick={() => setScope(scope === "theme" ? "all" : "theme")}>
          <span className="scope theme">Theme</span>
          <small>Restyles the whole image</small>
        </button>
        <button type="button" className={cn("scope-tab", scope === "element" && "active")} onClick={() => setScope(scope === "element" ? "all" : "element")}>
          <span className="scope element">Element</span>
          <small>Adds to the composition</small>
        </button>
        <button type="button" className={cn("scope-tab", scope === "rule" && "active")} onClick={() => setScope(scope === "rule" ? "all" : "rule")}>
          <span className="scope rule">Rule</span>
          <small>Adds a restriction</small>
        </button>
      </div>
      {Object.entries(groups).map(([cat, list]) => (
        <div key={cat} className="lib-section">
          <div className="lib-section-head">
            <h3>{cat}</h3>
            <span>{padIndex(list.length)}</span>
          </div>
          <div className="frag-grid compact">
            {list.map((c) => (
              <div key={c.id} className="frag-card compact">
                <div className="frag-card-top">
                  <span className={`scope ${c.scope}`}>{scopeLabel[c.scope as keyof typeof scopeLabel] || c.scope}</span>
                  <div className="frag-card-actions">
                    <button className="icon-btn" type="button" aria-label={`Edit ${c.name}`} onClick={() => onEdit(c)}>
                      <Pencil size={13} />
                    </button>
                    <button className="icon-btn" type="button" aria-label={`Delete ${c.name}`} onClick={() => remove(c)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <h4>{c.name}</h4>
                <p className="frag-meta">{(c.params || []).length} control{(c.params || []).length === 1 ? "" : "s"} · v{c.version || 1}</p>
                {armed === c.id ? <p className="frag-warn">Click delete again to confirm.</p> : null}
              </div>
            ))}
          </div>
        </div>
      ))}
      {!all.length ? <p className="empty-copy">No components yet.</p> : null}
      {all.length && !items.length ? <p className="empty-copy">No {scope} components.</p> : null}
      <p className="sr-only">{counts.theme} theme, {counts.element} element, {counts.rule} rule</p>
    </>
  );
};

export { ComponentsLib };
