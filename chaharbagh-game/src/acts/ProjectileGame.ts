import * as THREE from 'three';
import {Physics,RAPIER} from '../core/Physics';
import type {Input} from '../core/Input';
import type {Particles} from '../feel/Particles';
import type {Sound} from '../feel/Sound';
import {C} from '../world/Garden';
import {TUNING} from '../tuning';

export type Shot={mesh:THREE.Mesh;body:RAPIER.RigidBody;collider:RAPIER.Collider;age:number;bounced:boolean;kind:'energy'|'gift'};
export class ProjectileGame{
  shots:Shot[]=[];charge=0;preview:THREE.Points;origin=new THREE.Vector3();aim=new THREE.Vector3(1,.55,0);plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);ray=new THREE.Raycaster();onLand?:(shot:Shot,position:THREE.Vector3)=>void;
  constructor(public scene:THREE.Scene,public physics:Physics,public input:Input,public camera:THREE.Camera,public particles:Particles,public sound:Sound){const geometry=new THREE.BufferGeometry(),positions=new Float32Array(22*3);geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));this.preview=new THREE.Points(geometry,new THREE.PointsMaterial({color:C.gold,size:.32,transparent:true,opacity:.72}));this.preview.visible=false;scene.add(this.preview)}
  setOrigin(x:number,z:number){this.origin.set(x,1.35,z)}
  fixedUpdate(dt:number,kind:'energy'|'gift',enabled=true){if(enabled&&this.input.actionDown){this.charge=Math.min(TUNING.chargeSeconds,this.charge+dt);this.preview.visible=true;this.updateAim();this.updatePreview()}if(enabled&&this.input.actionReleased&&this.charge>.05){this.launch(kind);this.charge=0;this.preview.visible=false}for(const shot of [...this.shots]){shot.age+=dt;const p=shot.body.translation();if(p.y<.18||shot.age>6)this.land(shot,new THREE.Vector3(p.x,.2,p.z))}}
  updateAim(){this.ray.setFromCamera(this.input.pointer,this.camera);const hit=new THREE.Vector3();if(this.ray.ray.intersectPlane(this.plane,hit)){this.aim.copy(hit).sub(this.origin);this.aim.y=Math.max(5,this.aim.length()*.38);this.aim.normalize()}else this.aim.set(1,.55,0).normalize()}
  velocity(){return TUNING.projectileMin+(TUNING.projectileMax-TUNING.projectileMin)*(this.charge/TUNING.chargeSeconds)}
  updatePreview(){const speed=this.velocity(),array=(this.preview.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;for(let i=0;i<22;i++){const t=i*.075,j=i*3;array[j]=this.origin.x+this.aim.x*speed*t+1.4*t*t;array[j+1]=this.origin.y+this.aim.y*speed*t+.5*TUNING.projectileGravity*t*t;array[j+2]=this.origin.z+this.aim.z*speed*t}(this.preview.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate=true}
  launch(kind:'energy'|'gift'){const material=new THREE.MeshToonMaterial({color:kind==='energy'?C.gold:C.turquoise,emissive:kind==='energy'?C.saffron:C.lapis,emissiveIntensity:.35}),mesh=new THREE.Mesh(new THREE.SphereGeometry(kind==='energy'?.6:.5,12,8),material);mesh.position.copy(this.origin);this.scene.add(mesh);const body=this.physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(this.origin.x,this.origin.y,this.origin.z).setCcdEnabled(true)),collider=this.physics.world.createCollider(RAPIER.ColliderDesc.ball(kind==='energy'?.6:.5).setMass(.8).setRestitution(.52).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS),body);collider.userData={role:'projectile'};const v=this.velocity();body.setLinvel({x:this.aim.x*v+2.8,y:this.aim.y*v,z:this.aim.z*v},true);this.physics.add(body,mesh);this.shots.push({mesh,body,collider,age:0,bounced:false,kind});this.sound.whoosh()}
  land(shot:Shot,position:THREE.Vector3){this.onLand?.(shot,position);this.remove(shot)}
  remove(shot:Shot){this.scene.remove(shot.mesh);this.physics.remove(shot.body);this.shots.splice(this.shots.indexOf(shot),1)}
  markBounce(collider:RAPIER.Collider){if((collider.userData as {role?:string})?.role==='projectile'){const shot=this.shots.find(item=>item.collider===collider);if(shot)shot.bounced=true}}
}
