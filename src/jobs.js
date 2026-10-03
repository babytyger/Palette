// Generation job queue. Each job is one JSON file in data/jobs/.
// Status flow: pending -> running -> done | failed
import fs from "node:fs/promises";
import path from "node:path";
const JOBS_DIR = path.resolve(process.env.DATA_DIR || "data", "jobs");

export async function createJob(data) {
  await fs.mkdir(JOBS_DIR, { recursive: true });
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const job = { id, status: "pending", createdAt: new Date().toISOString(), ...data, result: null, error: null };
  await fs.writeFile(path.join(JOBS_DIR, `${id}.json`), JSON.stringify(job));
  return job;
}

export async function updateJob(id, patch) {
  const file = path.join(JOBS_DIR, `${id}.json`);
  const job = JSON.parse(await fs.readFile(file, "utf8"));
  const updated = { ...job, ...patch, updatedAt: new Date().toISOString() };
  await fs.writeFile(file, JSON.stringify(updated));
  return updated;
}

export async function getJob(id) {
  try { return JSON.parse(await fs.readFile(path.join(JOBS_DIR, `${id}.json`), "utf8")); }
  catch { return null; }
}

export async function listJobs(limit = 50) {
  await fs.mkdir(JOBS_DIR, { recursive: true });
  const files = (await fs.readdir(JOBS_DIR)).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, limit);
  return Promise.all(files.map(async (f) => {
    try { return JSON.parse(await fs.readFile(path.join(JOBS_DIR, f), "utf8")); }
    catch { return null; }
  })).then((r) => r.filter(Boolean));
}

/**
 * Deletes job records by id. Ids that are not on disk are skipped.
 *
 * @param ids - Job ids chosen in Recent designs
 * @returns Ids that were removed
 */
const deleteJobs = async (ids) => {
  const unique = [...new Set(ids)].filter((id) => typeof id === "string" && /^[A-Za-z0-9_-]+$/.test(id));
  const removed = [];
  for (const id of unique) {
    try {
      await fs.unlink(path.join(JOBS_DIR, `${id}.json`));
      removed.push(id);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
  return removed;
};

export { deleteJobs };
