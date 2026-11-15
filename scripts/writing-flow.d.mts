import type { DraftResult } from '../shared/model';
export function generateWritingDraft(options: {
  context: { product: { affiliateUrl: string; [key: string]: unknown }; approvedEvidence: { id: string; [key: string]: unknown }[]; [key: string]: unknown };
  generate: (type: 'writing' | 'writingEdit', input: any) => Promise<unknown>;
  progress?: (message: string) => Promise<void>;
}): Promise<DraftResult>;
