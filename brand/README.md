# Rawatlogi brand

**Classification: INTERNAL**

Rawatlogi is the public brand (science-based personal care: hair, skin, teeth, eyes, body). Fieldnote is the internal studio app that produces its research, posts and images. This folder holds the brand's design system and Claude Design work, snapshotted from the claude.ai Artifacts on 14 November 2026.

## Contents

| Folder | What | Live source (claude.ai, private) |
| --- | --- | --- |
| [design-system/](design-system/README.md) | The design system: [brand book](design-system/README.md), [social media playbook](design-system/social-media.md), [content playbook](design-system/content-playbook.md), [tokens.json](design-system/tokens.json), generated [tokens.css](design-system/tokens.css), and 6 components plus the cover, each with guidelines (`README.md`) and a live preview (`preview.html`) | [Rawatlogi Design System](https://claude.ai/artifact/TPazNhfQXodfdAJfxRyppi) |
| [canvases/brand-brainstorm/](canvases/brand-brainstorm/) | The brainstorm boards: name shortlist, identity, platform mockups, voice and bios. Each board is a `.dc.html` source with a rendered `.png` | [Personal care science brand – brainstorm](https://claude.ai/artifact/AKLnarEycZY5QonTB8qUFT) |
| [canvases/gel-vs-cream-images/](canvases/gel-vs-cream-images/) | The Claude Design canvas for the Gel vs cream X post (thumbnail and explainer), with the design system installed under `ds/rawatlogi/` | [Rawatlogi images – Gel vs cream](https://claude.ai/artifact/HrJu8DEFjD8hUrWJoBYjyh) |
| [images/gel-vs-cream/](images/gel-vs-cream/) | The rendered PNGs attached to that post | (exported locally) |
| [canvases/intro-images/](canvases/intro-images/) | The six images for the brand introduction thread: three for X (1600×900) and three for Threads (1080×1350) | [Rawatlogi images – Kenalan](https://claude.ai/artifact/MDV1uUcQgiTYDsST1fzaXN) |
| [images/intro/](images/intro/) | The rendered intro PNGs attached to the two "Kenalan: ini Rawatlogi" posts | (exported locally) |

## Which copy is the truth

- **The live design system Artifact is the source of truth.** The `fieldnote-post-image` skill reads it each time it designs an image, and the image-design prompt links to it.
- **This folder is the version-controlled copy**, and the fallback when the Artifact can't be reached. The skill uses `brand/design-system/` when `Artifact` `read` fails.
- After changing the brand on claude.ai, ask Claude to "sync the brand folder from the Artifacts". It re-reads each Artifact and overwrites these files.
- Then run `npm run brand:tokens` to regenerate `tokens.css`.
- Don't edit `tokens.css` by hand.

## How the design system reaches the AI prompts

| Design-system rule | Where it lives in the app |
| --- | --- |
| Brand, personality (Teliti/Santai/Jujur), always/never-say, emoji, eye and teeth boundaries ("Bukan saran medis") | The **Writing voice & rules** prompt, shared by the writer and the editor (`shared/prompts.ts`) |
| The 5 series and their shapes | The voice prompt's SERIES block; topic suggestions tag each idea `[Seri · Area]` |
| Areas, Level bukti, series as data | `shared/brand.ts`: slugs, labels and hashtags. Drafts return `area`, `evidenceLevel` and `series`; posts store them, and the post page lets you edit them |
| "No Riset label without approved evidence" | Enforced in code: the draft contract check (`shared/writing.ts`) and the approval check (`shared/model.ts`), not only in the prompt |
| Hashtags (#rawatlogi + series + area, none on X) | Generated from the labels on the post page ("Copy hashtags"), never written into post text |
| Level bukti suggestion after research | The research prompt ends with "Level bukti kalau disetujui:" |
| Visual style and image labels | The **Post image designer** prompt links to the design system; `get_image_brief` passes the post's area, Level bukti and series to the image |

## Using the brand in code

- **Colours, type and spacing as CSS variables:**

  ```html
  <link rel="stylesheet" href="brand/design-system/tokens.css">
  ```

  Then use `var(--teal)`, `var(--paper)`, `var(--radius-lg)`, or a type class such as `.display-xl`.
- **Theme:** `data-theme="dark"` on a parent switches to the dark theme. Social images always use the light theme.
- **Component previews:** open `design-system/components/<Name>/preview.html` in a browser. They fall back to literal colours when `tokens.css` isn't loaded.

## Rendering a canvas board to PNG

```bash
node scripts/dc-to-html.mjs brand/canvases/brand-brainstorm/Identity.dc.html .runner-work/identity.html
```

```bash
node scripts/render-image.mjs .runner-work/identity.html brand/canvases/brand-brainstorm/Identity.png 1600 1100
```
