import { useState } from "react";
import { Check, Plus } from "lucide-react";
import ExpandableSearchBar from "@/components/ui/expandable-search-bar";
import { useApp } from "@/context/AppContext";
import { cn } from "@/util/cn";
import { padIndex } from "@/util/format";
import { compList, pickStatus } from "@/util/params";
import type { Template } from "@/types/app";

type Props = {
  template: Template | null;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
};

/**
 * Studio library: search, grouped rows, add or check when already on the design.
 *
 * @param props.template - Open template
 * @param props.onAdd - Stack a component
 * @param props.onRemove - Unstack a component
 */
const ComponentPalette = ({ template, onAdd, onRemove }: Props) => {
  const app = useApp();
  const [query, setQuery] = useState("");
  const items = compList(app.registry);
  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((c) => c.name.toLowerCase().includes(q) || (c.category || "").toLowerCase().includes(q)) : items;
  const groups: Record<string, typeof items> = {};
  for (const c of filtered) (groups[c.category || "Other"] ||= []).push(c);

  return (
    <aside className="comp-palette" aria-label="Component library">
      <div className="palette-head">
        <h2>Library</h2>
        <ExpandableSearchBar
          expandDirection="left"
          width={168}
          size={28}
          placeholder="Search"
          onSearch={setQuery}
        />
      </div>
      <div className="palette-scroll">
        {!filtered.length ? (
          <p className="palette-empty">{items.length ? "No matches." : "No components yet."}</p>
        ) : Object.entries(groups).map(([cat, list]) => {
          const allInCat = items.filter((c) => (c.category || "Other") === cat);
          return (
            <div key={cat}>
              <div className="palette-cat">
                <span>{cat}</span>
                <span className="palette-cat-n">{padIndex(allInCat.length)}</span>
              </div>
              {list.map((c) => {
                const status = template ? pickStatus(template, c, app.liveComponents, app.registry.components || {}) : { kind: "ok" as const };
                const blocked = status.kind === "blocked";
                const onDesign = status.kind === "added";
                const selected = app.selectedPaletteId === c.id;
                return (
                  <div
                    key={c.id}
                    className={cn("palette-row", selected && "selected", onDesign && "on-design", blocked && "blocked")}
                    title={status.reason || c.name}
                    draggable={!blocked}
                    onDragStart={(e) => {
                      if (blocked) { e.preventDefault(); return; }
                      app.setSelectedPaletteId(c.id);
                      e.dataTransfer.setData("text/plain", c.id);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                  >
                    <button
                      type="button"
                      className="palette-item"
                      disabled={blocked}
                      onClick={() => { if (!blocked) app.setSelectedPaletteId(c.id); }}
                    >
                      {c.name}
                    </button>
                    {onDesign && selected ? <span className="palette-active">Active</span> : null}
                    {onDesign ? (
                      <button type="button" className="palette-add is-on" aria-label={`Remove ${c.name}`} onClick={() => onRemove(c.id)}>
                        <Check className="palette-add-ic" strokeWidth={2.25} />
                      </button>
                    ) : (
                      <button type="button" className="palette-add" disabled={blocked} aria-label={`Add ${c.name}`} onClick={() => { app.setSelectedPaletteId(c.id); onAdd(c.id); }}>
                        <Plus className="palette-add-ic" strokeWidth={2.25} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </aside>
  );
};

export { ComponentPalette };
