import RAPIER from '@dimforge/rapier3d-compat';
import {Object3D,Quaternion,Vector3} from 'three';
import {TUNING} from '../tuning';

type Sync={body:RAPIER.RigidBody;mesh:Object3D;previous:Vector3;current:Vector3;previousQ:Quaternion;currentQ:Quaternion};
export type ContactHandler=(force:number,colliderA:RAPIER.Collider,colliderB:RAPIER.Collider)=>void;

export class Physics{
  world:RAPIER.World;events:RAPIER.EventQueue;accumulator=0;alpha=0;syncs:Sync[]=[];contact?:ContactHandler;
  private constructor(){this.world=new RAPIER.World({x:0,y:-9.81,z:0});this.world.timestep=TUNING.step;this.events=new RAPIER.EventQueue(true)}
  static async create(){await RAPIER.init();return new Physics()}
  add(body:RAPIER.RigidBody,mesh:Object3D){const p=body.translation(),q=body.rotation();const sync={body,mesh,previous:new Vector3(p.x,p.y,p.z),current:new Vector3(p.x,p.y,p.z),previousQ:new Quaternion(q.x,q.y,q.z,q.w),currentQ:new Quaternion(q.x,q.y,q.z,q.w)};this.syncs.push(sync);this.interpolateSync(sync,1)}
  remove(body:RAPIER.RigidBody){this.syncs=this.syncs.filter(sync=>sync.body!==body);this.world.removeRigidBody(body)}
  step(frameDt:number,beforeStep:(dt:number)=>void,afterStep:(dt:number)=>void){let stepped=false;
    this.accumulator=Math.min(.2,this.accumulator+frameDt);
    while(this.accumulator>=TUNING.step){stepped=true;beforeStep(TUNING.step);for(const sync of this.syncs){sync.previous.copy(sync.current);sync.previousQ.copy(sync.currentQ)}this.world.step(this.events);this.drainContacts();for(const sync of this.syncs){const p=sync.body.translation(),q=sync.body.rotation();sync.current.set(p.x,p.y,p.z);sync.currentQ.set(q.x,q.y,q.z,q.w)}afterStep(TUNING.step);this.accumulator-=TUNING.step}
    this.alpha=this.accumulator/TUNING.step;for(const sync of this.syncs)this.interpolateSync(sync,this.alpha);return stepped;
  }
  interpolateSync(sync:Sync,alpha:number){sync.mesh.position.lerpVectors(sync.previous,sync.current,alpha);sync.mesh.quaternion.slerpQuaternions(sync.previousQ,sync.currentQ,alpha)}
  drainContacts(){this.events.drainContactForceEvents(event=>{if(!this.contact)return;const a=this.world.getCollider(event.collider1()),b=this.world.getCollider(event.collider2());if(a&&b)this.contact(event.totalForceMagnitude(),a,b)})}
  fixedBox(x:number,y:number,z:number,hx:number,hy:number,hz:number,userData?:unknown){const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x,y,z));const collider=this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx,hy,hz).setFriction(.9),body);collider.userData=userData;return{body,collider}}
}

export {RAPIER};
