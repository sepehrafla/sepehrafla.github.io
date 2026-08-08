import * as THREE from 'three';import {T} from '../bike/Tuning';
export class RideCamera{
  camera:THREE.OrthographicCamera;
  target=new THREE.Vector3();
  /** Unshaken truth. Juice offsets camera.position on top of this each frame,
   *  so shake never feeds back into the follow lerp. */
  base=new THREE.Vector3(0,5,30);
  constructor(public renderer:THREE.WebGLRenderer){
    this.camera=new THREE.OrthographicCamera(-16,16,9,-9,.1,200);
    this.camera.position.copy(this.base);
    this.resize();
    addEventListener('resize',()=>this.resize());
  }
  resize(){
    const w=innerWidth,h=innerHeight,a=w/h,s=10;
    this.camera.left=-s*a;this.camera.right=s*a;this.camera.top=s;this.camera.bottom=-s;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w,h,false);
  }
  update(dt:number,x:number,y:number,vx:number,air:number){
    const lead=Math.max(-2,Math.min(T.cameraLead,vx*.32)),
      zoom=1/Math.max(1,Math.min(1.32,1+Math.abs(vx)*.008+air*.018));
    this.target.set(x+lead,y+2,30);
    this.base.lerp(this.target,1-Math.exp(-dt*4));
    this.camera.position.copy(this.base);
    this.camera.rotation.z=0;
    this.camera.zoom+=(zoom-this.camera.zoom)*(1-Math.exp(-dt*2));
    this.camera.updateProjectionMatrix();
  }
}
