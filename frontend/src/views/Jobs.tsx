import { useEffect, useMemo, useRef, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/components/Toast";
import { useApp } from "@/context/AppContext";
import { deleteJobs, tryJson } from "@/db/api";
import { relativeTime } from "@/util/format";
import { cn } from "@/util/cn";
import type { Job } from "@/types/app";

type Filter = "all" | "today" | "week";

/**
 * Returns whether a job falls inside the active date filter.
 *
 * @param job - Job row
 * @param filter - All, today, or this week
 */
const matchesFilter = (job: Job, filter: Filter) => {
  if (filter === "all") return true;
  const t = new Date(job.createdAt || 0).getTime();
  if (!Number.isFinite(t)) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (filter === "today") return t >= start.getTime();
  const week = new Date(start);
  week.setDate(week.getDate() - 6);
  return t >= week.getTime();
};

/**
 * Recent designs grid with All / Today / This week filters.
 */
const Jobs = () => {
  const { mode, registry, setRegistry } = useApp();
  const toast = useToast();
  const [jobs, setJobs] = useState<Job[]>(registry._jobs || []);
  const [filter, setFilter] = useState<Filter>("all");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (mode === "server") {
        const list = await tryJson("api/jobs?limit=100");
        if (alive && list) {
          setJobs(list);
          setRegistry((r) => ({ ...r, _jobs: list }));
        }
      } else setJobs(registry._jobs || []);
    };
    load();
    const t = setInterval(load, 8000);
    return () => { alive = false; clearInterval(t); };
  }, [mode]);

  const visible = useMemo(() => jobs.filter((j) => matchesFilter(j, filter)), [jobs, filter]);

  /**
   * Turns multi-select on or clears the current selection.
   */
  const toggleSelecting = () => {
    setSelecting((on) => !on);
    setSelected(new Set());
    setConfirming(false);
  };

  useEffect(() => {
    if (!confirming) return;
    cancelRef.current?.focus();
    /**
     * Closes the confirmation when Escape is pressed.
     *
     * @param event - Keyboard event
     */
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deleting) setConfirming(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming, deleting]);

  /**
   * Adds or removes one design from the selection.
   *
   * @param id - Job id
   */
  const toggleSelected = (id: string) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /**
   * Deletes the selected designs and drops them from the list.
   */
  const removeSelected = async () => {
    const ids = [...selected];
    if (!ids.length || deleting) return;
    setDeleting(true);
    try {
      const removed = mode === "server" ? await deleteJobs(ids) : ids;
      const drop = new Set(removed);
      const next = jobs.filter((job) => !drop.has(job.id));
      setJobs(next);
      setRegistry((r) => ({ ...r, _jobs: (r._jobs || []).filter((job: Job) => !drop.has(job.id)) }));
      setSelected(new Set());
      setSelecting(false);
      setConfirming(false);
      toast(removed.length === 1 ? "Deleted 1 design." : `Deleted ${removed.length} designs.`);
    } catch (err: any) {
      toast(err.message || "Could not delete.", "error");
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Reloads jobs from the API or demo registry.
   */
  const refresh = async () => {
    if (mode === "server") {
      const list = await tryJson("api/jobs?limit=100");
      if (list) {
        setJobs(list);
        setRegistry((r) => ({ ...r, _jobs: list }));
      }
    } else setJobs([...(registry._jobs || [])]);
  };

  return (
    <>
      <PageHeader
        title="Recent designs"
        subtitle={selecting && selected.size ? `${selected.size} selected` : `${visible.length} design${visible.length === 1 ? "" : "s"}`}
        actions={
          <div className="filter-row">
            <button
              type="button"
              className={cn("filter-chip", selecting && "active")}
              onClick={toggleSelecting}
            >
              {selecting ? "Cancel" : "Select"}
            </button>
            {selecting ? (
              <button className="btn small danger" type="button" disabled={!selected.size || deleting} onClick={() => setConfirming(true)}>
                {selected.size ? `Delete ${selected.size}` : "Delete"}
              </button>
            ) : null}
            {(["all", "today", "week"] as Filter[]).map((id) => (
              <button
                key={id}
                type="button"
                className={cn("filter-chip", filter === id && "active")}
                onClick={() => setFilter(id)}
              >
                {id === "all" ? "All" : id === "today" ? "Today" : "This week"}
              </button>
            ))}
            <button className="icon-btn" type="button" aria-label="Refresh designs" onClick={refresh}>
              <RefreshCw size={14} />
            </button>
          </div>
        }
      />
      {!visible.length ? (
        <p className="empty-copy">No designs yet. Your generated designs will appear here.</p>
      ) : (
        <div className="job-grid">
          {visible.map((j) => {
            const imgUrl = j.result?.imageUrl;
            const failed = j.status === "failed" || (!imgUrl && j.status === "done");
            return (
              <button
                key={j.id}
                className={cn("job-card", selecting && "is-selecting", selected.has(j.id) && "is-selected")}
                type="button"
                aria-pressed={selecting ? selected.has(j.id) : undefined}
                onClick={() => selecting ? toggleSelected(j.id) : imgUrl && window.open(imgUrl)}
              >
                <div className="job-thumb">
                  {selecting ? (
                    <span className="job-check" aria-hidden>
                      {selected.has(j.id) ? <Check size={12} /> : null}
                    </span>
                  ) : null}
                  {imgUrl ? <img src={imgUrl} alt="" /> : j.status === "running" || j.status === "pending" ? <span className="spinner" /> : <span className="job-empty-mark" />}
                  {j.result?.cached ? <span className="job-overlay">Cached</span> : null}
                  {failed && !imgUrl ? <span className="job-overlay dim">No API key</span> : null}
                </div>
                <div className="job-info">
                  <b>{j.templateName || j.templateId || "Unknown template"}</b>
                  <small>{[relativeTime(j.createdAt), j.size].filter(Boolean).join(" · ")}</small>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {confirming ? (
        <div className="modal-root open">
          <div className="modal-scrim" onClick={() => !deleting && setConfirming(false)} />
          <div className="confirm-pop" role="dialog" aria-modal="true" aria-labelledby="delete-designs-title">
            <h2 id="delete-designs-title">Delete {selected.size} design{selected.size === 1 ? "" : "s"}?</h2>
            <p>The selected designs will be removed from Recent designs.</p>
            <div className="confirm-actions">
              <button ref={cancelRef} className="btn" type="button" disabled={deleting} onClick={() => setConfirming(false)}>Cancel</button>
              <button className="btn danger" type="button" disabled={deleting} onClick={removeSelected}>Delete</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export { Jobs };
