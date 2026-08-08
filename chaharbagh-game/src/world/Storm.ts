import * as THREE from 'three';
import type {Physics} from '../core/Physics';
import type {PlayerRig} from '../player/PlayerRig';
import type {Particles} from '../feel/Particles';
import type {Sound} from '../feel/Sound';
import {C,basic} from './Garden';
import {TUNING} from '../tuning';

export class Storm{
  mesh:THREE.Mesh;active=false;warning=0;life=0;lane=0;direction=new THREE.Vector3();center=new THREE.Vector3();next=TUNING.stormPeriod;onPass?:()=>void;
  constructor(scene:THREE.Scene,public physics:Physics,public rig:PlayerRig,public particles:Particles,public sound:Sound){const material=basic(C.ink,{transparent:true,opacity:.4,depthWrite:false,side:THREE.DoubleSide});this.mesh=new THREE.Mesh(new THREE.CylinderGeometry(TUNING.stormRadius,TUNING.stormRadius,15,32,1,true),material);this.mesh.visible=false;scene.add(this.mesh)}
  summon(quadrant:1|3){this.active=true;this.warning=8;this.life=22;this.lane=[-12,0,12][Math.floor(Math.random()*3)];const z=quadrant===1?-30:30;this.center.set(-64,6,z+this.lane);this.direction.set(1,0,0);this.mesh.position.copy(this.center);this.mesh.visible=true;this.sound.whoosh()}
  fixedUpdate(dt:number,quadrant:1|3,extraWind=0){this.next-=dt;if(!this.active&&this.next<=0){this.summon(quadrant);this.next=TUNING.stormPeriod}if(!this.active)return;this.warning=Math.max(0,this.warning-dt);const speed=this.warning>0?1.5:7;this.center.addScaledVector(this.direction,speed*dt);this.mesh.position.copy(this.center);this.mesh.rotation.y+=dt*.2;const p=this.rig.playerBody.translation(),dx=p.x-this.center.x,dz=p.z-this.center.z,d=Math.hypot(dx,dz);if(d<TUNING.stormRadius&&this.warning<=0){const heavy=this.rig.heavyBody.translation(),anchored=this.rig.anchored,behind=(p.x-heavy.x)*this.direction.x<0,shield=anchored&&behind&&Math.hypot(p.x-heavy.x,p.z-heavy.z)<8;if(!shield){const force=(TUNING.stormForce+extraWind)*dt;[this.rig.rodBody,this.rig.heavyBody,this.rig.volatileBody].forEach(body=>body.applyImpulse({x:this.direction.x*force,y:.15,z:this.direction.z*force},true));this.particles.emit(new THREE.Vector3(p.x,1,p.z),C.ink,2,3,2)}}for(const middle of (this.rig.scene.userData.middles||[])){const m=middle as {body:{translation:()=>{x:number;y:number;z:number};setEnabled:(v:boolean)=>void};mesh:THREE.Object3D;shattered:boolean};if(m.shattered)continue;const q=m.body.translation();if(Math.hypot(q.x-this.center.x,q.z-this.center.z)<TUNING.stormRadius){m.shattered=true;m.mesh.visible=false;m.body.setEnabled(false);this.particles.emit(new THREE.Vector3(q.x,q.y,q.z),C.vermilion,24,6,5)}}this.life-=dt;if(this.life<=0||this.center.x>68){this.active=false;this.mesh.visible=false;this.onPass?.()}}
  renderUpdate(){if(!this.active)return;const material=this.mesh.material as THREE.MeshBasicMaterial;material.opacity=this.warning>0?.13+Math.sin(performance.now()*.006)*.04:.36;for(let i=0;i<3;i++)this.particles.emit(new THREE.Vector3(this.center.x+(Math.random()-.5)*22,Math.random()*6,this.center.z+(Math.random()-.5)*22),C.ink,1,2,2)}
}
