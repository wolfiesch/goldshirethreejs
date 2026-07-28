# Reference set

This project is procedural, so there is no art pipeline to compare against. These
images are the specification: when the build and a reference disagree, the
reference wins.

Sources: [Goldshire](https://warcraft.wiki.gg/wiki/Goldshire),
[Lion's Pride Inn](https://warcraft.wiki.gg/wiki/Lion%27s_Pride_Inn),
[Elwynn Forest](https://warcraft.wiki.gg/wiki/Elwynn_Forest),
[Wowhead Classic gallery](https://www.wowhead.com/classic/gallery=295/lions-pride-inn).
They are Blizzard screenshots held here for visual comparison only.

## `images/` — what each one settles

| File | What it settles |
|---|---|
| `Lions_Pride_Inn.jpg` | Hero shot. Roof sag and overhang, corner posts, lozenge placement, chimney |
| `GoldshireInn.jpg` | The same building at night: window glow, lantern falloff |
| `goldshire_winterveil.jpg` | Inn from the porch side in warm light: belt beam, plaster, post flare |
| `Goldshire_Town.jpg` | Wide town shot: smithy, inn, road, banner, fences |
| `Goldshire.jpg` | Smithy forge close up, road surface, notice board, awning stall |
| `inn_interior.jpg` | Ground floor: bowed ceiling beams, brick hearth, plank tone, stair |
| `elwynn_forest.jpg` | Tree trunk scale and profile, grass, ground flowers, stumps |
| `northshire_stables.jpg` | Open-shed construction, post proportions |
| `goldshire_comic.jpg`, `goldshire_journey.jpg` | Massing and relative placement |
| `goldshire_alpha.jpg`, `goldshire_legends.jpg`, `goldshire_pictures.jpg` | Secondary massing views |
| `northshire_south.jpg`, `northshire_vineyards.jpg` | Elwynn architecture at large |
| `crystal_forge.jpg` | Forge interior detail |
| `Lionsprideinn.png` | Small inn elevation |
| `WorldMap-Elwynn.jpg` | Road topology at zone scale |
| `_verify_Lions_Pride_Inn.png` | Annotated crop sheet the palette numbers were sampled from |

## `map/` — where the layout numbers came from

Orthographic minimap tiles at roughly 1 px per yard, plus marked-up crops.
Combined with `WorldMapArea.dbc` for the coordinate rectangle and the cmangos
Classic world DB for spawn positions.

World units are already yards. The conversion used throughout the source:

```
sceneX = 68 - worldY      (+X east)
sceneZ = -worldX - 9487   (+Z south)
origin = the road junction
```

## `board.html` — the alignment, pair by pair

Open it from the dev server (`npm run dev`, then `/refs/board.html`) or straight
off disk. Every reference image sits beside the frame this build renders of the
same thing, with a note on what the pair settles and, where the build knowingly
departs from the reference, why. It also carries the verification table: what
was checked, with which instrument, and what came back.

## `before/`, `after/`

Screenshots of every `?cam=` preset, captured by `node tools/shoot.mjs`.
`before/` is the state at the start of the reference-alignment work; `after/` is
the current state. `hashes.json` in each makes "did this stage change anything"
a one-line question:

```
node tools/shoot.mjs --out refs/after
node tools/shoot.mjs --compare refs/before refs/after
```

`after/time/` is the same view at 00, 05, 08, 13, 18 and 21 hours;
`after/verify/` holds the `?wire=1` and `?collider=1` shots.

## The instruments

```
node tools/shoot.mjs      # deterministic screenshots of every preset
node tools/lint-layout.mjs    # pad, road, fence, water and prop invariants
node tools/lint-collider.mjs  # drop test over every walkable surface
node tools/perf.mjs           # frame time with real draw and triangle counts
```

`lint-collider` exists because `?collider=1` cannot answer the question it looks
like it answers: the BVH helper is depth-tested, so from inside a sealed room it
draws nothing at all.

## Three numbers in the source data that are traps

- **The 57 m inn footprint on the minimap is a model bounding box, not walls.**
  Adjoining blue roofs merge into one blob: inn plus stable plus a neighbour.
  The authored 16 x 10 m inn is kept, placed at the blob centroid, with the
  stable at the far end so the pair spans the blob.
- **The `+6.85` upper-floor and `-7.15` cellar offsets are WoW model space.**
  `+6.85` is numerically identical to `INN.eaves`, which is the tell: a deck at
  the eaves plate has zero headroom. `floorU = 4.3` and `cellarFloor = -2.5`
  stand.
- **The 2.5 m westward terrain rise is not worth its cost.** `heightAt` flattens
  to exactly y = 0 under every road and pad, and every placement is authored at
  `pos[1] = 0`. A base slope means per-pad datums through all of it for 2 m of
  relief over 120 m.

There is no stream and no bridge in Goldshire. The nearest water is 460 m NNE.
