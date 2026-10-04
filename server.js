// Palette Admin backend.
// Templates are editable JSON files. The admin panel lets you view, edit and generate.
// Flow: select template -> fill param values -> add components -> compile prompt -> generate image -> job result.
import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compilePrompt, cacheKeyPayload, validateTemplate, validateComponent, paramsFromConfig } from "./src/compiler.js";
import { loadTemplates, getTemplate, saveTemplate, deleteTemplate, loadComponents, saveComponent, deleteComponent } from "./src/registry.js";
import { createJob, updateJob, getJob, listJobs, deleteJobs } from "./src/jobs.js";
import { generateImage, MODEL, QUALITY, MOCK, OUTPUT_SIZE } from "./src/imageClient.js";
import { getCached, saveCached, saveImageFile, sha256 } from "./src/cache.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// Two full-size phone photos as base64 can pass 30 MB, so allow up to 100 MB.
app.use(express.json({ limit: "100mb" }));
app.use("/images", express.static(path.join(__dirname, "data", "images")));
app.use("/references", express.static(path.join(__dirname, "data", "references")));

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const info = () => ({ model: MOCK ? "mock" : MODEL, quality: QUALITY, mock: MOCK });

// ── Templates ────────────────────────────────────────────────────────────────

// Full registry used by the admin panel to build its UI.
app.get("/api/registry", wrap(async (req, res) => {
  const [templates, components] = await Promise.all([loadTemplates(), loadComponents()]);
  res.json({ templates, components, engine: info() });
}));

app.get("/api/templates", wrap(async (req, res) => {
  const templates = await loadTemplates();
  res.json(Object.values(templates));
}));

app.get("/api/templates/:id", wrap(async (req, res) => {
  const t = await getTemplate(req.params.id);
  if (!t) return res.status(404).json({ error: `No template called ${req.params.id}.` });
  res.json(t);
}));

app.put("/api/templates/:id", wrap(async (req, res) => {
  if (req.body?.id !== req.params.id) return res.status(400).json({ error: "The id in the URL must match the id in the body." });
  const result = await saveTemplate(req.body);
  res.status(result.created ? 201 : 200).json(result);
}));

app.delete("/api/templates/:id", wrap(async (req, res) => {
  await deleteTemplate(req.params.id);
  res.json({ deleted: req.params.id });
}));

// ── Components ───────────────────────────────────────────────────────────────

app.get("/api/components", wrap(async (req, res) => {
  res.json(Object.values(await loadComponents()));
}));

app.put("/api/components/:id", wrap(async (req, res) => {
  if (req.body?.id !== req.params.id) return res.status(400).json({ error: "The id in the URL must match the id in the body." });
  const result = await saveComponent(req.body);
  res.status(result.created ? 201 : 200).json(result);
}));

app.delete("/api/components/:id", wrap(async (req, res) => {
  await deleteComponent(req.params.id);
  res.json({ deleted: req.params.id });
}));

app.post("/api/components/validate", (req, res) => {
  const errors = validateComponent(req.body);
  res.json({ valid: !errors.length, errors });
});

/**
 * Loads the template and component library, then compiles the prompt.
 *
 * @param {{ templateId?: string, values?: Record<string, unknown>, components?: Array<{ id: string, values?: Record<string, unknown> }> }} body
 * @returns {Promise<{ template: object, values: Record<string, unknown>, compiled: object }>}
 */
const compileRequest = async (body) => {
  const { templateId, values = {}, components = [] } = body || {};
  if (!templateId) throw Object.assign(new Error("Pass templateId and values."), { status: 400 });
  if (!Array.isArray(components)) throw Object.assign(new Error("components must be an array of { id, values }."), { status: 400 });
  const [template, library] = await Promise.all([getTemplate(templateId), loadComponents()]);
  if (!template) throw Object.assign(new Error(`No template called ${templateId}.`), { status: 404 });
  return { template, values, compiled: compilePrompt(template, values, { components, library }) };
};

/**
 * Runs cache lookup or image generation and waits until the job is done or failed.
 *
 * @param {object} job - Pending job created for this request
 * @param {object} compiled - Compiled prompt from the template and components
 * @param {{ templateId: string, cacheKey: string, size: string, exportSize: unknown, images: Array<{ label: string, dataUrl: string }> }} ctx
 * @param onPartial - Saves and forwards each streamed preview
 * @returns {Promise<object>} The job after it reaches `done` or `failed`
 */
