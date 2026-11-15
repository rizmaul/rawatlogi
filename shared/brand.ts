// Rawatlogi design-system vocabulary used by prompts, validation, the UI and MCP.
// Source of truth: brand/design-system/README.md and content-playbook.md.
export const areas = {
  rambut: { label: "Rambut", hashtag: "#perawatanrambut" },
  kulit: { label: "Kulit", hashtag: "#skincareindonesia" },
  gigi: { label: "Gigi & mulut", hashtag: "#kesehatangigi" },
  mata: { label: "Mata", hashtag: "#perawatanmata" },
  badan: { label: "Badan & kuku", hashtag: "#perawatantubuh" },
} as const;
export const evidenceLevels = {
  "riset-kuat": { label: "Riset kuat", needsEvidence: true },
  "riset-terbatas": { label: "Riset terbatas", needsEvidence: true },
  "ilustrasi-konsep": { label: "Ilustrasi konsep", needsEvidence: false },
  "belum-ada-riset": { label: "Belum ada riset", needsEvidence: false },
} as const;
export const series = {
  "cek-kandungan": { label: "Cek Kandungan", hashtag: "#cekkandungan" },
  "mitos-atau-riset": { label: "Mitos atau Riset?", hashtag: "#mitosatauriset" },
  "kata-studi": { label: "Kata Studi", hashtag: "#katastudi" },
  "pilih-yang-mana": { label: "Pilih yang Mana", hashtag: "#pilihyangmana" },
  "rutin-masuk-akal": { label: "Rutin Masuk Akal", hashtag: "#rutinmasukakal" },
} as const;
export type Area = keyof typeof areas;
export type EvidenceLevel = keyof typeof evidenceLevels;
export type Series = keyof typeof series;
export const areaKeys = Object.keys(areas) as Area[];
export const evidenceLevelKeys = Object.keys(evidenceLevels) as EvidenceLevel[];
export const seriesKeys = Object.keys(series) as Series[];

// Hashtags for TikTok, Instagram and Threads captions (never in X text).
export function brandHashtags(post: { area?: Area | null; series?: Series | null }) {
  return ["#rawatlogi", post.series ? series[post.series].hashtag : "", post.area ? areas[post.area].hashtag : ""].filter(Boolean);
}
// Design-system rule: a post with no approved evidence cannot carry a "Riset …" label.
export function evidenceLevelIssue(level: EvidenceLevel | null | undefined, sourceIds: string[]) {
  if (!level) return null;
  if (evidenceLevels[level].needsEvidence && sourceIds.length === 0)
    return `evidenceLevel "${level}" needs approved evidence in sourceIds; use "ilustrasi-konsep" or "belum-ada-riset".`;
  if (!evidenceLevels[level].needsEvidence && sourceIds.length > 0)
    return `evidenceLevel "${level}" contradicts the cited sourceIds; use "riset-terbatas" (or "riset-kuat" only for systematic reviews or several consistent trials).`;
  return null;
}
