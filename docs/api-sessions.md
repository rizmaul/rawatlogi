# Product selection, topic sessions, and API configuration

## Using the new workflow

1. In **Research library** or **Writing studio**, choose **New research session** or **New writing session**.
2. The new page shows product photos, names, exact variants, and categories. Search by any of those text fields. The gallery is paginated, eight products per page.
3. Select a product. Its picture and name stay visible while planning topics.
4. Enter optional guidance describing the questions, audience, scope, tone, or angles you want. **Generate questions & topics** (research) or **Generate content topics** (writing) runs a queued API task.
5. Add suggestions individually or together. You can also enter your own topic at any time. Titles, question/brief text, and optional scientific search terms remain editable. A batch can contain up to ten topics.
6. **Start sessions** creates one independent durable session and job for each topic. The library/studio lists queued, in-progress, completed, and failed sessions. Open a session for its progress, results, sources or drafts; failed sessions can be retried.

Writing sessions require a confirmed product. Research briefings do not approve advertising claims. Writing uses only previously approved evidence for scientific claims; without approved evidence it must produce a cautious introduction and warnings.

## Routes

| Page                                          | URL                                |
| --------------------------------------------- | ---------------------------------- |
| Research product selection and topic planning | `/research/new`                    |
| Research planner with selected product        | `/research/new?product=PRODUCT_ID` |
| Research session                              | `/research/sessions/SESSION_ID`    |
| Writing product selection and topic planning  | `/studio/new`                      |
| Writing planner with selected product         | `/studio/new?product=PRODUCT_ID`   |
| Writing session                               | `/studio/sessions/SESSION_ID`      |
| API settings                                  | `/settings`                        |

These are local URLs until deployment. The current app remains local-only and fails closed on a public host.

## API provider

The current model is `deepseek-v4.1-flash`, the gateway base URL is `https://rkapi.com/v1`, and reasoning effort is `max`. These are editable in **Workspace settings**, together with the API key, protocol, JSON output mode, and output-token budget.

The gateway listed this exact model during verification. Its Responses endpoint returned HTTP 500 with an upstream response-parsing error. Its Chat Completions endpoint successfully handled the same model, max effort, and strict JSON output. Therefore this installation is explicitly configured for **Chat Completions**. The app does not automatically change protocols, substitute models, lower effort, or retry billable provider requests behind the user's back. Responses remains selectable if the gateway repairs that endpoint.

**Save & test connection** queues a small request through the same Node API worker used for generation. Its status and sanitized result appear in Settings. Leave a replacement-key field blank to retain the existing key; use the explicit removal checkbox to clear it.

The application does not use Codex login, spawn Codex, or edit the user's global Codex configuration for generation anymore. Node 24 is required by the current runner's TypeScript module import.

## Research data boundary

For a manual topic without search terms, the API first plans an English scientific query. The app then retrieves actual Europe PMC publications, with PubMed metadata fallback, and gives those retrieved records to the API for analysis. Returned findings may cite only retrieved `sourceId` values. Metadata-only sources cannot establish findings; abstracts are not full-text reviews. The report, limitations, next steps, source list, and warnings remain available in the session.

Opening **Review & link** creates an unreviewed evidence form. It does not approve or save a claim without the user's review.

## Storage and worker lifecycle

- Migration `0002_sessions_settings.sql` adds `sessions` and `app_settings`, preserving existing product, evidence, post, image, and job data.
- Sessions link a product, topic, guidance, job, status/progress, report or post IDs, retrieved sources, errors, and timestamps.
- API keys are encrypted with AES-GCM before being stored in local D1. The encryption key is generated into ignored `.dev.vars` as `SETTINGS_ENCRYPTION_KEY`. Public settings return only a configured/not-configured flag. Plaintext API keys are not put in job snapshots, frontend responses, source files, logs, or JSON workspace exports.
- The Node API worker obtains credentials through a runner-token-protected backend endpoint. It processes queued work sequentially and sends heartbeats while working. A provider request is bounded to nine minutes; stale work is marked failed after fifteen minutes without a heartbeat when the worker next checks the queue.
- Configuration is read when a job starts. Running jobs keep the configuration already read; queued jobs use the then-current settings. Retry uses the original product/evidence/task snapshot and the current API configuration.
- `npm run dev` runs the UI, Worker API, and Node API worker. `npm run runner` starts only the API worker. Restart it after changing runner source code.
- Export schema version 2 includes products/evidence/posts, jobs, and sessions. It excludes API settings/keys and image bytes. Back up local Wrangler state and `.dev.vars` separately to preserve images and encrypted settings. There is no restore/import UI yet.