const completeGenerationJob = async (job, compiled, ctx, onPartial) => {
  const { templateId, cacheKey, size, exportSize, images } = ctx;
  try {
    await updateJob(job.id, { status: "running" });
    const cached = await getCached(cacheKey);
    if (cached) {
      return await updateJob(job.id, { status: "done", result: { ...cached, cached: true } });
    }
    const image = await generateImage({
      prompt: compiled.prompt,
      size,
      images,
      onPartial: async (partial) => {
        const url = await saveImageFile(`${job.id}-partial-${partial.index}`, partial.b64, partial.mime);
        if (onPartial) await onPartial({ index: partial.index, url });
      }
    });
    const record = await saveCached(cacheKey, image, {
      templateId,
      prompt: compiled.prompt,
      parts: compiled.parts,
      components: compiled.components.map((c) => c.id),
      size,
      exportSize,
      warnings: compiled.warnings,
      ...info()
    });
    return await updateJob(job.id, { status: "done", result: { ...record, cached: false } });
  } catch (err) {
    return await updateJob(job.id, { status: "failed", error: err.message });
  }
};

// ── Compile (free – no AI call) ───────────────────────────────────────────────

app.post("/api/compile", wrap(async (req, res) => {
  const { compiled, values } = await compileRequest(req.body);
  const imageHashes = Object.entries(values)
    .filter(([, v]) => typeof v === "string" && v.startsWith("data:image"))
    .map(([, v]) => sha256(v));
  const key = sha256(cacheKeyPayload(compiled, { model: MOCK ? "mock" : MODEL, quality: QUALITY, size: OUTPUT_SIZE, imageHashes }));
  const cached = Boolean(await getCached(key));
  res.json({ ...compiled, cacheKey: key, cached, engine: info() });
}));

// ── Generate ──────────────────────────────────────────────────────────────────

// POST /api/generate
// Body: { templateId, values: { paramId: value | dataURL }, components: [{ id, values }] }
// Streams partial previews, then the finished job.
app.post("/api/generate", wrap(async (req, res) => {
  const { template, values, compiled } = await compileRequest(req.body);
  const templateId = template.id;
  if (compiled.missingImages.length) {
    return res.status(400).json({ error: `Upload ${compiled.missingImages.join(" and ")} before generating.` });
  }

  // Collect image files in param order
  const imageParams = paramsFromConfig(template.config, template.systemPrompt).filter((p) => p.type === "image");
  const images = imageParams.map((p) => ({
    label: p.providerImageName || p.label || p.id,
    dataUrl: values[p.id] || values[p.configPath] || null
  })).filter((im) => im.dataUrl);

  const imageHashes = images.map((im) => sha256(im.dataUrl));
  const cacheKey = sha256(cacheKeyPayload(compiled, { model: MOCK ? "mock" : MODEL, quality: QUALITY, size: OUTPUT_SIZE, imageHashes }));

  const job = await createJob({
    templateId,
    templateName: template.name,
    prompt: compiled.prompt,
    parts: compiled.parts,
    components: compiled.components.map((c) => ({ id: c.id, name: c.name, scope: c.scope, parts: c.parts })),
    warnings: compiled.warnings,
    cacheKey,
    size: OUTPUT_SIZE,
    exportSize: [1024, 1024]
  });

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  let closed = false;
  res.on("close", () => { closed = true; });
  /**
   * Writes one server-sent event unless the browser has disconnected.
   *
   * @param event - Event name
   * @param data - JSON payload
   */
  const send = (event, data) => {
    if (closed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  send("status", { status: "queued", id: job.id });
  try {
    const finished = await completeGenerationJob(job, compiled, {
      templateId,
      cacheKey,
      size: OUTPUT_SIZE,
      exportSize: [1024, 1024],
      images
    }, async (partial) => send("partial", partial));
    if (finished.status === "failed") send("error", { error: finished.error || "Generation failed." });
    else send("done", finished);
  } catch (err) {
    send("error", { error: err.message || "Generation failed." });
  }
  res.end();
}));

// ── Jobs ─────────────────────────────────────────────────────────────────────

app.get("/api/jobs", wrap(async (req, res) => {
  res.json(await listJobs(Number(req.query.limit) || 50));
}));

app.get("/api/jobs/:id", wrap(async (req, res) => {
  const job = await getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found." });
  res.json(job);
}));

app.delete("/api/jobs", wrap(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) return res.status(400).json({ error: "Choose at least one design." });
  res.json({ removed: await deleteJobs(ids) });
}));

// ── Validate a template definition ───────────────────────────────────────────

app.post("/api/validate", (req, res) => {
  const errors = validateTemplate(req.body);
  res.json({ valid: !errors.length, errors });
});

// ── Error handler ─────────────────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message, errors: err.errors });
});

const PORT = Number(process.env.PORT || 3001);

if (process.env.DEV === "1") {
  const { createServer } = await import("vite");
  const vite = await createServer({
    configFile: path.join(__dirname, "frontend/vite.config.ts"),
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(__dirname, "public")));
}

app.listen(PORT, () => {
  console.log(`Palette Admin running at http://localhost:${PORT}`);
  console.log(MOCK ? "Mock mode — no API calls." : `Model: ${MODEL}, quality: ${QUALITY}`);
});
