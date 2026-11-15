# Deploy Rawatlogi to Cloudflare Workers

Deploy the React assets and Hono API together as a Worker, with D1 and R2 bindings. This is a Workers project, not Cloudflare Pages.

## Supported cloud features

Production supports the dashboard, product and image storage, evidence, drafts, scheduling records, and bearer-authenticated MCP tools (including saving research/writing sessions). Dashboard AI generation, topic suggestions, provider connection tests, and the Node job runner remain local-only. There is no background cloud job processor or automatic social posting. Local D1/R2 data and API settings are not uploaded by deployment.

## First deployment

Use Node 24 and run commands from the repository root.

1. Run `npm ci`, then `npx wrangler login` to authenticate to your intended Cloudflare account.
2. Create production resources:

   ```powershell
   npx wrangler d1 create rawatlogi-prod
   npx wrangler r2 bucket create rawatlogi-prod-images
   ```

   R2 must be enabled on the account. Copy the returned D1 UUID into `env.production.d1_databases[0].database_id` in `wrangler.jsonc`. Resource names must match that configuration. Keep the local bindings separate.
3. The production dashboard and API are public: anyone can read and modify workspace data without signing in. Disable or delete any Cloudflare Access rules still protecting the Worker or hostname; this deployment does not remove Cloudflare account policies. `/mcp` continues to require `MCP_TOKEN`.
4. Set production secrets using Wrangler's interactive prompts:

   ```powershell
   npx wrangler secret put MCP_TOKEN --env production
   npx wrangler secret put SETTINGS_ENCRYPTION_KEY --env production
   ```

   Generate independent values locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. Use one value per secret. The encryption key must decode to 32 bytes; the MCP token must have at least 32 characters. Keep secure backups. Never commit keys or reuse local credentials. Rotating the encryption key prevents decrypting previously saved settings.
5. Run `npm run check:production`, `npm run build`, `npm test`, and `npm run deploy:dry-run`.
6. Run `npm run deploy`. It validates configuration, builds, applies remote D1 migrations, and deploys the `rawatlogi` production Worker. Back up existing production data before schema changes. Verify the dashboard and `/api/health` without login, image upload, and MCP with the production token. MCP requests without credentials should fail.

The dry run bundles locally without deploying or applying migrations. It intentionally accepts placeholder resource IDs so CI can validate the bundle before account setup. `check:production` rejects placeholders before real deployments; it does not verify account resources or secret presence.

## Git and continuous deployment

The repository uses `main`; generated builds, dependencies, local state, credentials, and Claude local files are ignored. Review `git status` before committing. To publish to a repository you own:

```powershell
git add .
git commit -m "Prepare Rawatlogi for Cloudflare Workers"
git remote add origin <your-repository-url>
git push -u origin main
```

GitHub Actions validates builds, tests, and Worker bundling on pushes and pull requests without Cloudflare credentials. To deploy from Git, connect the repository in Cloudflare **Workers & Pages → rawatlogi → Settings → Builds** after the first deployment. Configure production branch `main`, root directory `/`, build command `npm run build`, and deploy command `npm run check:production && npm run db:production && npx wrangler deploy --env production`. Use Node 24 (`NODE_VERSION=24` if needed). Ensure the build token can edit this Worker, D1, and R2. Disable non-production branch deployments until you configure isolated preview resources and authentication; do not point previews at production D1/R2.

Cloudflare resource IDs are configuration values and may be committed after setup. API tokens and Worker secrets must stay in Cloudflare or your secret store. Production secret upload is a separate operation from Git builds. To roll back application code, use Cloudflare Worker deployment history; code rollback does not undo D1 migrations.

References: [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/), [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/).
