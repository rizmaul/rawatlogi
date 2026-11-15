import { taskInstructions } from "../shared/prompts.ts";
export const writingPromptVersion = "2026-11-14-rawatlogi-ds-v1";
// Prompt text lives in shared/prompts.ts and can be overridden from Settings.
// Research notes behind the voice rules: docs/writing-voice-research.md.
const defaults = taskInstructions();
export const writingInstructions = defaults.writing;
export const writingEditInstructions = defaults.writingEdit;
