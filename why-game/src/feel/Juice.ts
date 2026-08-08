import * as THREE from 'three';
export class Juice{
  trauma=0;stop=0;t=0;
  /** amount is normalised 0..1 — callers map raw impact force themselves. */
  shake(amount:number){this.trauma=Math.min(1,this.trauma+Math.max(0,amount))}
  freeze(frames:number){this.stop=Math.max(this.stop,frames)}
  step(){if(this.stop<=0)return true;this.stop--;return false}
  update(dt:number,camera:THREE.Camera){
    this.t+=dt;
    this.trauma=Math.max(0,this.trauma-dt*2.6);
    if(this.trauma<=0){camera.rotation.z=0;return}
    const n=this.trauma*this.trauma;
    camera.position.x+=Math.sin(this.t*73)*n*.22;
    camera.position.y+=Math.sin(this.t*57)*n*.16;
    camera.rotation.z=Math.sin(this.t*61)*n*.007;
  }
}
