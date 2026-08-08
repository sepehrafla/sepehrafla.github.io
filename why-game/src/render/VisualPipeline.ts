import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/** A small cinematic pipeline: bright emissive details bloom, while the paper
 * world stays crisp. On constrained/mobile devices we render directly. */
export class VisualPipeline {
  composer?: EffectComposer;
  private bloom?: UnrealBloomPass;
  private enabled: boolean;

  constructor(
    private renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = false;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    this.enabled = !matchMedia("(prefers-reduced-motion: reduce)").matches && memory >= 4;
    if (!this.enabled) return;

    this.composer = new EffectComposer(renderer);
    // Bloom stays at 1x on touch-sized screens even when the canvas itself is
    // retina-sharp. This keeps the expensive blur passes comfortably mobile.
    this.composer.setPixelRatio(innerWidth < 720 ? 1 : Math.min(devicePixelRatio, 1.5));
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  resize(width: number, height: number) {
    this.composer?.setSize(width, height);
    this.bloom?.setSize(width, height);
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    if (this.composer) this.composer.render();
    else this.renderer.render(scene, camera);
  }
}
