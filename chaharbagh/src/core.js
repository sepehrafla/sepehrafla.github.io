import * as THREE from '../../assets/three.module.min.js';
import {COLORS,toon} from './world.js';

export function createPlayer(){
  const player=new THREE.Group();
  const robe=new THREE.Mesh(new THREE.ConeGeometry(.72,1.9,8),toon(COLORS.lapis));robe.position.y=.95;player.add(robe);
  const sash=new THREE.Mesh(new THREE.TorusGeometry(.52,.08,5,12),toon(COLORS.gold));sash.rotation.x=Math.PI/2;sash.position.y=1.3;player.add(sash);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.34,10,7),toon(0xc98f68));head.position.y=2.2;player.add(head);
  const turban=new THREE.Mesh(new THREE.TorusGeometry(.32,.1,5,12),toon(COLORS.paper));turban.rotation.x=Math.PI/2;turban.position.y=2.34;player.add(turban);
  player.userData.velocity=new THREE.Vector3();return player;
}

export class Input{
  constructor(canvas){
    this.keys=new Set();this.actionPressed=false;this.actionDown=false;this.drag=null;this.vector=new THREE.Vector2();
    addEventListener('keydown',event=>{
      if(['Space','Enter','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code))event.preventDefault();
      if(['Space','Enter','KeyE'].includes(event.code)&&!this.keys.has(event.code))this.actionPressed=true;
      this.keys.add(event.code);this.actionDown=['Space','Enter','KeyE'].some(code=>this.keys.has(code));
    },{passive:false});
    addEventListener('keyup',event=>{this.keys.delete(event.code);this.actionDown=['Space','Enter','KeyE'].some(code=>this.keys.has(code))});
    canvas.addEventListener('pointerdown',event=>{canvas.setPointerCapture?.(event.pointerId);this.drag={x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,time:performance.now()}});
    canvas.addEventListener('pointermove',event=>{if(!this.drag)return;this.drag.lastX=event.clientX;this.drag.lastY=event.clientY});
    canvas.addEventListener('pointerup',event=>{
      if(this.drag&&Math.hypot(event.clientX-this.drag.x,event.clientY-this.drag.y)<12&&performance.now()-this.drag.time<350)this.actionPressed=true;
      this.drag=null;this.vector.set(0,0);canvas.releasePointerCapture?.(event.pointerId);
    });
  }
  movement(){
    let x=0,y=0;
    if(this.keys.has('ArrowLeft')||this.keys.has('KeyA'))x--;
    if(this.keys.has('ArrowRight')||this.keys.has('KeyD'))x++;
    if(this.keys.has('ArrowUp')||this.keys.has('KeyW'))y--;
    if(this.keys.has('ArrowDown')||this.keys.has('KeyS'))y++;
    if(this.drag){x+=(this.drag.lastX-this.drag.x)/48;y+=(this.drag.lastY-this.drag.y)/48}
    this.vector.set(x,y);if(this.vector.length()>1)this.vector.normalize();return this.vector;
  }
  consume(){const pressed=this.actionPressed;this.actionPressed=false;return pressed}
}

export class CameraRig{
  constructor(camera){this.camera=camera;this.targetPos=new THREE.Vector3();this.targetLook=new THREE.Vector3();this.frustum=62;this.targetFrustum=62;this.setAct(1,true)}
  setAct(act,instant=false){
    const centers={1:[-30,-30],2:[30,-30],3:[-30,30],4:[30,30]};const center=centers[act]||[0,0];
    this.targetLook.set(center[0],0,center[1]);this.targetPos.set(center[0]+42,48,center[1]+42);this.targetFrustum=62;
    if(instant){this.camera.position.copy(this.targetPos);this.frustum=this.targetFrustum;this.apply()}
  }
  finale(){this.targetLook.set(0,0,0);this.targetPos.set(.01,112,.01);this.targetFrustum=132}
  resize(width,height){this.aspect=width/height;this.apply()}
  apply(){const half=this.frustum/2,aspect=this.aspect||1;this.camera.left=-half*aspect;this.camera.right=half*aspect;this.camera.top=half;this.camera.bottom=-half;this.camera.updateProjectionMatrix();this.camera.lookAt(this.targetLook)}
  update(dt){this.camera.position.lerp(this.targetPos,1-Math.pow(.02,dt));this.frustum+=(this.targetFrustum-this.frustum)*(1-Math.pow(.02,dt));this.apply()}
}

export function confinePlayer(player,act){
  const bounds={1:[-55,-7,-55,-7],2:[7,55,-55,-7],3:[-55,-7,7,55],4:[7,55,7,55]}[act];
  if(!bounds)return;player.position.x=Math.max(bounds[0],Math.min(bounds[1],player.position.x));player.position.z=Math.max(bounds[2],Math.min(bounds[3],player.position.z));
}

export function nearest(position,objects,maxDistance=4){
  let best=null,distance=maxDistance;
  for(const object of objects){if(!object.visible)continue;const next=position.distanceTo(object.position);if(next<distance){best=object;distance=next}}
  return best;
}

export async function transitionTo(elements,quote,onCovered){
  const {ink,line}=elements;ink.style.setProperty('--seed-x',`${30+Math.random()*40}%`);ink.style.setProperty('--seed-y',`${30+Math.random()*40}%`);ink.classList.add('cover');
  await new Promise(resolve=>setTimeout(resolve,700));onCovered?.();line.textContent=quote;line.classList.add('show');
  await new Promise(resolve=>setTimeout(resolve,800));ink.classList.remove('cover');
  await new Promise(resolve=>setTimeout(resolve,2700));line.classList.remove('show');
}

export function movePlayer(player,input,dt,speed=9){
  const move=input.movement(),velocity=player.userData.velocity;velocity.x+=(move.x*speed-velocity.x)*Math.min(1,dt*7);velocity.z+=(move.y*speed-velocity.z)*Math.min(1,dt*7);player.position.x+=velocity.x*dt;player.position.z+=velocity.z*dt;
  if(move.lengthSq()>.02)player.rotation.y=Math.atan2(move.x,move.y);player.position.y=Math.sin(performance.now()*.007)*.035;
}
