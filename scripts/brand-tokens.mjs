// Generate brand/design-system/tokens.css (CSS custom properties) from tokens.json.
// Usage: npm run brand:tokens
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../brand/design-system");
const t = JSON.parse(readFileSync(resolve(dir, "tokens.json"), "utf8"));
const themes = t.color.themes.map((x) => x.id);
const first = themes[0];
const value = (tok, theme) => {
  const v = typeof tok.value === "string" ? tok.value : (tok.value[theme] ?? tok.value[first]);
  const alias = /^\{(.+)\}$/.exec(v);
  return alias ? `var(--${alias[1]})` : v;
};
const colors = (theme) => t.color.tokens.map((tok) => `  --${tok.name}: ${value(tok, theme)};`).join("\n");
const list = (fam) => (t[fam]?.tokens ?? []).map((tok) => `  --${tok.name}: ${tok.value};`).join("\n");
const families = Object.entries(t.type.families).map(([k, v]) => `  --font-${k}: ${v};`).join("\n");
const styles = t.type.groups
  .flatMap((g) =>
    g.styles.map((s) => {
      const lines = [
        `  font-family: var(--font-${s.family ?? g.family});`,
        `  font-size: ${s.fontSize};`,
        s.lineHeight !== undefined ? `  line-height: ${s.lineHeight};` : "",
        s.fontWeight !== undefined ? `  font-weight: ${s.fontWeight};` : "",
        s.letterSpacing ? `  letter-spacing: ${s.letterSpacing};` : "",
      ].filter(Boolean);
      return `.${s.name} {\n${lines.join("\n")}\n}`;
    }),
  )
  .join("\n");
const css = `/* Rawatlogi — generated from tokens.json by scripts/brand-tokens.mjs. Do not edit by hand. */
@import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=JetBrains+Mono:wght@500&display=swap");
:root, [data-theme="${first}"] {
${colors(first)}
}
${themes
  .slice(1)
  .map((th) => `[data-theme="${th}"] {\n${colors(th)}\n}`)
  .join("\n")}
:root {
${list("spacing")}
${list("radius")}
${families}
}
${styles}
`;
writeFileSync(resolve(dir, "tokens.css"), css);
console.log(`Wrote ${resolve(dir, "tokens.css")} (${t.color.tokens.length} colours, ${themes.length} themes).`);
