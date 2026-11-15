import { parseWritingCandidate, writingContractIssues, validateWritingResult, writingBudgets } from '../shared/writing.ts';
import { writingPromptVersion } from './writing-prompts.mjs';

export async function generateWritingDraft({ context, generate, progress = async () => {} }) {
  const allowed = context.approvedEvidence.map(source => source.id);
  const platformBudgets = writingBudgets(context.product.affiliateUrl);
  if (platformBudgets.threads.remainingWithDisclosure < 0) throw new Error('The affiliate URL plus disclosure exceeds Threads\' 500-character limit. Update the product with a shorter official affiliate link before generating.');
  await progress('Writing a conversational first draft');
  const input = {...context, platformBudgets};
  const candidateDraft = parseWritingCandidate(await generate('writing', input));
  await progress('Editing for natural voice, evidence fit, and platform limits');
  let edited = parseWritingCandidate(await generate('writingEdit', {
    ...input,
    candidateDraft,
    contractIssues: writingContractIssues(candidateDraft, context.product.affiliateUrl, allowed),
    promptVersion: writingPromptVersion,
  }));
  const issues = writingContractIssues(edited, context.product.affiliateUrl, allowed);
  if (issues.length) {
    await progress('Repairing draft link, disclosure, or length issues');
    edited = parseWritingCandidate(await generate('writingEdit', {
      ...input, candidateDraft: edited, contractIssues: issues,
      repairOnly: true, promptVersion: writingPromptVersion,
    }));
  }
  const final = validateWritingResult(edited, context.product.affiliateUrl, allowed);
  // Warnings from the first pass are retained conservatively for human review.
  final.warnings = [...new Set([...candidateDraft.warnings, ...final.warnings,
    ...(allowed.length ? [] : ['Belum ada bukti yang disetujui; draf tidak boleh memuat klaim manfaat atau efektivitas.']),
  ])].slice(0, 30);
  return final;
}
