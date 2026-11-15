import { draftResultSchema, weightedLength, limitFor, hasDisclosure, type DraftResult } from './model.ts';
import { evidenceLevelIssue } from './brand.ts';

export function writingContractIssues(result: DraftResult, affiliateUrl: string, allowedSourceIds: string[]) {
  const issues: string[] = [];
  const allowed = new Set(allowedSourceIds);
  if (result.sourceIds.some(id => !allowed.has(id))) issues.push('Only cite supplied approved evidence IDs.');
  const levelIssue = evidenceLevelIssue(result.evidenceLevel, result.sourceIds);
  if (levelIssue) issues.push(levelIssue);
  for (const platform of ['x', 'threads'] as const) {
    const segments = result[platform];
    if (segments.length > 4) issues.push(`${platform}: use at most four segments.`);
    segments.forEach((text,index) => { const length=weightedLength(text,platform); if(length>limitFor(platform)) issues.push(`${platform}: shorten segment ${index+1} from ${length} to at most ${limitFor(platform)} characters (remove at least ${length-limitFor(platform)}).`); });
    const links = segments.flatMap(text => text.match(/https?:\/\/[^\s]+/g) ?? []);
    if (links.length !== 1 || links[0] !== affiliateUrl) issues.push(`${platform}: include only the exact product affiliate URL, once.`);
    if (!segments.some(text => text.includes(affiliateUrl) && hasDisclosure(text))) issues.push(`${platform}: put a clear afiliasi disclosure in the link segment.`);
  }
  return issues;
}

export function writingBudgets(affiliateUrl: string) {
  return Object.fromEntries((['x','threads'] as const).map(platform=>[platform,{
    segmentLimit:limitFor(platform),
    affiliateLinkLength:weightedLength(affiliateUrl,platform),
    remainingWithDisclosure:limitFor(platform)-weightedLength('Tautan afiliasi: '+affiliateUrl,platform),
    minimalLinkSegment:'Tautan afiliasi: '+affiliateUrl,
  }]));
}

export function parseWritingCandidate(value: unknown) { return draftResultSchema.parse(value); }
export function validateWritingResult(value: unknown, affiliateUrl: string, allowedSourceIds: string[]) {
  const result = parseWritingCandidate(value);
  const issues = writingContractIssues(result, affiliateUrl, allowedSourceIds);
  if (issues.length) throw new Error('Draft contract check failed: ' + issues.join(' '));
  return result;
}

