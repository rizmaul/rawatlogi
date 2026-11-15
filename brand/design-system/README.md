**Classification: INTERNAL** · Rawatlogi is the brand and studio that produces its research, posts, and images.

Rawatlogi means *ilmu merawat diri*, the science of looking after yourself. It is a science-based personal-care account for Indonesian readers, covering hair, skin, teeth and mouth, eyes, and body and nails. It recommends products through affiliate links, but every recommendation starts with what the research actually says.

- **Name:** `Rawatlogi` in running text; `rawatlogi` (lowercase) only in the wordmark. Never "Rawat Logi" or "RAWATLOGI".
- **Motto:** *Perawatan diri, pakai riset.*
- **Secondary line:** *Dari rambut sampai kaki, kita cek risetnya dulu.*
- **Promise:** the reader learns one real thing from every post, even if they never click the link.

## Content fundamentals

**Who is speaking.** A friend who is into personal care and actually reads the journals: the person people message "kak, ini bagus nggak sih?". Not a doctor, not a brand, not a hype account.

**Personality: Teliti, Santai, Jujur.**
- *Teliti* (careful): every science claim is either general skin/hair/oral science or comes from approved evidence, with its limit stated next to it.
- *Santai* (relaxed): everyday Bahasa Indonesia, short sentences, one idea per segment.
- *Jujur* (honest): affiliate links are always labelled; uncertainty is said plainly.

**Language and casing.**
- Write in casual Bahasa Indonesia: *kamu*, *nggak*, *banget*, *sih*, *kok*. Use *aku* only for curation or opinion ("aku suka formulanya karena…"), never for invented use or results.
- Sentence case for headlines and labels. Uppercase only for small eyebrow labels in `mono-label`.
- Ingredient names keep their INCI or common spelling: *ceramide*, *hyaluronic acid*, *fluoride*, *SLS*.

**Emoji.** At most 1–2 per post, and only functional ones (✨ 👀 💧 📌). Never as bullet points, never in chains, never in images.

**Always say:**
- "Link afiliasi" in the same segment as any affiliate link.
- "Bukan saran medis" on eye and dental topics.

**Never say:** *terbukti secara ilmiah*, *wajib punya*, *dijamin*, *auto glowing*, *solusi terbaik*, *dermatologist approved*, *klinis* (unless that exact statement is recorded and approved).

**Copy examples.**

| Use | Avoid |
| --- | --- |
| "Yang ada risetnya itu bahannya, bukan sampo merek ini. Jadi anggap ini petunjuk, bukan jaminan." | "Terbukti secara ilmiah! Rambut auto tebal!" |
| "Ada studi kecil di orang dewasa dengan kulit kering, 4 minggu. Hasilnya oke, tapi yang diuji formulanya sendiri." | "Studi membuktikan produk ini memperbaiki skin barrier dalam 14 hari." |
| "Contoh yang komposisinya begitu: [produk]. Link afiliasi: [link]" | "Checkout sekarang sebelum kehabisan!" |

## Truth rules (the core of the brand)

Three kinds of statements, three rules:
1. **General science** (how skin, hair, teeth or eyes generally work): allowed as plain-language education, with no numbers, no study claims and no product outcomes.
2. **Research findings:** only from evidence approved in Rawatlogi. Retell them like a person and put the limitation next to the finding.
3. **Product results:** never, unless approved evidence tested that exact product. Seller claims, BPOM numbers and product names are not evidence.

Eyes and teeth sit close to medicine: talk about ingredients and habits, not diagnosis, prescription treatment or medicines.

## Level bukti (evidence level)

Every post and image carries one `EvidenceLabel`. Pick it from the evidence status in Rawatlogi, never from the product listing:

| Label | Use when | Token |
| --- | --- | --- |
| **Riset kuat** | Approved evidence from systematic reviews or several consistent trials | fill `evidence-strong`, text `on-evidence-strong` |
| **Riset terbatas** | Other approved evidence (a single or small study, abstract-only, ingredient not finished product) | outline `evidence-strong` |
| **Ilustrasi konsep** | General-science explanation with no approved evidence | dashed outline `evidence-concept` |
| **Belum ada riset** | The point of the post is that research is missing | fill `area-kulit`, text `ink` |

When in doubt, choose the lower label.

## Visual foundations

**Colour.**
- The ground is `paper`. Text is `ink`, with `muted` for secondary copy. Cards are `card` with a 2px `line` border.
- `teal` is the brand accent and the evidence colour: use it for "logi" in the wordmark, links, takeaways and the strong evidence fill. It passes for small text on `paper`.
- `coral` (*sorot*) is for large shapes only: a "vs", a hook block, a single highlight. Never use it for text under 24px; put `on-coral` text on it.
- `teal-soft` is a quiet panel for "how it works" content.
- Area colours (`area-rambut`, `area-kulit`, `area-gigi`, `area-mata`, `area-badan`) mark the topic. Use them only on `AreaLabel`, thumbnail corners and small accents, never as page backgrounds. Text on `area-rambut` and `area-mata` is `paper`; text on the other three is `ink`.
- In the dark theme every token flips. Area fills stay the same, because they carry their own text colour.

**Type.**
- Plus Jakarta Sans for everything people read: `display-xl` for thumbnail hooks, `display-l` for explainer titles, `title`/`heading` for cards, `body` for copy, `label` for chips.
- JetBrains Mono (`mono-source`, `mono-label`) only for sources, numbers and small eyebrow labels, so data always looks like data.
- Headlines use weight 800 with tight tracking. Never set body copy in mono.

**Spacing and layout.**
- An 8px scale: `space-1` to `space-12`.
- Social images keep a `space-8` (64px) safe margin on every edge.
- Lay groups out with flex/grid gaps, not margins.

**Radius.**
- `radius-md` for small panels.
- `radius-lg` for cards and image panels.
- `radius-pill` for every label.

There are no drop shadows: separate surfaces with a `line` border.

**Imagery.**
- Flat illustration from simple shapes: drops, layers, bricks, a lid, a lens.
- The product photo appears only as recorded in Rawatlogi, never redrawn.
- No real faces, no before/after of skin, hair, teeth or eyes, no clinical close-ups, and no other brands' logos.
- Every image carries an `AreaLabel` and an `EvidenceLabel` in a top corner, and the `Wordmark` small in a bottom corner.

**Iconography.**
- The motif is the lens: we "zoom in" on a claim until its research shows.
- Icons are inline stroke drawings in `ink` or `teal` (2–3px strokes, round caps). There is no icon font.
- Emoji never act as icons.

## Formats

| Where | Size | Component |
| --- | --- | --- |
| X post image | 1600×900 | `PostThumbnail`, `ExplainerCard` |
| X header | 1500×500 | Wordmark + motto on `ink` |
| Threads carousel | 1080×1350 (4:5) or 1080×1080 | same components, scaled |
| TikTok / Shopee Video / Reels | 1080×1920 (9:16) | hook text in `display-l` within the safe area |
| Profile photo | square, shown as a circle | `Wordmark` avatar variant |

See the **Social media** and **Content playbook** sections for platform details, bios and the launch plan.

## Do and don't

- Do lead with one useful idea, then the product, then the link.
- Do put the limitation of a study right beside it.
- Do pick the lower `EvidenceLabel` when unsure.
- Don't put `coral` text on `paper`.
- Don't stack more than two labels on an image.
- Don't use the organization's or another brand's design system for Rawatlogi assets.
