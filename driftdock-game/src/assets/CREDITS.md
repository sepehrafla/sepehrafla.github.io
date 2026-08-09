# Asset credits

All real (non-procedural) art assets used in this game are CC0 (public domain,
no attribution required) — credited here anyway for provenance.

- **Metal032** (base module panels + the drone's own frame/legs, see below) — [ambientCG](https://ambientcg.com/view?id=Metal032), CC0.
- **Metal063** (weathered/rust trim albedo/normal/roughness) — [ambientCG](https://ambientcg.com/view?id=Metal063), CC0.
- **Moon 01** (ground albedo/normal/roughness — a real photoscan of a lunar regolith simulant, not a photo of the actual Moon) — [Poly Haven](https://polyhaven.com/a/moon_01), CC0.

A CC0 HDRI (Poly Haven's "Kloofendal 43D Clear Puresky") and a CC0 concrete
ground texture (ambientCG's "Concrete034") were both tried during earlier
development and later dropped — the HDRI blew out real textures under tone
mapping even at low intensity, and the flat concrete didn't fit the lunar
re-theme. A CC0 lunar-surface photoscan (Moon 01, above) replaced the
concrete for that re-theme, and later replaced the procedural canvas-drawn
regolith texture that stood in for it until a suitable scan was sourced.

Sketchfab has several CC0/CC-BY lunar lander and rover models, but none were
imported as a full model swap for the drone: the drone's thrust points,
collider, and landing-gear geometry are all hand-verified against the real
flight physics (see Tuning.ts's attitude-PD comments), and a mismatched
external rig risks silently breaking that alignment for a purely cosmetic
win. Instead the drone's frame/legs (`src/drone/DroneArt.ts`) now wear the
same real Metal032 scan as the base's panels, at a UV repeat tuned for its
much smaller scale, so the two read as the same hardware family up close
without touching geometry. The sky (starfield, sun, Earth) is still fully
procedural (`src/world/Environment.ts`).
