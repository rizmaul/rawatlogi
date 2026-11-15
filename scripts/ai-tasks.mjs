import { taskInstructions } from "../shared/prompts.ts";
const strings = { type: "array", items: { type: "string" } };
const topic = {
  type: "object",
  additionalProperties: false,
  required: ["title", "question", "searchQuery", "rationale"],
  properties: {
    title: { type: "string" },
    question: { type: "string" },
    searchQuery: { type: "string" },
    rationale: { type: "string" },
  },
};
export const schemas = {
  questions: {
    type: "object",
    additionalProperties: false,
    required: ["topics", "warnings"],
    properties: {
      topics: { type: "array", minItems: 1, maxItems: 10, items: topic },
      warnings: strings,
    },
  },
  plan: {
    type: "object",
    additionalProperties: false,
    required: ["query"],
    properties: { query: { type: "string" } },
  },
  research: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "findings", "nextSteps", "warnings"],
    properties: {
      summary: { type: "string" },
      findings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["claim", "sourceIds", "confidence", "limitations"],
          properties: {
            claim: { type: "string" },
            sourceIds: strings,
            confidence: {
              type: "string",
              enum: ["supported", "uncertain", "unsupported"],
            },
            limitations: { type: "string" },
          },
        },
      },
      nextSteps: strings,
      warnings: strings,
    },
  },
  writing: {
    type: "object",
    additionalProperties: false,
    required: ["title", "x", "threads", "sourceIds", "warnings", "area", "evidenceLevel", "series"],
    properties: {
      title: { type: "string" },
      x: strings,
      threads: strings,
      sourceIds: strings,
      warnings: strings,
      area: { type: "string", enum: ["rambut", "kulit", "gigi", "mata", "badan"] },
      evidenceLevel: { type: "string", enum: ["riset-kuat", "riset-terbatas", "ilustrasi-konsep", "belum-ada-riset"] },
      series: { type: "string", enum: ["cek-kandungan", "mitos-atau-riset", "kata-studi", "pilih-yang-mana", "rutin-masuk-akal"] },
    },
  },
};
// Defaults only. The runner uses taskInstructions(overrides) with prompts saved in Settings.
export const instructions = taskInstructions();
schemas.writingEdit = schemas.writing;
