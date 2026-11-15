# Setup and operations

## Local development

Use the moved project folder under `Documents/Personal/affiliate-evidence-studio` and Node 24.

```powershell
npm install
npm run setup
npm run dev
```

Setup preserves current D1 records and applies pending SQL migrations. It creates `LOCAL_RUNNER_TOKEN` and `SETTINGS_ENCRYPTION_KEY` in ignored `.dev.vars`. Dev starts Vite on 5173, the local Worker on 8787, and the Node API worker. Keep the process running while using queued generation. `npm run runner` runs only the API worker. Restart it after editing runner source.

## API settings

Open `/settings`. Save the gateway base URL, exact model, reasoning effort, protocol, JSON output mode, token budget, and key. A blank replacement-key field keeps the current key. The removal checkbox clears it. Save & test queues a small task through the real API worker.

This installation uses `deepseek-v4.1-flash`, `max`, and `https://rkapi.com/v1`. Chat Completions was verified working; the gateway's Responses endpoint returned an upstream parsing error. This is an explicit configuration selection, not an automatic fallback. Responses remains available in Settings. No global Codex configuration is edited.

See [API/session guide](api-sessions.md) for complete behavior and endpoint descriptions.

## Verification

```powershell
npm run build
npm test
```

The build checks worker-script syntax, TypeScript, and the frontend bundle. Tests use mocked provider responses and isolated local D1/R2 databases, avoiding billable API calls. Live gateway verification is separate from those tests.

## Session lifecycle

Each selected topic creates one queued session and job. The API worker handles work sequentially. Claimed sessions show in progress and record concise stage updates. Completed research sessions retain sources and unreviewed findings; completed writing sessions link X/Threads drafts. Failed sessions retain a sanitized error and can be retried.

The API request timeout is nine minutes. Heartbeats refresh job ownership. Work without a heartbeat for fifteen minutes is failed on the next claim pass. Retry reuses the original task/product/evidence snapshot but reads the current API settings when it starts. Provider requests are not silently retried or downgraded.

## Images and backup

Product forms accept JPEG, PNG, or WebP up to 5 MB. Images use the local `BUCKET` R2 binding; product records retain UUID references. Save product commits the selected image. Unreferenced temporary files are cleaned up when the editor closes; images referenced by saved products are retained.

JSON export version 2 includes products/evidence/posts, jobs, and sessions. It excludes API settings, credentials, and image bytes. Back up `.wrangler/state` and `.dev.vars` together for complete local recovery. Losing the encryption key prevents decrypting saved credentials. There is no restore/import UI yet.

## Troubleshooting

- No local page: run `npm run dev` from the moved folder; check ports 5173 and 8787.
- Missing sessions/settings table: run `npm run setup`, then restart dev.
- Settings encryption error: verify the existing `.dev.vars` is present; do not replace its encryption key casually.
- Queued work does not start: keep the API worker running and check its terminal.
- HTTP 401: verify the provider key. HTTP 400/500: verify model, protocol, and output mode. HTTP 504: the gateway timed out; retry explicitly if desired.
- Incomplete model answer: increase the output-token budget in Settings. The budget includes reasoning tokens.
- Publication retrieval failure: retry the session or add sources manually. Metadata-only results cannot establish efficacy.
- Upload 503: restart the API so the R2 binding is loaded.

## Deployment later

Cloudflare Workers, D1, and R2 remain the target platform. Provision actual resources, configure server-side identity/authorization and secrets, and provide an appropriate durable cloud worker/queue execution path before deployment. The current local-only guard must not be removed without replacing it with verified access control. No deployment is performed by local setup or dev commands.
