# Deploy Fieldnote to Cloudflare Workers

Deploy the React assets and Hono API together as a Worker, with D1 and R2 bindings. This is a Workers project, not Cloudflare Pages.

## Supported cloud features

Production supports the dashboard, product and image storage, evidence, drafts, scheduling records, and bearer-authenticated MCP tools (including saving research/writing sessions). Dashboard AI generation, topic suggestions, provider connection tests, and the Node job runner remain local-only. There is no background cloud job processor or automatic social posting. Local D1/R2 data and API settings are not uploaded by deployment.

## First deployment

Use Node 24 and run commands from the repository root.

1. Run `npm ci`, then `npx wrangler login` to authenticate to your intended Cloudflare account.
2. Create production resources:

   ```powershell
   npx wrangler d1 create fieldnote-prod
   npx wrangler r2 bucket create fieldnote-prod-images
   ```

   R2 must be enabled on the account. Copy the returned D1 UUID into `env.production.d1_databases[0].database_id` in `wrangler.jsonc`. Resource names must match that configuration. Keep the local bindings separate.
3. Create a Cloudflare Zero Trust Access self-hosted application for the production hostname and an Allow policy for your email/users. Set `env.production.vars.ACCESS_TEAM_DOMAIN` to your team's `team.cloudflareaccess.com` hostname and `ACCESS_AUD` to the application's audience tag. Protect the dashboard and `/api/*`. If the Access application covers the entire hostname, add a more specific `/mcp` application with a Bypass policy so MCP clients can use their bearer token; the Worker still validates `MCP_TOKEN`. Protect every hostname that serves the dashboard, including workers.dev if enabled. Access must supply the login flow; Worker JWT validation alone returns 401 rather than redirecting to login.
4. Set production secrets using Wrangler's interactive prompts:

   ```powershell
   npx wrangler secret put MCP_TOKEN --env production
   npx wrangler secret put SETTINGS_ENCRYPTION_KEY --env production
   ```

   Generate independent values locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. Use one value per secret. The encryption key must decode to 32 bytes; the MCP token must have at least 32 characters. Keep secure backups. Never commit keys or reuse local credentials. Rotating the encryption key prevents decrypting previously saved settings.
5. Run `npm run check:production`, `npm run build`, `npm test`, and `npm run deploy:dry-run`.
6. Run `npm run deploy`. It validates configuration, builds, applies remote D1 migrations, and deploys the `fieldnote` production Worker. Back up existing production data before schema changes. Verify dashboard login, `/api/health` after login, image upload, and MCP with the production token. Requests without credentials should fail.

The dry run bundles locally without deploying or applying migrations. It intentionally accepts placeholder resource IDs so CI can validate the bundle before account setup. `check:production` rejects placeholders before real deployments; it does not verify account resources, Access policies, or secret presence.

## Git and continuous deployment

The repository uses `main`; generated builds, dependencies, local state, credentials, and Claude local files are ignored. Review `git status` before committing. To publish to a repository you own:

```powershell
git add .
git commit -m "Prepare Fieldnote for Cloudflare Workers"
git remote add origin <your-repository-url>
git push -u origin main
```

GitHub Actions validates builds, tests, and Worker bundling on pushes and pull requests without Cloudflare credentials. To deploy from Git, connect the repository in Cloudflare **Workers & Pages → fieldnote → Settings → Builds** after the first deployment. Configure production branch `main`, root directory `/`, build command `npm run build`, and deploy command `npm run check:production && npm run db:production && npx wrangler deploy --env production`. Use Node 24 (`NODE_VERSION=24` if needed). Ensure the build token can edit this Worker, D1, and R2. Disable non-production branch deployments until you configure isolated preview resources and authentication; do not point previews at production D1/R2.

Cloudflare resource IDs and Access audience/domain are configuration values and may be committed after setup. API tokens and Worker secrets must stay in Cloudflare or your secret store. Production secret upload is a separate operation from Git builds. To roll back application code, use Cloudflare Worker deployment history; code rollback does not undo D1 migrations.

References: [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/), [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/).
