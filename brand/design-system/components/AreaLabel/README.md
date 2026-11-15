A pill that names which part of personal care a post is about: Rambut, Kulit, Gigi & mulut, Mata, or Badan & kuku.

- **Consumer provides:** the area (one of the five) and the size: `label` style at 15px in documents, scaled to 24–26px on 1600-wide images.
- **Fill and text:**
  - Rambut: `area-rambut` with `paper` text.
  - Kulit: `area-kulit` with `ink` text.
  - Gigi & mulut: `area-gigi` with `ink` text.
  - Mata: `area-mata` with `paper` text.
  - Badan & kuku: `area-badan` with `ink` text.
- **Shape:** `radius-pill`, horizontal padding about 1.3× the text size, vertical padding about 0.6×.
- **Placement:** first of the two labels in a top corner of every image, followed by the `EvidenceLabel`.
- **Rules:**
  - Exactly one area per post. A topic that spans two areas picks the main one.
  - Don't use area colours for anything except this label, thumbnail corners and small accents.
