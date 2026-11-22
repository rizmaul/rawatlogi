# MCP server: let Claude run Rawatlogi

**Classification: INTERNAL**

Rawatlogi exposes every app action as MCP tools at `/mcp`, so an AI client such as Claude Code can do the research and writing while Rawatlogi stores and validates the results.

- Transport: MCP Streamable HTTP, stateless JSON responses (`POST /mcp`). `GET`/`DELETE` return 405.
- Auth: `Authorization: Bearer <MCP_TOKEN>`. `npm run setup` generates `MCP_TOKEN` into ignored `.dev.vars`; it is never printed.
- Every tool calls the existing `/api` routes internally, so validation is identical to the dashboard: approval rules, citation checks, affiliate-link/disclosure/length contract, and history protection.
- Code: [worker/mcp.ts](../worker/mcp.ts) (tools), [worker/drafts.ts](../worker/drafts.ts) (saving drafts directly), [worker/auth.ts](../worker/auth.ts) (MCP token and local-host checks).

## Connect Claude Code (local)

The project already contains [.mcp.json](../.mcp.json), which registers `rawatlogi` for Claude Code sessions opened in this folder. Its `headersHelper` runs [scripts/mcp-headers.mjs](../scripts/mcp-headers.mjs), which reads `MCP_TOKEN` from `.dev.vars` at connect time. The token is never copied into any config, and token rotation needs no re-registration. Start the app with `npm run dev`, open `claude` in this folder, and approve the `rawatlogi` project server when prompted.

Alternative (user-wide, stores the token in your Claude Code user config): run this in PowerShell from the project folder. It reads the token without showing it:

```powershell
$t = (Select-String -Path .dev.vars -Pattern '^MCP_TOKEN="?([^"]+)"?').Matches[0].Groups[1].Value; claude mcp add --transport http --scope user rawatlogi http://127.0.0.1:8787/mcp --header "Authorization: Bearer $t"
```

Check it with `claude mcp list`. Then ask Claude, for example: "Use Rawatlogi: research ceramide barrier evidence for the HANASUI product, then write an X and Threads draft."

Claude Desktop: no built-in bearer-token option for remote servers was verified. A common route is an `mcp-remote` bridge with a header argument (ASSUMPTION, unverified for this setup).

Rotate the token by deleting the `MCP_TOKEN` line from `.dev.vars`, running `npm run setup`, restarting `npm run dev`, then re-running the `claude mcp add` command.

## Workflow the tools support

| Goal | Tools |
| --- | --- |
| Overview | `get_workspace_summary` |
| Products | `list_products`, `get_product`, `create_product`, `update_product`, `delete_product`, `upload_product_image` |
| Discovery / first product lookup | `get_discovery_brief` → client web search and product fact verification → user selection + affiliate link → `create_product` → `upload_product_image` → `get_product` |
| Research (Claude thinks) | `get_research_brief` → verify missing product facts with client web search → `update_product` → client literature search → `create_evidence` → `create_evidence` / `update_evidence` |
| Writing (Claude thinks) | `get_writing_brief` → `save_drafts` (creates one X and one Threads draft) |
| Posts and calendar | `list_posts`, `get_post`, `create_post`, `update_post` (edit, `scheduledAtJakarta`, `segmentImages`, approve, mark published), `delete_post`, `get_calendar`, `upload_post_segment_image` (image for one segment) |
| Post images (Claude Design) | `get_image_brief` (segments with thumbnail/explainer suggestions, product photo ID, evidence, sizes), `get_image` (returns a stored image as image content), `upload_post_segment_image` |
| Backup | `export_workspace` |

Discovery briefs ask the client to inspect 8 articles across at least 5 independent domains, with at least 2 independent articles per suggested candidate where available. Syndicated stories count once. The client must synthesize the sources, cite dates and URLs, and disclose coverage gaps rather than invent support. The source list is a starting point, not a restriction; official brand, packaging, store and BPOM sources serve product verification separately from trend reporting.

