import { test } from "node:test";
import assert from "node:assert/strict";
import { validateWritingResult } from "../shared/writing";
const url = "https://s.shopee.co.id/test?variant=1";
const valid = () => ({
  title: "Memilih varian",
  x: ["Cek ukuran dan varian sebelum masuk keranjang.", `Tautan afiliasi: ${url}`],
  threads: [`Lagi membandingkan pilihan? Mulai dari ukuran dan varian dulu.\n\nTautan afiliasi: ${url}`],
  sourceIds: [],
  warnings: [],
});
test("final draft rejects invented IDs, changed/duplicate links, missing disclosure and excessive lengths", () => {
  assert.doesNotThrow(() => validateWritingResult(valid(), url, []));
  const invalid = [
    { ...valid(), sourceIds: ["invented"] },
    { ...valid(), x: [`Tautan afiliasi: ${url} ${url}`] },
    { ...valid(), x: [`Tautan afiliasi: ${url}&changed=1`] },
    { ...valid(), x: [url] },
    { ...valid(), threads: ["a".repeat(501), `Tautan afiliasi: ${url}`] },
    { ...valid(), x: ["😀".repeat(141), `Tautan afiliasi: ${url}`] },
  ];
  for (const value of invalid) assert.throws(() => validateWritingResult(value, url, []), /Draft contract check failed/);
  assert.doesNotThrow(() => validateWritingResult({ ...valid(), sourceIds: ["approved-1"] }, url, ["approved-1"]));
});
