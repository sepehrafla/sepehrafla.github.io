import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/** Bloom pass so emissive elements (rotor LEDs, boost rings, gate glow)
 *  actually glow, per the brief's "stunning = ... immaculate HUD" pillar --
 *  cheap and the single highest-value postprocessing effect for this kind
 *  of low-poly-with-emissive-accents look. */
export class VisualPipeline {
  composer: EffectComposer;
  bloom: UnrealBloomPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.4, 0.72);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  resize(w: number, h: number) {
    this.composer.setSize(w, h);
  }

  render() {
    this.composer.render();
  }
}
