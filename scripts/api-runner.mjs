import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runJobPool } from "./job-pool.mjs";
import { callAI, modelPurposeForJob } from "../shared/ai.ts";
import { schemas, instructions as defaultInstructions } from "./ai-tasks.mjs";
import { generateWritingDraft } from "./writing-flow.mjs";
const api = process.env.STUDIO_API_URL || "http://127.0.0.1:8787";
if (!["localhost", "127.0.0.1"].includes(new URL(api).hostname))
  throw new Error("The local API worker only connects to loopback.");
const vars = await readFile(resolve(".dev.vars"), "utf8").catch(() => "");
const token =
  process.env.LOCAL_RUNNER_TOKEN ||
  vars.match(/^LOCAL_RUNNER_TOKEN\s*=\s*"?([^"\r\n]+)"?/m)?.[1];
if (!token) throw new Error("Run npm run setup first.");
async function request(
  path,
  data,
  method = data === undefined ? "GET" : "POST",
) {
  const r = await fetch(api + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(60000),
  });
  const value = await r.json();
  if (!r.ok) throw new Error(value.error || `Local API returned ${r.status}`);
  return value;
}
const shutdown = new AbortController();
const controllers = new Set();
for (const name of ["SIGINT", "SIGTERM"]) process.on(name, () => {
  shutdown.abort();
  for (const controller of controllers) controller.abort();
});
console.log("API job worker ready. Parallel generation uses the configured concurrency.");
async function processJob(job) {
    const activeController = new AbortController();
    controllers.add(activeController);
    let progress = "Preparing API request";
    let execution;
    const beat = () =>
      request(`/api/runner/${job.id}/heartbeat`, {
        claimToken: job.claimToken,
        progress: (execution ? `${execution.purpose === "content" ? "Content" : "Research"} | ${execution.model} | ${progress}` : progress).slice(0, 200),
      });
    const heartbeat = setInterval(() => void beat().catch(() => {}), 20000);
    const usage = [];
    const retryOptions = { onRetry: async ({retry,maxRetries,delayMs}) => {
      progress = `Gateway timeout: retry ${retry} of ${maxRetries} in ${delayMs / 1000}s`;
      console.log(progress);
      await beat().catch(() => {});
    }};
    try {
      const payload = job.payload;
      const purpose = modelPurposeForJob(payload);
      // Prompts come from Settings (defaults when not overridden) and stay fixed for this job.
      const { prompts, ...config } = await request("/api/runner/config?purpose=" + purpose);
      const instructions = { ...defaultInstructions, ...(prompts ?? {}) };
      execution = { purpose, model: config.model, effort: config.effort };
      const kind = payload.kind || "writing";
      if (kind === "connection-test") {
        progress = "Testing provider connection";
        await beat();
        const answer = await callAI(
          { ...config, maxOutputTokens: 4096 },
          instructions.connectionTest,
          { test: true },
          {
            type: "object",
            additionalProperties: false,
            properties: { ok: { type: "boolean" } },
            required: ["ok"],
          },
          fetch,
          activeController.signal,
          retryOptions,
        );
        if (answer.result?.ok !== true)
          throw new Error(
            "The provider replied but the connectivity test did not match the expected result.",
          );
        await request(`/api/runner/${job.id}/finish`, {
          claimToken: job.claimToken,
          result: { ok: true, model: config.model, effort: config.effort },
          usage: answer.usage,
          execution,
        });
        console.log("API connection test completed.");
        return;
      }
      const context = {
        product: payload.product.data,
        topic: payload.topic ?? { title: payload.angle },
        guidance: payload.guidance ?? payload.angle ?? "",
        approvedEvidence: payload.evidence.map((e) => ({
          id: e.id,
          title: e.data.title,
          url: e.data.url,
          claim: e.data.claim,
          limitations: e.data.limitations,
          access: e.data.access,
        })),
      };
      const generate = async (type, input) => {
        const answer = await callAI(
          config,
          instructions[type],
          input,
          schemas[type],
          fetch,
          activeController.signal,
          retryOptions,
        );
        usage.push({
          step: type,
          purpose,
          usage: answer.usage,
          execution,
          model: answer.model,
          effort: answer.effort,
        });
        return answer.result;
      };
      let result, sources;
      if (kind === "questions") {
        progress = "Generating topic suggestions";
        await beat();
        result = await generate("questions", {
          ...context,
          purpose: payload.purpose,
        });
      } else if (kind === "research") {
        let query = payload.topic?.searchQuery?.trim();
        if (!query) {
          progress = "Planning the research query";
          await beat();
          const plan = await generate("plan", context);
          query =
            typeof plan.query === "string"
              ? plan.query.trim().slice(0, 300)
              : "";
        }
        if (query.length < 3)
          throw new Error(
            "No usable publication search query was produced. Edit the topic and try again.",
          );
        progress = "Retrieving scientific publications";
        await beat();
        const search = await request(
          "/api/research/search?q=" + encodeURIComponent(query),
        );
        sources = search.results;
        progress = "Analyzing retrieved publications";
        await beat();
        result = await generate("research", {
          ...context,
          searchQuery: query,
          publications: sources.map((s) => ({
            ...s,
            abstract: (s.abstract || "").slice(0, 12000),
            access: s.abstract ? "abstract-only" : "metadata-only",
          })),
        });
      } else {
        result = await generateWritingDraft({ context, generate, progress: async (message) => { progress = message; await beat(); } });
      }
      await request(`/api/runner/${job.id}/finish`, {
        claimToken: job.claimToken,
        result,
        ...(sources ? { sources } : {}),
        usage,
        execution,
      });
      console.log(
        `${kind} job completed. Results are available in the dashboard.`,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Generation failed";
      console.error(message);
      await request(`/api/runner/${job.id}/finish`, {
        claimToken: job.claimToken,
        error: message.slice(0, 1800),
      }).catch(() => {});
    } finally {
      clearInterval(heartbeat);
      controllers.delete(activeController);
    }
}
let warned = false;
await runJobPool({
  signal: shutdown.signal,
  getConcurrency: async () => (await request("/api/settings/ai")).workerConcurrency ?? 3,
  claim: async () => { const {job} = await request("/api/runner/claim", {}); warned = false; return job; },
  process: processJob,
  onError: (error) => {
    if (!warned) console.error("Waiting for local API. " + (error instanceof Error ? error.message : "Connection failed"));
    warned = true;
  },
});
