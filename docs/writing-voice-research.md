# Conversational affiliate writing: research and implementation

Reviewed 10 November 2026 (Asia/Jakarta). Small, purposive sample of public X shopping/affiliate content for Indonesian readers. This is qualitative copy research, not a representative sample or a conversion experiment.

## Access and attribution

Direct X status requests were unavailable through the research tool. Post text was read from indexed TwStalker profile mirrors; original status URLs were recovered from their View Details links. We cannot independently verify current availability, post timestamps, engagement counts, commissions, or creator experience. A Shopee short link is a shopping-link signal, not proof its owner earns a commission. @rohmatulizzaa explicitly identifies as an affiliator in the mirrored profile. No posts, images or creator identities are included in model prompts; teaching examples are original and fictional.

| Example | Original X reference / accessible observation | Observed technique | Adaptation and boundary |
|---|---|---|---|
| @rohmatulizzaa, bag thread closing | [Post](https://x.com/rohmatulizzaa/status/2065736622709383473), [mirror](https://ww.twstalker.com/rohmatulizzaa) | A use case and a low-pressure wishlist/link close follow specific product details. | Give the reader a relevant next step after useful information. Never import the bag's details or purchase testimony. |
| @rohmatulizzaa, antiperspirant opening | [Post](https://x.com/rohmatulizzaa/status/1931969524284391547), same mirror | An everyday stair-climbing situation makes the product discussion concrete. | Anchor an opening in a reader situation; do not fabricate a first-person story, sweating outcome or price. |
| @rohmatulizzaa, moisturizer | [Post](https://x.com/rohmatulizzaa/status/1921881855269200316), same mirror | A short personal preference feels conversational. | Borrow brevity, not the repurchase story or implied suitability for a skin condition. |
| @sanjikunfav, moisturizer reply | [Post](https://x.com/sanjikunfav/status/2077228932093632640), [mirror](https://twstalker.com/sanjikunfav) | Direct address and a single takeaway accompany a shopping link. | Speak to one reader and keep a clear point; do not invent personal use or guarantee a result. |
| @melooonak, lip balm promotion quoted by beautybank | [Post](https://x.com/melooonak/status/2021395012467220917), [observed quote](https://w.twstalker.com/ohmy_beautybank) | Product category, a few attributes and shopping links are easy to scan; the copy is more catalogue-like. | Keep scannability but avoid a list of benefits, unsupported safety language or emoji saturation. |
| @masjalah, skincare routine promotion | [Indexed mirror](https://mobile.twstalker.com/masjalah) (search extract only, not a verified status) | A routine/change story points to numbered product links and invites continuation. | Continuity can help an explanation; do not copy cure-like claims, invented results or use it as scientific support. |

My interpretation: specificity, direct address, short varied sentences and a gentle next step are useful hypotheses for warmer writing. These observations do not establish which wording performs best. Most first-person material is unavailable to this automated author, so friendly editorial explanation is the appropriate voice. Clinical truth comes exclusively from approved evidence, never social examples. The evidence review workflow is unchanged.

## Prompt and flow changes

- Writing topics now frame reader situations, buying questions and useful distinctions rather than academic paper titles. Research questions retain their scientific purpose.
- Writer: consider different hooks privately, choose one useful takeaway, write original informal Indonesian with consistent kamu/aku, breathing room and a short explanation. No forced bestie/slang, generic sales templates, copied creator wording, fake personal experience, artificial scarcity or treatment promises.
- Editor: a separate API request receives the original context and evidence, plus the candidate and measurable contract issues. It rewrites for warmth and checks evidence fit, qualifiers and platform limits. The candidate is never treated as a source of facts.
- Product names and seller claims cannot establish ingredients or efficacy. Empty approved evidence means a non-efficacy buying/variant introduction and an internal warning. Relevant limitations remain next to scientific claims; no filler disclaimer wall.
- X and Threads are written separately. One to four segments each; X <=280 weighted characters and Threads <=500 code points. One exact affiliate URL per package, clear disclosure in the same segment, no other public URLs or internal source IDs.
- Deterministic final checks reject invalid source IDs, overlength segments, modified/repeated URLs or missing link disclosure before saving. They do not prove scientific accuracy or measure friendliness: human review still matters.
- Two dependent provider calls per writing job (writer then editor), plus at most one repair request if measured contracts still fail, using the saved model and effort. Jobs remain concurrent across topics. Each call retains the existing four HTTP-504 retries. Usage records distinguish writing and writingEdit; this costs more tokens and time than the earlier one-pass flow. Exact link budgets are supplied to both passes; an impossible Threads link fails before generation and asks for a shorter official affiliate link.
- Prompt version: 2026-11-10-conversational-v1. Existing saved drafts are unchanged; new writing jobs use the flow after worker restart.

## Review rubric

Human review should ask: Is the first line a credible reason to read? Does one useful point arrive quickly? Would I say this aloud to a friend? Does it avoid fake intimacy and personal testimony? Does the evidence support the exact statement and its scope? Is the next step helpful without pressure? Is disclosure clear? Style quality is subjective; passing structural checks is not a conversion claim.

Tests cover two-pass handoff, original-context preservation, contract repair, warning retention and failure without saving an unchecked first draft. See writing-evaluation.json for an in-memory live revised-flow smoke test if present; it is not a benchmark. An initial baseline/new comparison exposed Threads overflow with the real 411-character URL; that test led to measured link budgets and the bounded repair pass.


## Live verification and editorial iteration

The revised two-pass flow completed through deepseek-v4.1-flash at max effort with the real product and its 411-character URL, with no approved evidence. The resulting X/Threads packages passed exact-link, disclosure, source-ID and length checks and were kept in the evaluation artifact, not the catalog's posts. Human reading found too much internal-audit language and repetition of seller claims. The prompt was tightened to keep unsupported benefit claims out of public copy even when negated or called unverified, put internal evidence concerns in warnings, and lead with a reader decision. After one provider connection failure, the final editor-only retry completed and passed all deterministic contracts. Its opening shifted from discussing the listing title to asking the reader about choosing a larger moisturizer. Unsupported seller benefit claims moved to warnings. The artifact preserves both the initial two-pass output and the final editorial revision; the baseline output was not retained after the earlier failed comparison. This small qualitative check does not establish performance or scientific accuracy. Automated validation: 30 tests pass; production build passes.

## 2026-11-12 revision: "science friend" voice (prompt version 2026-11-12-science-friend-v3)

**Classification: INTERNAL**

### Why
Drafts read as hard and inflexible. The old voice prompt was mostly prohibitions. With no approved evidence (the current state of the catalog) it banned every mechanism, so drafts collapsed into listing audits ("cek varian dulu", "itu data dari penjual, belum menunjukkan hasilnya di kulitmu"). The goal is affiliate posts that are "not so affiliate": the reader learns the science behind a choice, and the product appears as a concrete example.

### Real-post research (12 November 2026)
Public posts found through web search. Patterns only; no post text is used in prompts. Shopee short links are a shopping-link signal, not proof of commission (ASSUMPTION that they are affiliate links).

| Pattern observed | Example posts |
|---|---|
| Answering a reader's question, then one recommendation and a link | [Threads @skincarewanita.id](https://www.threads.com/@skincarewanita.id/post/DTEScFckz-L), [Threads @kartikaisnaini](https://www.threads.com/@kartikaisnaini/post/DZPwNn0ku-_) |
| One plain line per ingredient's role ("bantu…", "bikin…") plus a texture tip (cream vs gel) | [Threads @viani3209](https://www.threads.com/@viani3209/post/DaT2p8NkzFV) |
| Routine/pairing logic ("kalau kamu pakai X + Y, butuh moist yang hydrating") | [Threads @mawrcellaa](https://www.threads.com/@mawrcellaa/post/DYWMk4uGTEM) |
| Myth-bust hook ("moisturizer mahal belum tentu…") and everyday metaphors for the barrier | [Threads @izz.izwan_](https://www.threads.com/@izz.izwan_/post/Da5WTOggf3t) (Malay) |
| Price as a value note; one emphasised word; light slang (worth it, GONG) | [X @_llemonade](https://x.com/_llemonade/status/1990287460249866446), [X @dehaagusti](https://x.com/dehaagusti/status/1978073416801390854) |
| Patterns to avoid: catalogue copy, "IT WORKS", "wajib dicoba", "dermatologist approved", hashtag spam | [X @keshikiayame](https://x.com/keshikiayame/status/1951974996521230661), [X @milcannie](https://x.com/milcannie/status/2054790822529482908) |
| Science communication with study design, limits and an affiliate disclosure | [Lab Muffin (Thread Reader)](https://threadreaderapp.com/user/LabMuffin) |

### What changed in the prompts (shared/prompts.ts defaults)
- **Voice:** persona is a friend into skincare who reads the research. Order is value → product as example → link; the reader should learn one real thing without clicking. Casual register, light slang, 0–2 emojis, one opinion line about the formula encouraged (curation, never a usage story). The analogy is chosen per topic from a varied set. The tone example uses an unrelated fictional sunscreen so its wording cannot leak.
- **Three-tier claims (policy change):**
  1. Well-established general skin science (barrier, humectant/emollient/occlusive, patch testing) is now allowed as plain education even without approved evidence. It may not include numbers or study claims, and never promises product outcomes.
  2. Research findings come only from approvedEvidence, with the limitation in the same breath.
  3. Product results are never stated unless the evidence tested that exact product. Seller claims are never repeated.
- **Product placement:** at most about a quarter of the post, named once with the recorded ingredients that connect to the explanation. Price only when it helps.
- **Post shapes menu:** myth, reader situation, ingredient explainer, comparison, routine fit. Threads may use up to 4 segments, and writers are told to count lengths.
- **Writer and editor:** a short process plus self-check. The editor keeps the science, cuts brochure and audit language, and resolves the measured contract issues.
- **Topic suggestions:** writing topics use the shapes; research topics stay testable with English queries.
- **Research briefing:** leads with the plain answer, then what the evidence covers and what it does not show, ending with "Bahan untuk konten:".
- **Query planner:** ingredient + outcome keywords.
- **Unchanged:** the JSON output fields, the `{{voice}}`/`{{schema}}` placeholders, and the deterministic link/disclosure/length/source-ID checks.

### Iteration (Claude Sonnet as the stand-in writer/editor, same inputs each round)
Scenarios:
- **A:** HANASUI, no approved evidence, "kulit kering masih ketarik".
- **B:** HANASUI plus a clearly labelled TEST FIXTURE approved evidence (a small ceramide RCT with limits).
- **C:** a fictional niacinamide serum with a myth-bust topic.

| Round | Result |
|---|---|
| Baseline (old prompts) | Contract passed, but A and C became listing audits and C ignored the myth-bust entirely. B read like an abstract. |
| v1 | Science-first, limits handled well. Writers copied the tone example verbatim (same "tembok bata/semen" analogy in all three) and every post ended with a formulaic price line. |
| v2 | Example swapped to an unrelated product, analogy set added, price made optional. Analogies varied (spons, tutup panci, workout), opinion lines appeared. One Threads segment overran (594 characters). |
| v3 (installed) | Threads 1–4 segments with a length check. Writer outputs: A and B passed, C overran once. The editor pass fixed it: all three final outputs pass `writingContractIssues` with no issues. |

**Before (baseline, scenario A, X):** "Di listing ini variannya Big Ceramide Moist, gel 100 ml… Itu data dari penjual, belum menunjukkan hasilnya di kulitmu."

**After (v3 + editor, scenario A, X):**
1. "Udah pakai pelembap tapi kulit kering masih ketarik? Bisa jadi bukan kurang banyak, tapi isinya cuma narik air tanpa ada yang nahan 👀"
2. "Humectant (bahan penarik air, kayak hyaluronic acid) itu semacam spons… Tanpa yang menahan, airnya gampang menguap lagi…"
3. "…Menurutku kombinasi itu lebih masuk akal daripada ganti-ganti produk."
4. "Contoh yang isinya nyambung: HANASUI Ceramide Probiotics Moisturizer Gel, ada ceramide + hyaluronic acid… Link afiliasi: …"

**After (scenario B, research claim with its limit):** "Ada studi acak double-blind: sekitar 40 orang dewasa dengan dermatitis atopik ringan… Catatannya: skalanya kecil, yang diuji formula tertentu (bukan produk yang aku bahas), dan dananya dari produsen formulanya."

Limits: this is a small qualitative check with one stand-in model, not a conversion or engagement measurement. The gateway model (deepseek) was not re-run. Human review of each draft is still required. Tests: `tests/prompts-content.test.ts` pins the claim rules and the placeholders.
