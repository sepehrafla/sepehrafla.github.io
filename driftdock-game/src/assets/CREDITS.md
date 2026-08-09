# Asset credits

All real (non-procedural) art assets used in this game are CC0 (public domain,
no attribution required) — credited here anyway for provenance.

- **Metal032** (base module panel albedo/normal/roughness/metalness) — [ambientCG](https://ambientcg.com/view?id=Metal032), CC0.
- **Metal063** (weathered/rust trim albedo/normal/roughness) — [ambientCG](https://ambientcg.com/view?id=Metal063), CC0.

A CC0 HDRI (Poly Haven's "Kloofendal 43D Clear Puresky") and a CC0 concrete
ground texture (ambientCG's "Concrete034") were both tried during earlier
development and later dropped — the HDRI blew out real textures under tone
mapping even at low intensity, and the ground was replaced by a fully
procedural cratered-regolith texture for the lunar re-theme. Removed rather
than left unused in the bundle.

The drone model and the ground/sky are fully procedural (`src/drone/DroneArt.ts`,
`src/world/Environment.ts`) — the real textures above are used only for the
base structure's metal panels and trim, so they read as real material
rather than flat color.
