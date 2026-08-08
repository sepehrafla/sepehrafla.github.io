# Asset credits

All real (non-procedural) art assets used in this game are CC0 (public domain,
no attribution required) — credited here anyway for provenance.

- **Concrete034** (ground albedo/normal/roughness) — [ambientCG](https://ambientcg.com/view?id=Concrete034), CC0.
- **Metal032** (dock panel albedo/normal/roughness/metalness) — [ambientCG](https://ambientcg.com/view?id=Metal032), CC0.
- **Metal063** (weathered/rust trim albedo/normal/roughness) — [ambientCG](https://ambientcg.com/view?id=Metal063), CC0.

A CC0 HDRI (Poly Haven's "Kloofendal 43D Clear Puresky") was also tried, as
image-based lighting via `scene.environment`. Dropped: verified live that
even at a very low intensity it blew out the real textures above under ACES
tone mapping (an outdoor sun-capture HDRI's raw radiance is far above this
scene's other lights) — not worth taming for what was a reflections-only
nicety. See `src/world/Environment.ts`'s header comment.

The drone model itself remains fully procedural (`src/drone/DroneArt.ts`) —
these textures are used to make the *environment* (ground, dock structure)
read as real material rather than flat color.
