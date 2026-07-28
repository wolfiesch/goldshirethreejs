# Stage 8 evidence

The four landmarks the references have and the build did not, each shot from a
new `?cam=` preset aimed square at the face it is meant to show.

| Shot | Reference it answers | What to check |
|---|---|---|
| `banner.png` | `Goldshire_Town.jpg` | Crenellated top, cream border, gold gryphon, pointed tail, timber arm off a free-standing pole |
| `awning.png` | `Goldshire.jpg` | Red canvas slung between four poles, sagging, Tharynn's stock stacked under it |
| `noticeBoard.png` | `Goldshire.jpg` | Peaked hexagonal panel on two posts, timber X across a pinned face, shingled cap |
| `hitch.png` | `Goldshire_Town.jpg` | Two horses tied broadside on the inn forecourt, ropes running muzzle to rail |

`road.png`, `crossroads.png` and `aerial.png` are the three establishing shots,
for checking that nothing new obstructs a view that already worked. The horses
land in the right third of `road.png`, which is where the reference puts them.
`nightInn.png` is `?cam=hitch&time=21`: the new materials add nothing the bloom
threshold picks up, and the horses read as silhouettes against the lit facade.

The banner cloth is a vertex grid rather than a plane with an alpha-cut map.
An alpha-tested material would be a second material instance that `mergeStatic`
cannot bucket with anything else, and the silhouette is the whole point of a
pennant.

Known and pre-existing: the layout lint reports 6 of 400 pond samples above the
waterline. That is unchanged from `f90b903` and is not a Stage 8 regression;
`hitch` is the fifth by-design `PAD-ON-ROAD`, standing on the inn's paved
forecourt exactly as the stall and the wagon stand on the apron.
