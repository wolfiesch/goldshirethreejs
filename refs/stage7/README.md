# Stage 7 evidence

## 7a null case

The rotation-aware `insetInRect`, `rotateOffset`, `apronMesh` and pad-ring
sampler must be exact no-ops when every bearing is zero. Both runs below set
each `PLACEMENTS.rotY` to 0 and hold the aprons at their old heights; one ran
against the new code, the other against the previous commit.

`null-new/hashes.json` and `null-old/hashes.json` agree on all six presets, so
the rotation code is proven by the null case and any later difference is a
coordinate change rather than a maths error. The images themselves are dropped:
identical hashes are the evidence, and two copies of the same six frames are
8 MB of nothing.

`7a/` is the same six presets with the real bearings restored and the apron
z-fight offsets applied (apron surface 0.024, forecourt 0.026, forecourt verge
0.013).
