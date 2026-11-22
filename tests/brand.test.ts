import { test } from "node:test";
import assert from "node:assert/strict";
import { brandHashtags, evidenceLevelIssue } from "../shared/brand";
import { writingContractIssues } from "../shared/writing";
import { postSchema } from "../shared/model";

const url = "https://s.shopee.co.id/abc";
const draft = {
  title: "t",
  x: ["Hook.", `Link afiliasi: ${url}`],
  threads: [`Isi. Link afiliasi: ${url}`],
  sourceIds: [] as string[],
  warnings: [],
};

test("Level bukti: riset labels need approved evidence, concept labels cannot cite it", () => {
  assert.equal(evidenceLevelIssue("ilustrasi-konsep", []), null);
  assert.match(evidenceLevelIssue("riset-terbatas", [])!, /needs approved evidence/);
  assert.match(evidenceLevelIssue("ilustrasi-konsep", ["e1"])!, /contradicts/);
  assert.equal(evidenceLevelIssue("riset-kuat", ["e1"]), null);
  assert.equal(evidenceLevelIssue(null, []), null);
});

test("writing contract flags a wrong Level bukti so the repair pass fixes it", () => {
  assert.deepEqual(writingContractIssues({ ...draft, evidenceLevel: "ilustrasi-konsep" }, url, []), []);
  assert.match(writingContractIssues({ ...draft, evidenceLevel: "riset-kuat" }, url, []).join(" "), /needs approved evidence/);
});

test("approved posts cannot carry a riset label without sources; hashtags come from labels", () => {
  const base = { productId: "p", title: "t", platform: "x", segments: ["Link afiliasi: " + url], area: "kulit", series: "pilih-yang-mana" };
  assert.equal(postSchema.safeParse({ ...base, evidenceLevel: "riset-terbatas" }).success, true); // drafts may hold it
  assert.equal(postSchema.safeParse({ ...base, evidenceLevel: "riset-terbatas", status: "approved" }).success, false);
  assert.deepEqual(brandHashtags({ area: "kulit", series: "pilih-yang-mana" }), ["#rawatlogi", "#pilihyangmana", "#skincareindonesia"]);
});
