import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { ImagePlus } from "lucide-react";
import type { Param } from "@/types/app";
import { imageMeta, readImageFile, fitImageToSquare } from "@/util/images";
import { fmtBytes } from "@/util/format";
import { useToast } from "@/components/Toast";
import { cn } from "@/util/cn";

type Props = {
  param: Param;
  value: string | null;
  onChange: (v: string | null) => void;
  emptyTitle?: string;
  emptyHint?: string;
  compact?: boolean;
};

/**
 * Click-or-drop image control. PNG/JPEG/WebP are kept as uploaded.
 *
 * @param props.param - Image param
 * @param props.value - Data URL
 * @param props.onChange - Setter
 * @param props.emptyTitle - Empty-state heading
 * @param props.emptyHint - Empty-state hint
 * @param props.compact - Smaller dashed zone for the studio rail
 */
const ImageControl = ({ param: p, value, onChange, emptyTitle, emptyHint, compact }: Props) => {
  const toast = useToast();
  const inp = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState("");
  const meta = value ? imageMeta.get(value) : null;
  const title = emptyTitle || "Drop image";
  const hint = emptyHint === undefined ? "or browse files" : emptyHint;

  const take = async (file?: File) => {
    setErr("");
    if (!file) return;
    try {
      let { url, meta: m } = await readImageFile(file);
      if (p.fitSquare) ({ url, meta: m } = await fitImageToSquare(url, m.name));
      imageMeta.set(url, m);
      onChange(url);
      toast(p.fitSquare ? `${p.label} attached and fitted to a square.` : `${p.label} attached.`);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    take(e.dataTransfer?.files?.[0]);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      inp.current?.click();
    }
  };

  return (
    <div className="ctl-stack">
      <div
        className={cn("drop", compact && "drop-compact", p.fitSquare && "square-fit", value && "has-image", over && "over")}
        tabIndex={0}
        role="button"
        aria-label={`${title} for ${p.label}. Click or drop an image.`}
        onClick={() => inp.current?.click()}
        onKeyDown={onKey}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        {!value ? (
          <div className="drop-empty">
            {compact ? null : (
              <span className="drop-ic" aria-hidden>
                <ImagePlus className="drop-ic-svg" strokeWidth={1.75} />
              </span>
            )}
            <span className="drop-copy">
              <b>{title}</b>
              {hint ? <small>{hint}</small> : null}
            </span>
          </div>
        ) : (
          <>
            <img src={value} alt={`${p.label} preview`} />
            <div className={cn("drop-bar", compact && "drop-bar-compact")}>
              {compact ? null : (
                <span className="drop-meta">
                  {meta ? `${meta.name} · ${meta.width}×${meta.height} · ${fmtBytes(meta.bytes)}` : "Image attached"}
                </span>
              )}
              <span className="btn-row">
                <button type="button" className="btn small" onClick={(e) => { e.stopPropagation(); inp.current?.click(); }}>Replace</button>
                <button type="button" className="btn small danger" onClick={(e) => { e.stopPropagation(); onChange(null); }}>Remove</button>
              </span>
            </div>
          </>
        )}
      </div>
      <input
        ref={inp}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif"
        className="sr-only"
        aria-label={`Upload ${p.label}`}
        onChange={(e) => take(e.target.files?.[0])}
      />
      <p className="drop-err" role="alert">{err}</p>
    </div>
  );
};

export { ImageControl };
