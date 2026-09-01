# Blue Dragon Save Editor

A fully client-side web port of **Blue Dragon Complete Save Editor** (the 2013 Windows tool),
rebuilt as a static HTML/CSS/JS site. Works with the raw `savegame.dat` blob used by the
Blue Dragon PC recomp (and matches the blob inside Xbox 360 `.CON` packages, which the
original tool extracted before editing).

**Everything runs in your browser** — your save file is never uploaded anywhere.

## Features (parity with the original editor)

- **Characters** — Shu, Jiro, Kluke, Marumaro, Zola: unlock flag, level, experience,
  current HP/MP, bonus stats, shadows (setting any shadow level above 0 unlocks the
  character's shadows) + all 9 shadow classes (level & SP), and all 7 accessory
  slots (Arm/Finger/Ear/Neck/Special×3). Includes the original's
  *Max Level / Max Stats / Max Shadows* macros.
- **Inventory** — all 431 items grouped as Items / Spellbooks / Accessories /
  Valuables, one long scrollable list per category grouped by type, with quantity
  editing and "set all". Unknown (DLC) items are preserved.
- **Encyclopedia** — monster & boss record counters (258 monsters, 32 bosses) with search.
- **Misc** — gold, medals, Nothings, battle stats (encounters, wins, escapes,
  back/surprise attacks…), difficulty (Normal/Hard/Impossible), play time.
- **Download edited save** gives you two files: `<original-name>.dat` (your edits, ready to drop back into the game folder) and `<original-name>-backup.dat` (the file exactly as loaded). **Revert** re-reads the loaded save.

## Try locally

Open `index.html` directly in a browser (nothing is fetched), or serve the folder:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy to GitHub Pages

1. Commit the contents of this folder (`site/`) at the repo root.
2. Repo **Settings → Pages →** choose your branch → Save.
3. Done — a static site, no build step, no server.

## Testing

The core parser/serializer is verified against a real PC save (`savegame.dat`) —
an unchanged round trip is **byte-identical**, and each edit type is checked to
touch *only* the intended bytes:

```bash
node test/test-core.js [path-to-savegame.dat]
```

## Layout

- `index.html`, `style.css` — the site
- `js/save-data.js` — item/monster tables + field offsets, machine-generated
  from the original tool's decompiled C#
- `js/save-core.js` — save parse/serialize engine (big-endian u32, fixed offsets)
- `js/app.js` — UI
- `test/` — node test suite

## Notes on fidelity

All field offsets, semantics and caps were transcribed from the decompiled
original (not guessed) and verified against a real save: e.g. character block
layout (HP@100, level@164, shadow classes strided every 344 bytes, etc.),
inventory at 16556 (512 × code/qty), monster records at 42240, difficulty at 40788.
The PC recomp blob is byte-compatible with the 360 blob layout; only the outer
`.CON` container differs, which the PC version doesn't use.
