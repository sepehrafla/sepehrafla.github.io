import * as THREE from 'three';
import type {Act} from './GardenState';

const views:Record<Exclude<Act,'finale'>,THREE.Vector3>={1:new THREE.Vector3(-30,0,-30),2:new THREE.Vector3(30,0,-30),3:new THREE.Vector3(-30,0,30),4:new THREE.Vector3(30,0,30)};

export class SceneManager{
  renderer:THREE.WebGLRenderer;scene=new THREE.Scene();camera:THREE.OrthographicCamera;target=new THREE.Vector3(-30,0,-30);look=new THREE.Vector3(-30,0,-30);base=new THREE.Vector3();sun:THREE.DirectionalLight;
  constructor(public host:HTMLElement){
    this.renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.setClearColor(0x1a1a22);host.prepend(this.renderer.domElement);
    this.camera=new THREE.OrthographicCamera(-18,18,12,-12,.1,260);this.camera.zoom=1;this.scene.add(new THREE.HemisphereLight(0xfff2d1,0x26365b,2.4));this.sun=new THREE.DirectionalLight(0xffd18b,3.2);this.sun.position.set(-22,35,-12);this.scene.add(this.sun);this.resize();addEventListener('resize',()=>this.resize())
  }
  canvas(){return this.renderer.domElement}
  resize(){const w=this.host.clientWidth,h=this.host.clientHeight,aspect=w/Math.max(h,1),size=aspect<.8?28/aspect:24;this.camera.left=-size*aspect;this.camera.right=size*aspect;this.camera.top=size;this.camera.bottom=-size;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false)}
  go(act:Act){if(act==='finale'){this.target.set(0,0,0);return}this.target.copy(views[act])}
  update(dt:number,finale=false){this.look.lerp(this.target,1-Math.exp(-dt*1.8));if(finale)this.base.set(this.look.x,67,this.look.z+.01);else this.base.set(this.look.x+28,this.look.y+38,this.look.z+28);this.camera.position.copy(this.base);this.camera.lookAt(this.look)}
  render(){this.renderer.render(this.scene,this.camera)}
  async painting(){const oldSize=new THREE.Vector2(),oldRatio=this.renderer.getPixelRatio();this.renderer.getSize(oldSize);this.renderer.setPixelRatio(1);this.renderer.setSize(2160,2160,false);this.camera.left=this.camera.bottom=-48;this.camera.right=this.camera.top=48;this.camera.updateProjectionMatrix();this.render();const blob=await new Promise<Blob|null>(resolve=>this.renderer.domElement.toBlob(resolve,'image/png'));this.renderer.setPixelRatio(oldRatio);this.renderer.setSize(oldSize.x,oldSize.y,false);this.resize();return blob}
}
