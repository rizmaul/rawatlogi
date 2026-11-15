# Product-first research and writing workflow

## Product catalog

Save the exact product name/variant, category, affiliate link, manufacturer/packaging source, ingredients, advertised claims, optional price/commission, and notes. Upload a recognizable JPEG, PNG, or WebP up to 5 MB. Unknown information stays blank. A product URL or photo does not establish its composition or efficacy.

## Choose a product and plan topics

From Research library or Writing studio, open a new session. Select the product from the image/name gallery. Search includes name, variant, and category; pagination shows eight products per page.

The planner supports optional instructions about the kinds of questions/topics wanted, AI-generated suggestions, manually added topics, and editing/removing topics before starting. Research topics may include optional English publication-search terms. Up to ten topics can be started together, with a separate session/job for each.

Writing requires a confirmed product. Guidance is preserved with each session. Queued topics remain queued until the API worker can process them; in-progress sessions show their current stage and retain their results after navigation/reload.

## Research boundary

The API plans a search query if needed. The application retrieves actual publications from Europe PMC or PubMed, then asks the configured model to analyze only the supplied records. The session stores its sources, briefing, findings with source IDs, limitations, uncertainty, warnings, and next steps.

Metadata-only sources and abstracts are labeled. A title alone does not establish a study outcome. Ingredient studies are not proof about every finished product containing that ingredient. Seller claims and registration information are not substitutes for clinical evidence.

Research reports remain unreviewed. Opening Review & link prepares an evidence form; the user must read the source, record the claim/applicability/limitations, assess it, and explicitly approve it before writing may use it as scientific support.

## Writing and publication

Each writing topic produces distinct editable X and Threads draft packages. Only approved evidence supports scientific claims. Missing evidence leads to a cautious introduction and review warnings rather than invented benefits or personal experience. Affiliate disclosure remains required before approval.

The calendar uses Jakarta time. Scheduling records a plan; it does not publish. Copy the text, post manually, and save the real published URL afterward. Published records preserve their history.

## API and configuration

Questions, research planning/analysis, and drafts now use the API configured in Workspace settings. The key stays encrypted on the backend. There is no Codex login dependency. Model/protocol/effort changes apply to work as it starts; active jobs keep their already-read configuration.

See [API/session guide](api-sessions.md), [architecture](architecture.md), and [operations](operations.md) for details. Trends, automatic Shopee extraction, automatic posting, and AI image generation are outside the current scope.
