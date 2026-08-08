import './style.css';
import './fixes.css';
import * as THREE from 'three';
import {SceneManager} from './core/SceneManager';
import {Physics} from './core/Physics';
import {Input} from './core/Input';
import {loadState,clearState,type Act} from './core/GardenState';
import {Garden,C,toon} from './world/Garden';
import {Particles} from './feel/Particles';
import {Sound} from './feel/Sound';
import {Juice} from './feel/Juice';
import {PlayerRig} from './player/PlayerRig';
import {Acts} from './acts/Acts';

const host=document.querySelector<HTMLElement>('#game')!,opening=document.querySelector<HTMLElement>('#opening')!,enter=document.querySelector<HTMLButtonElement>('#enter')!,ink=document.querySelector<HTMLElement>('#ink')!,quote=document.querySelector<HTMLElement>('#quote')!,finale=document.querySelector<HTMLElement>('#finale')!,keep=document.querySelector<HTMLButtonElement>('#keep')!,again=document.querySelector<HTMLButtonElement>('#again')!,pulse=document.querySelector<HTMLElement>('#action-pulse')!,fallback=document.querySelector<HTMLElement>('#fallback')!;

async function boot(){
  const view=new SceneManager(host),physics=await Physics.create(),input=new Input(view.canvas()),state=loadState(),garden=new Garden(view.scene,physics,state),particles=new Particles(view.scene),sound=new Sound(),juice=new Juice(),rig=new PlayerRig(view.scene,physics,input,particles,sound,garden.goldMaterial),acts=new Acts(state,garden,rig,physics,input,view.camera,particles,sound,juice);let started=false,last=performance.now(),finalMode=false;
  const birds:THREE.Mesh[]=[];for(let i=0;i<9;i++){const bird=new THREE.Mesh(new THREE.TorusGeometry(.25,.04,4,9,Math.PI),toon(i%2?C.gold:C.ink));bird.rotation.x=Math.PI/2;bird.visible=false;view.scene.add(bird);birds.push(bird)}
  const transition=(act:Act,line:string)=>{ink.classList.add('cover');setTimeout(()=>{view.go(act);document.documentElement.style.setProperty('--gold',[C.gold,C.turquoise,C.saffron,C.vermilion][Number(act)-1]?.toString(16).padStart(6,'0').replace(/^/,'#')||'#d4af37');quote.textContent=line;quote.classList.add('show');ink.classList.remove('cover');setTimeout(()=>quote.classList.remove('show'),3000)},650)};
  acts.onTransition=transition;acts.onFinale=()=>{finalMode=true;view.go('finale');birds.forEach(bird=>bird.visible=true);setTimeout(()=>finale.classList.add('show'),900)};physics.contact=(force,a,b)=>acts.contact(force,a,b);
  enter.addEventListener('click',()=>{sound.start();started=true;opening.classList.add('hidden');transition(state.act,state.act===1?'Let the beauty we love be what we do.':'The garden remembers your hand.')});view.canvas().addEventListener('pointerdown',()=>sound.start());
  keep.addEventListener('click',async()=>{keep.disabled=true;keep.textContent='Framing…';const blob=await view.painting();if(blob){const file=new File([blob],'chaharbagh.png',{type:'image/png'});if(navigator.share&&navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:'My Chaharbagh'}).catch(()=>{});else{const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}}keep.disabled=false;keep.textContent='Keep this painting'});
  again.addEventListener('click',()=>{clearState();location.reload()});
  const loop=(now:number)=>{requestAnimationFrame(loop);const dt=Math.min(.05,(now-last)/1000);last=now;if(started&&!finalMode&&juice.shouldStep()){const stepped=physics.step(dt,step=>acts.fixedUpdate(step),()=>{});if(stepped)input.endFrame()}view.update(dt,finalMode);garden.update(now/1000);rig.renderUpdate(now/1000);acts.renderUpdate();particles.update(dt);if(finalMode)birds.forEach((bird,i)=>{const a=now*.00018+i*.698;bird.position.set(Math.cos(a)*(18+i%3*2),8+i%2*1.5,Math.sin(a)*(18+i%3*2));bird.rotation.z=-a});juice.update(dt,view.camera);view.render();if(input.actionDown){pulse.style.left=`${(input.pointer.x*.5+.5)*innerWidth}px`;pulse.style.top=`${(-input.pointer.y*.5+.5)*innerHeight}px`;pulse.classList.add('show')}else pulse.classList.remove('show')};requestAnimationFrame(loop)
}
boot().catch(error=>{console.error(error);fallback.textContent='This garden needs WebGL. Try refreshing in a modern browser.'});