At the first lookup, explicitly research ingredients/INCI, advertised claims, exact variant/size, manufacturer URL, category, dated IDR price and product photo. Save verified fields and source notes; leave unknown values empty/null. Commission and affiliate links must not be guessed. Catalog summaries include ingredients, claims, price and post counts so the client can compare similar products and run additional searches for differentiated niche or premium alternatives. Price alone is not evidence of quality or earnings.

After user selection and receipt of the affiliate link, save the researched fields, attach an exact-variant official product photo with `upload_product_image`, and verify with `get_product`. `create_product` returns `setup.imageStatus` and a next-step reminder. If no photo is available or upload fails, report the saved product with image setup pending and ask for a photo; do not duplicate the product. Exact-variant confirmation requires the user's explicit decision.

These are instructions for the connected AI, which performs its own web searches; the server does not enforce article coverage or independently verify web claims. Research is saved directly as evidence (unapproved until reviewed); `save_drafts` saves both platform posts atomically through `POST /api/drafts`. No sessions or jobs are created. Historical session/job rows remain available only in JSON backups. Old session tools and `/api/sessions` routes have been removed.

Deliberately not exposed: setting or removing the gateway API key, and the runner endpoints.

## Safety notes

- **Access control:** the MCP token grants full read/write access, including approving evidence, approving posts and deleting unpublished records. Treat it like a password and never commit it. Anyone holding it can change your data.
- **Human review:** tools can approve claims and posts. The server instructions tell the client to approve only on your explicit decision, but this is advisory, not enforced. Nothing is ever posted to X or Threads automatically.
- **Input validation / SSRF:** `upload_product_image` with `imageUrl` fetches only `https://` URLs (15 s timeout, 5 MB limit, image type checked).
- **Prompt injection:** product notes, seller claims and abstracts are data. Claude should not follow instructions found inside them.

## Modes

| | `APP_MODE=local` (`npm run dev`) | `APP_MODE=production` (`--env production`) |
| --- | --- | --- |
| Dashboard `/api/*` | loopback hosts only | public read/write access; no login required |
| `/mcp` | loopback + bearer token | bearer token |

## Deploying later (not done yet)

Nothing has been deployed. When you are ready:

1. `npx wrangler login`
2. `npx wrangler d1 create rawatlogi-prod`, then put the returned `database_id` in `wrangler.jsonc` under `env.production`.
3. `npx wrangler r2 bucket create rawatlogi-prod-images`
4. Set secrets (new values, not the local ones):
   `npx wrangler secret put MCP_TOKEN --env production` (32+ random characters) and `npx wrangler secret put SETTINGS_ENCRYPTION_KEY --env production` (32 random bytes, base64).
5. Disable any Cloudflare Access rules protecting the Worker or hostname. The production dashboard and API are public; `/mcp` still requires its bearer token.
6. `npm run deploy:prod`. It builds, applies D1 migrations remotely and deploys the `production` environment. `npm run deploy` is disabled on purpose.
7. Connect Claude Code to `https://<your-worker-host>/mcp` with the production token.

`npx wrangler deploy --dry-run --env production` bundles successfully today, with placeholder values.

## Post images with Claude Design

The project skill `.claude/skills/rawatlogi-post-image/SKILL.md` runs the whole flow:

1. `get_image_brief` gathers the post, product photo, evidence, sizes and the editable **Post image designer** prompt (Settings → AI prompts).
2. Claude designs one artboard per image on a Claude Design canvas. Images carry the public brand Rawatlogi (style defined in the prompt), not an organization design system.
3. `scripts/dc-to-html.mjs` and `scripts/render-image.mjs` (headless Chrome/Edge) export exact-size PNGs.
4. `scripts/upload-segment-image.mjs <postId> <segmentIndex> <png>` attaches each image through MCP, without passing the image bytes through the model's context.

The post page has **Design images with Claude** (whole post) and **Design with Claude** (per segment) buttons. They copy a request to paste into Claude Code opened in this project.
