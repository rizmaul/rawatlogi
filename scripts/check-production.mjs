import { readFileSync } from "node:fs";
import ts from "typescript";

// TypeScript's JSON parser accepts Wrangler's comments and trailing commas.
const parsed = ts.parseConfigFileTextToJson(
  "wrangler.jsonc",
  readFileSync("wrangler.jsonc", "utf8"),
);
if (parsed.error) throw new Error("Invalid wrangler.jsonc");
const prod = parsed.config.env?.production;
const errors = [];
const real = (value) =>
  typeof value === "string" && value.length > 0 && !/REPLACE/i.test(value);
if (prod?.vars?.APP_MODE !== "production")
  errors.push("APP_MODE must be production");
if (
  !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(
    prod?.vars?.ACCESS_TEAM_DOMAIN ?? "",
  ) ||
  !real(prod?.vars?.ACCESS_TEAM_DOMAIN)
)
  errors.push("Set production ACCESS_TEAM_DOMAIN");
if (!real(prod?.vars?.ACCESS_AUD)) errors.push("Set production ACCESS_AUD");
const db = prod?.d1_databases?.find((binding) => binding.binding === "DB");
if (
  !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(
    db?.database_id ?? "",
  ) ||
  /^0{8}-/.test(db?.database_id ?? "")
)
  errors.push("Set production DB database_id to the provisioned D1 UUID");
if (
  !prod?.r2_buckets?.some(
    (binding) => binding.binding === "BUCKET" && real(binding.bucket_name),
  )
)
  errors.push("Set production BUCKET bucket_name");
if (errors.length) {
  console.error(
    "Production configuration is incomplete:\n" +
      errors.map((error) => `- ${error}`).join("\n"),
  );
  process.exit(1);
}
console.log(
  "Production configuration is ready. Ensure resources, Access policies, and Worker secrets exist before deploying.",
);
