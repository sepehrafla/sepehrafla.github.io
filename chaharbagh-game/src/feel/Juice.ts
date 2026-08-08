import {Camera,Vector3} from 'three';
import {TUNING} from '../tuning';

export class Juice{
  trauma=0;hitstop=0;offset=new Vector3();time=0;
  shake(impulse:number){this.trauma=Math.min(1,this.trauma+impulse*.012)}
  freeze(frames:number=TUNING.hitstopFrames){this.hitstop=Math.max(this.hitstop,frames)}
  shouldStep(){if(this.hitstop<=0)return true;this.hitstop--;return false}
  update(dt:number,camera:Camera){this.time+=dt;this.trauma=Math.max(0,this.trauma-TUNING.traumaDecay*dt);const amount=this.trauma*this.trauma;this.offset.set(Math.sin(this.time*71)*amount*.7,Math.sin(this.time*53+1)*amount*.38,Math.sin(this.time*89)*amount*.55);camera.position.add(this.offset);camera.rotation.z=Math.sin(this.time*47)*amount*.013}
}