## Development source map

`src/pages/NewSessionPage.tsx` composes `ProductGallery` and `TopicPlanner`. `SessionList` links to `src/pages/SessionPage.tsx`. `APISettings` owns the settings form. Pure catalog pagination is in `src/lib/catalog.ts`.

The backend routes live in `worker/session-routes.ts`; encryption is in `worker/ai-settings.ts`; provider request/response compatibility is in `shared/ai.ts`. `scripts/api-runner.mjs` orchestrates tasks defined by `scripts/ai-tasks.mjs`. Session schemas are in `shared/sessions.ts`.

## New endpoints

| Method and path                  | Purpose                                          |
| -------------------------------- | ------------------------------------------------ |
| `GET/PUT /api/settings/ai`       | Read redacted settings / save encrypted settings |
| `POST /api/settings/ai/test`     | Queue a connectivity test                        |
| `POST /api/topics/generate`      | Queue guided research or writing suggestions     |
| `GET/POST /api/sessions`         | List sessions / start one job per topic          |
| `POST /api/sessions/:id/retry`   | Retry a failed session                           |
| `GET /api/runner/config`         | Runner-authenticated credential/config retrieval |
| `POST /api/runner/:id/heartbeat` | Runner-authenticated liveness/progress update    |

Existing ownership-checked claim/finish endpoints handle writing, research, suggestions, and connection tests. Completion is idempotent: duplicate or stale claims cannot create duplicate posts or overwrite a completed session.

## Transport verification

Provider responses are streamed to reduce gateway idle timeouts during max-effort generation. Only final answer text is assembled; internal reasoning is discarded. Interrupted streams fail explicitly. Live verification completed research topics/reports, writing-topic suggestions, X/Threads drafts, and the Settings connectivity test with the exact configured model and max effort. The final build and all 22 automated tests pass.

### Parallel work and retries
The local worker runs three jobs concurrently by default. Settings allows 1–8 concurrent jobs; reducing the limit does not cancel active work. Each HTTP 504 is retried up to four times after the initial request, with 2, 4, 8 and 16 second delays. Only the failed provider request is repeated, not the entire research pipeline. Other HTTP errors fail normally. Session progress shows retries. Sources can be saved without approval; drafting requires a supported assessment, a specific claim, limitations, and explicit approval. Missing approval requirements are shown in the review form.

## Conversational writing
Writing now runs a copywriter pass followed by a separate editor pass, with at most one repair pass for measurable contract issues. Session progress identifies both stages. Final source-ID, affiliate-link, disclosure and length checks must pass before drafts are saved. Usage includes writing and writingEdit separately. See [research notes and voice rubric](writing-voice-research.md). Existing drafts are unchanged; generate a new session to use the revised voice.

## Separate model profiles
Workspace settings has Research & utilities and Content creation profiles. Research questions, query planning and scientific analysis use the research profile. Writing-topic suggestions, legacy draft jobs, writer, editor and bounded repair use the content profile. Each profile has its own model, effort, protocol, JSON mode and output budget. Provider URL, encrypted API key and worker concurrency are shared. Existing settings initialize both profiles from the exact current model/options; no premium model is selected automatically. Missing content fields on older clients preserve the saved content profile. New jobs select settings when claimed and keep that snapshot across all their passes/retries. Active session progress and completed session results identify the actual model/profile. Historical results without model metadata remain unlabeled. Research and content have separate connection tests. Unsupported model IDs fail explicitly without falling back to another model.

Profile split verification: all 31 automated tests pass, including independent saved models, legacy inheritance, routing, credential redaction, profile-specific tests and completed-session attribution. Browser verification saved and reloaded both profiles on deepseek-v4.1-flash with maximum effort and Chat Completions. The live content-profile connection test reached the gateway but returned HTTP 403; no alternate model was selected.

## Editable AI prompts
Settings → **AI prompts** lists every prompt the worker sends: topic suggestions, research query planner, research analysis, writing voice & rules, writer, editor/repair, connection test, and the JSON output suffix appended to every request. Defaults live in `shared/prompts.ts`. Saved edits are stored as overrides in `app_settings` (`prompts` key, same row as the AI settings); only text that differs from the default is stored, and **Reset to default** removes an override. `{{voice}}` in the writer/editor prompts inserts the voice prompt; the JSON suffix must keep `{{schema}}`. The runner reads prompts with its config when a job starts (`GET /api/runner/config`), so running jobs keep the prompts they started with. Endpoints: `GET/PUT /api/settings/prompts`. Prompts are excluded from the JSON export.
