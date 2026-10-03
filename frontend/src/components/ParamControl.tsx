import type { Param } from "@/types/app";
import { AppSelect } from "@/components/AppSelect";
import { ColorControl } from "@/components/ColorControl";
import { ImageControl } from "@/components/ImageControl";

type Props = {
  param: Param;
  value: any;
  onChange: (v: any) => void;
};

/**
 * Builds the input control for one param. Used by templates and components.
 *
 * @param props.param - Param definition
 * @param props.value - Current value
 * @param props.onChange - Value setter
 */
const ParamControl = ({ param: p, value: cur, onChange }: Props) => {
  if (p.type === "image") return <ImageControl param={p} value={cur} onChange={onChange} />;
  if (p.type === "color") return <ColorControl param={p} value={cur} onChange={onChange} />;
  if (p.type === "select") {
    return (
      <AppSelect
        ariaLabel={p.label}
        value={String(cur ?? p.defaultValue ?? "")}
        options={(p.options || []).map((o) => ({ value: o.value, label: o.label }))}
        onChange={onChange}
      />
    );
  }
  if (p.type === "multiselect") {
    const chosen = new Set(Array.isArray(cur) ? cur : []);
    return (
      <div className="chips" role="group" aria-label={p.label}>
        {(p.options || []).map((o) => (
          <button
            key={o.value}
            type="button"
            className="chip"
            aria-pressed={String(chosen.has(o.value))}
            onClick={() => {
              const next = new Set(chosen);
              if (next.has(o.value)) {
                if (next.size === 1) return;
                next.delete(o.value);
              } else next.add(o.value);
              onChange((p.options || []).map((x) => x.value).filter((v) => next.has(v)));
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  }
  if (p.type === "slider") {
    const v = cur ?? p.defaultValue ?? p.min;
    return (
      <div>
        <input
          type="range"
          min={p.min}
          max={p.max}
          step={p.step || 1}
          value={String(v)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>{v}</span>
      </div>
    );
  }
  if (p.type === "switch") {
    const on = Boolean(cur || p.defaultValue);
    return (
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
        <span>{on ? "Enabled" : "Disabled"}</span>
      </label>
    );
  }
  if (p.type === "palette") {
    const list = Array.isArray(cur) ? cur : [];
    return (
      <div>
        {list.map((c: any, i: number) => (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
            <input
              type="color"
              value={c.hex}
              style={{ width: 36, height: 30 }}
              onChange={(e) => {
                const next = [...list];
                next[i] = { ...next[i], hex: e.target.value.toUpperCase() };
                onChange(next);
              }}
            />
            <input
              type="text"
              value={c.name || ""}
              placeholder="Name"
              style={{ flex: 1 }}
              onChange={(e) => {
                const next = [...list];
                next[i] = { ...next[i], name: e.target.value };
                onChange(next);
              }}
            />
            <button
              type="button"
              className="btn small danger"
              onClick={() => onChange(list.filter((_: any, j: number) => j !== i))}
            >
              -
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn small ghost"
          onClick={() => onChange([...list, { hex: "#888888", name: "" }])}
        >
          +Add colour
        </button>
      </div>
    );
  }
  if (p.type === "textarea") {
    return <textarea rows={3} value={cur || ""} onChange={(e) => onChange(e.target.value)} />;
  }
  return <input type="text" value={cur || ""} onChange={(e) => onChange(e.target.value)} />;
};

export { ParamControl };
