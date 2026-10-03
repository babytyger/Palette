import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useApp } from "@/context/AppContext";
import { tryJson } from "@/db/api";
import { publicTemplates } from "@/util/params";
import { templateMark } from "@/util/format";
import { cn } from "@/util/cn";
import type { Job } from "@/types/app";

type Props = {
  onOpen: (id: string) => void;
  onEditThemes: () => void;
  onJobs: () => void;
};

/**
 * Themes gallery with poster cards and a recent-designs strip.
 *
 * @param props.onOpen - Open a template in studio
 * @param props.onEditThemes - Opens the locked theme editor
 * @param props.onJobs - Open the full recent-designs page
 */
const Themes = ({ onOpen, onEditThemes, onJobs }: Props) => {
  const app = useApp();
  const [query, setQuery] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();
  const items = publicTemplates(app.registry).filter((t) => {
    if (!q) return true;
    return [t.name, t.description, t.category].filter(Boolean).join(" ").toLowerCase().includes(q);
  });
  const recent = ((app.registry._jobs || []) as Job[]).filter((j) => j.result?.imageUrl);

  useEffect(() => {
    if (app.mode !== "server") return;
    let alive = true;
    const load = async () => {
      const list = await tryJson("api/jobs?limit=24");
      if (alive && list) app.setRegistry((r) => ({ ...r, _jobs: list }));
    };
    load();
    return () => { alive = false; };
  }, [app.mode]);

  /**
   * Slides the recent-designs strip.
   *
   * @param dir - -1 for previous, 1 for next
   */
  const slide = (dir: number) => {
    scroller.current?.scrollBy({ left: dir * 240, behavior: "smooth" });
  };

  return (
    <>
      <PageHeader
        title="Themes"
        subtitle="Start from a template."
        actions={
          <>
            <label className="theme-search">
              <Search size={15} aria-hidden />
              <input
                type="text"
                placeholder="Search themes"
                aria-label="Search themes"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <button className="btn ink" type="button" onClick={onEditThemes}>Edit themes</button>
          </>
        }
      />
      {!items.length ? (
        <p className="empty-copy">{q ? "No themes match that search." : "No themes yet. Use Edit themes to add one."}</p>
      ) : (
        <div className="tpl-grid">
          {items.map((t) => (
            <button key={t.id} type="button" className={cn("tpl-card", !t.referenceImage && "tpl-card-plain")} onClick={() => onOpen(t.id)}>
              <div className="tpl-thumb">
                {t.referenceImage ? <img src={t.referenceImage} alt="" /> : <span className="tpl-mark">{templateMark(t)}</span>}
              </div>
              <span className="tpl-cat">{t.category || "Custom"}</span>
              <span className="tpl-name">{t.name}</span>
            </button>
          ))}
        </div>
      )}
      <section className="recent-strip">
        <div className="recent-head">
          <h2>Recent designs</h2>
          <div className="recent-actions">
            <button className="recent-view" type="button" onClick={onJobs}>View all</button>
            <button className="recent-arrow" type="button" aria-label="Previous designs" onClick={() => slide(-1)}>
              <ChevronLeft size={16} />
            </button>
            <button className="recent-arrow" type="button" aria-label="Next designs" onClick={() => slide(1)}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        {!recent.length ? (
          <p className="empty-copy">No designs yet. Your generated designs will appear here.</p>
        ) : (
          <div className="recent-scroller" ref={scroller}>
            {recent.map((j) => (
              <button
                key={j.id}
                type="button"
                className="recent-thumb"
                onClick={() => j.result?.imageUrl && window.open(j.result.imageUrl)}
              >
                <img src={j.result?.imageUrl} alt={j.templateName || "Recent design"} />
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );
};

export { Themes };
