import { z } from "zod";
export const topicSchema = z.object({
  title: z.string().trim().min(3).max(300),
  question: z.string().trim().max(2000).default(""),
  searchQuery: z.string().trim().max(300).default(""),
  rationale: z.string().trim().max(2000).default(""),
});
export const questionsResultSchema = z
  .object({
    topics: z.array(topicSchema).min(1).max(10),
    warnings: z.array(z.string().max(2000)).max(20),
  })
  .strict();
export const researchResultSchema = z
  .object({
    summary: z.string().min(1).max(20000),
    findings: z
      .array(
        z
          .object({
            claim: z.string().max(4000),
            sourceIds: z.array(z.string()).max(12),
            confidence: z.enum(["supported", "uncertain", "unsupported"]),
            limitations: z.string().max(4000),
          })
          .strict(),
      )
      .max(20),
    nextSteps: z.array(z.string().max(3000)).max(12),
    warnings: z.array(z.string().max(3000)).max(20),
  })
  .strict();
export const sessionRequestSchema = z.object({
  kind: z.enum(["research", "writing"]),
  productId: z.string().min(1),
  guidance: z.string().trim().max(4000).default(""),
  topics: z.array(topicSchema).min(1).max(10),
});
export type Topic = z.infer<typeof topicSchema>;
export type SessionKind = "research" | "writing";
export type SessionStatus = "queued" | "in_progress" | "completed" | "failed";
export type ResearchReport = z.infer<typeof researchResultSchema>;
export type Publication = {
  title: string;
  sourceId: string;
  year: string;
  authors: string;
  abstract: string;
  studyType: string;
  url: string;
  fullTextUrl?: string | null;
};
export type TopicSession = {
  id: string;
  kind: SessionKind;
  productId: string;
  topic: Topic;
  guidance: string;
  status: SessionStatus;
  progress: string;
  jobId: string;
  result: ((ResearchReport | { postIds: string[]; warnings?: string[] }) & { execution?: import('./ai').AIExecution; author?: string }) | null;
  sources: Publication[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
};
