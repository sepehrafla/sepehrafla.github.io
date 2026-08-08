import * as THREE from "three";
import { Physics, RAPIER } from "../core/Physics";
import type { SaveState } from "../core/SaveState";
import { T } from "../bike/Tuning";
type Chunk = {
  id: number;
  root: THREE.Group;
  body: RAPIER.RigidBody;
  paint: THREE.ShaderMaterial;
  points: THREE.Vector2[];
};
const palettes = [
  [0x6f2cff, 0xff3f99],
  [0x1bd7dc, 0x7752ff],
  [0xff5e62, 0xffb24a],
  [0x7c5cff, 0xff74c8],
];
export class Terrain {
  chunks = new Map<number, Chunk>();
  lastCenter = 999;
  constructor(
    public scene: THREE.Scene,
    public physics: Physics,
    public state: SaveState,
    public seed: number,
  ) {}
  height(x: number) {
    const phase = (this.seed % 628) / 100;
    const base = Math.sin(x * 0.055 + phase) * 0.7 + Math.sin(x * 0.017) * 0.5,
      chunk = Math.floor(x / 60),
      local = x - chunk * 60;
    // A kicker every chunk (~60m) so jumps are common enough to actually find:
    // a short, steep rise to a lip, then a longer, gentler fall so a bike
    // carrying speed launches clean instead of just cresting a hill.
    // The collider and the bike's ground sensor share this shape.
    if (local < 20 || local > 34) return base;
    const smooth =
      local <= 26
        ? ((t) => t * t * (3 - 2 * t))((local - 20) / 6)
        : ((t) => t * t * (3 - 2 * t))(1 - (local - 26) / 8);
    return base + smooth * 2.3;
  }
  biome(x: number) {
    return Math.min(3, Math.max(0, Math.floor(x / 420)));
  }
  region(x: number) {
    return Math.floor(x / T.paintRegion);
  }
  paintAt(x: number) {
    return this.state.paint[this.region(x)] || 0;
  }
  stream(x: number) {
    const center = Math.floor(x / 60);
    if (center === this.lastCenter) return;
    this.lastCenter = center;
    for (let i = center - 3; i <= center + 3; i++)
      if (!this.chunks.has(i)) this.make(i);
    for (const [id, c] of this.chunks)
      if (Math.abs(id - center) > 4) {
        this.scene.remove(c.root);
        this.physics.world.removeRigidBody(c.body);
        this.chunks.delete(id);
      }
  }
  make(id: number) {
    const start = id * 60,
      points: THREE.Vector2[] = [];
    for (let i = 0; i <= 40; i++) {
      const x = start + i * 1.5;
      points.push(new THREE.Vector2(x, this.height(x)));
    }
    const positions: number[] = [],
      indices: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      positions.push(p.x, p.y, 0.1, p.x, p.y - 13, 0.1);
      if (i < points.length - 1) {
        const j = i * 2;
        indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const biome = this.biome(start),
      [a, b] = palettes[biome],
      paint = this.shader(a, b, this.paintAt(start));
    const mesh = new THREE.Mesh(geometry, paint),
      root = new THREE.Group();
    root.add(mesh);
    const neonEdge = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p.x, p.y + 0.035, 0.42))),
      new THREE.LineBasicMaterial({ color: 0xff4ca3, transparent: true, opacity: 0.82, toneMapped: false }),
    );
    root.add(neonEdge);
    const cave = new THREE.Mesh(
      new THREE.BufferGeometry().setFromPoints(
        points.map((p) => new THREE.Vector3(p.x, p.y - 7, -2)),
      ),
      new THREE.LineBasicMaterial({
        color: 0x5b287d,
        transparent: true,
        opacity: 0.45,
      }),
    );
    root.add(cave);
    const props = this.props(points, biome);
    root.add(props);
    this.scene.add(root);
    const vertices = new Float32Array(points.flatMap((p) => [p.x, p.y])),
      body = this.physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed()),
      collider = this.physics.world.createCollider(
        RAPIER.ColliderDesc.polyline(vertices)
          .setFriction(T.friction)
          .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS),
        body,
      );
    (collider as RAPIER.Collider & { tag?: string }).tag = "terrain";
    this.chunks.set(id, { id, root, body, paint, points });
  }
  shader(c1: number, c2: number, explored: number) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uPaint: { value: explored },
        uBloom: { value: 0 },
        uBloomX: { value: 0 },
        uColor1: { value: new THREE.Color(c1) },
        uColor2: { value: new THREE.Color(c2) },
      },
      vertexShader: `varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform float uPaint,uBloom,uBloomX;uniform vec3 uColor1,uColor2;varying vec2 vP;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5);}void main(){float bloom=smoothstep(18.,0.,abs(vP.x-uBloomX))*uBloom;float p=clamp(max(uPaint,bloom),0.,1.);float grid=step(.92,fract(vP.y*.85))+step(.96,fract(vP.x*.24));float noise=hash(floor(vP*2.))*0.035;vec3 asphalt=vec3(.035,.018,.075)+grid*vec3(.15,.035,.22);float wash=sin(vP.x*.18+vP.y*.31)*.12+hash(floor(vP*1.6))*.11;vec3 color=mix(uColor1,uColor2,clamp((vP.y+6.)*.07+wash,0.,1.));color*=.62+grid*.32;gl_FragColor=vec4(mix(asphalt+noise,color,.28+p*.52),1.);}`,
    });
  }
  props(points: THREE.Vector2[], biome: number) {
    const geo =
        biome === 1
          ? new THREE.ConeGeometry(0.28, 1.4, 6)
          : new THREE.PlaneGeometry(0.5, 1.5),
      mat = new THREE.MeshStandardMaterial({
        color: 0x210b3d,
        side: THREE.DoubleSide,
        roughness: 0.92,
        metalness: 0,
      }),
      inst = new THREE.InstancedMesh(geo, mat, 24),
      m = new THREE.Matrix4();
    for (let i = 0; i < 24; i++) {
      const p =
          points[
            Math.min(points.length - 1, Math.floor((i / 24) * points.length))
          ],
        x = p.x + (i % 3) * 0.6;
      m.makeTranslation(x, p.y + 0.65, -0.2 - (i % 4) * 0.08);
      m.multiply(new THREE.Matrix4().makeRotationZ(((i % 5) - 2) * 0.08));
      inst.setMatrixAt(i, m);
    }
    return inst;
  }
  updatePaint(x: number, amount: number) {
    const region = this.region(x);
    this.state.paint[region] = Math.min(
      1,
      (this.state.paint[region] || 0) + amount,
    );
    for (const chunk of this.chunks.values())
      if (Math.abs(chunk.id * 60 - x) <= 60)
        chunk.paint.uniforms.uPaint.value = this.state.paint[region];
  }
  bloom(x: number) {
    for (const chunk of this.chunks.values()) {
      chunk.paint.uniforms.uBloom.value = 1;
      chunk.paint.uniforms.uBloomX.value = x;
    }
    let v = 1;
    const timer = setInterval(() => {
      v -= 0.018;
      for (const chunk of this.chunks.values())
        chunk.paint.uniforms.uBloom.value = Math.max(0, v);
      if (v <= 0) clearInterval(timer);
    }, 45);
  }
}
