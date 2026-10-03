import type { StudioSession } from "@/types/app";

const DB_NAME = "palette";
const STORE = "studio-sessions";

type Row = { id: string; session: StudioSession };

/**
 * Opens the studio session database.
 *
 * @returns IndexedDB database
 */
const openSessions = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

/**
 * Resolves an IndexedDB request.
 *
 * @param request - Request to wait for
 * @returns The request result
 */
const requestResult = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

/**
 * Reads every saved studio workspace.
 *
 * @returns Sessions keyed by template id
 */
const readStudioSessions = async () => {
  try {
    const db = await openSessions();
    const rows = await requestResult(db.transaction(STORE, "readonly").objectStore(STORE).getAll() as IDBRequest<Row[]>);
    db.close();
    const sessions: Record<string, StudioSession> = {};
    for (const row of rows) sessions[row.id] = row.session;
    return sessions;
  } catch {
    return {};
  }
};

/**
 * Stores one template's uploads, stack, and preview.
 *
 * @param id - Template id
 * @param session - Workspace to keep across refresh
 */
const writeStudioSession = async (id: string, session: StudioSession) => {
  try {
    const db = await openSessions();
    await requestResult(db.transaction(STORE, "readwrite").objectStore(STORE).put({ id, session }));
    db.close();
  } catch {
    /* The in-memory session still applies for this page load. */
  }
};

/**
 * Forgets one template's saved workspace.
 *
 * @param id - Template id
 */
const deleteStudioSession = async (id: string) => {
  try {
    const db = await openSessions();
    await requestResult(db.transaction(STORE, "readwrite").objectStore(STORE).delete(id));
    db.close();
  } catch {
    /* The in-memory reset still applies for this page load. */
  }
};

export { readStudioSessions, writeStudioSession, deleteStudioSession };
