import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/components/Toast";
import { deleteTemplate, storeTemplate } from "@/db/api";
import { tmplList } from "@/util/params";
import { templateMark } from "@/util/format";
import type { Template } from "@/types/app";

type Props = {
  onBack: () => void;
  onAdd: () => void;
  onEdit: (id: string) => void;
};

/**
 * Locked workspace for adding, editing, archiving, and deleting themes.
 *
 * @param props.onBack - Returns to the public gallery
 * @param props.onAdd - Opens a blank theme editor
 * @param props.onEdit - Opens the editor for one theme
 */
const EditThemes = ({ onBack, onAdd, onEdit }: Props) => {
  const app = useApp();
  const toast = useToast();
  const [pendingDelete, setPendingDelete] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const themes = tmplList(app.registry).sort((a, b) => a.name.localeCompare(b.name));
  const active = themes.filter((t) => !t.archived);
  const archived = themes.filter((t) => t.archived);

  useEffect(() => {
    if (!pendingDelete) return;
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deleting) setPendingDelete(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingDelete, deleting]);

  /**
   * Saves the archived flag and updates the gallery list.
   *
   * @param theme - Theme to change
   * @param archived - Whether it leaves the public gallery
   */
  const setArchived = async (theme: Template, archived: boolean) => {
    try {
      const saved = await storeTemplate({ ...theme, archived }, app.mode, app.registry);
      app.setRegistry((r) => ({ ...r, templates: { ...r.templates, [saved.id]: saved } }));
      toast(archived ? `Archived ${theme.name}.` : `Restored ${theme.name}.`);
    } catch (error: any) {
      toast(error.message || "Could not update that theme.", "error");
    }
  };

  /**
   * Deletes the theme named in the confirm dialog.
   */
  const removePending = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteTemplate(pendingDelete.id, app.mode);
      const id = pendingDelete.id;
      app.setRegistry((r) => {
        const templates = { ...r.templates };
        delete templates[id];
        return { ...r, templates };
      });
      toast(`Deleted ${pendingDelete.name}.`);
      setPendingDelete(null);
    } catch (error: any) {
      toast(error.message || "Could not delete.", "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Edit themes"
        subtitle="Add a theme, or change, archive, and delete the ones you have."
        actions={
          <>
            <button className="btn" type="button" onClick={onBack}>Back to themes</button>
            <button className="btn ink" type="button" onClick={onAdd}>Add theme</button>
          </>
        }
      />
      <h2 className="theme-edit-group">Active</h2>
      {!active.length ? (
        <p className="empty-copy">No active themes.</p>
      ) : (
        <div className="theme-edit-list">
          {active.map((theme) => (
            <ThemeRow
              key={theme.id}
              theme={theme}
              onEdit={() => onEdit(theme.id)}
              onArchive={() => setArchived(theme, true)}
              onDelete={() => setPendingDelete(theme)}
            />
          ))}
        </div>
      )}
      <h2 className="theme-edit-group">Archived</h2>
      {!archived.length ? (
        <p className="empty-copy">No archived themes.</p>
      ) : (
        <div className="theme-edit-list">
          {archived.map((theme) => (
            <ThemeRow
              key={theme.id}
              theme={theme}
              archived
              onEdit={() => onEdit(theme.id)}
              onRestore={() => setArchived(theme, false)}
              onDelete={() => setPendingDelete(theme)}
            />
          ))}
        </div>
      )}
      {pendingDelete ? (
        <div className="modal-root open">
          <div className="modal-scrim" onClick={() => !deleting && setPendingDelete(null)} />
          <div className="confirm-pop" role="dialog" aria-modal="true" aria-labelledby="delete-theme-title">
            <h2 id="delete-theme-title">Delete {pendingDelete.name}?</h2>
            <p>This removes the theme. Generated designs stay in Recent designs.</p>
            <div className="confirm-actions">
              <button ref={cancelRef} className="btn" type="button" disabled={deleting} onClick={() => setPendingDelete(null)}>Cancel</button>
              <button className="btn danger" type="button" disabled={deleting} onClick={removePending}>Delete</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

type RowProps = {
  theme: Template;
  archived?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
};

/**
 * One theme row in the edit list.
 *
 * @param props.theme - Theme to show
 * @param props.archived - Whether the row is in the archived group
 * @param props.onEdit - Opens the editor
 * @param props.onDelete - Asks before deleting
 * @param props.onArchive - Hides the theme from the gallery
 * @param props.onRestore - Returns the theme to the gallery
 */
const ThemeRow = ({ theme, archived, onEdit, onDelete, onArchive, onRestore }: RowProps) => (
  <div className="theme-edit-row">
    <div className="theme-edit-thumb">
      {theme.referenceImage ? (
        <img src={theme.referenceImage} alt="" />
      ) : (
        <span>{templateMark(theme)}</span>
      )}
    </div>
    <div className="theme-edit-copy">
      <h3>{theme.name}</h3>
      <small>{theme.category || "Custom"}</small>
    </div>
    <div className="theme-edit-actions">
      <button className="btn" type="button" onClick={onEdit}>Edit</button>
      {archived ? (
        <button className="btn" type="button" onClick={onRestore}>Restore</button>
      ) : (
        <button className="btn" type="button" onClick={onArchive}>Archive</button>
      )}
      <button className="btn danger" type="button" onClick={onDelete}>Delete</button>
    </div>
  </div>
);

export { EditThemes };
