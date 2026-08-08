import * as THREE from '../../assets/three.module.min.js';
import {loadState,saveState,clearState} from './state.js';
import {createGarden,applyTraces,unlock,updateWorld,COLORS,box} from './world.js';
import {createPlayer,Input,CameraRig,transitionTo} from './core.js';
import {ActRunner} from './acts.js';
import {GardenAudio} from './audio.js';

const canvas=document.getElementById('garden-canvas'),opening=document.getElementById('opening'),enter=document.getElementById('enter-garden'),line=document.getElementById('act-line'),ink=document.getElementById('ink-bloom'),finale=document.getElementById('finale'),keep=document.getElementById('keep-painting'),again=document.getElementById('begin-again'),touch=document.getElementById('touch-action'),fallback=document.getElementById('fallback'),border=document.querySelector('.manuscript-border');
const quotes={
  1:'“You wander from room to room hunting for the diamond necklace that is already around your neck.”',
  2:'“The wound is the place where the Light enters you.”',
  3:'“Maybe you are searching among the branches for what only appears in the roots.”',
  4:'“Be a lamp, or a lifeboat, or a ladder.”'
};
const borderColors={1:'#1f3a93',2:'#f4a300',3:'#2e7d4f',4:'#d4af37'};

try{
  const state=loadState(),debugAct=['localhost','127.0.0.1'].includes(location.hostname)?Number(new URLSearchParams(location.search).get('act')):0;
  if(debugAct>=2){state.act=debugAct===5?'finale':debugAct;state.act1.barbellIntact=true;state.act1.heavyEndKept=true}
  if(debugAct>=3){state.act2.vesselsPoured.pavilion=100;state.act2.vesselsPoured.orchard=100;state.act2.structuresBuilt=['pavilion','orchard']}
  if(debugAct>=4){state.act3.plantSpot={x:-30,z:30};state.act3.timeToDecide=74}
  const scene=new THREE.Scene();scene.background=new THREE.Color(COLORS.ink);
  const camera=new THREE.OrthographicCamera(-40,40,40,-40,.1,400);scene.userData.camera=camera;
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=false;
  scene.add(new THREE.HemisphereLight(0xf5edd8,0x1f3a93,2.1));const sun=new THREE.DirectionalLight(0xffe5a5,2.8);sun.position.set(-30,80,40);scene.add(sun);
  const world=createGarden(scene,state);world.traces.name='permanent-traces';applyTraces(world,state);
  const player=createPlayer();scene.add(player);const input=new Input(canvas),rig=new CameraRig(camera),sound=new GardenAudio();rig.resize(innerWidth,innerHeight);
  let active=false,inFinale=false,visible=true,last=performance.now(),dayClock=0;

  const runner=new ActRunner({state,world,player,input,touch,sound,onAdvance:advance,onFinale:showFinale});
  rig.setAct(Number(state.act)||1,true);border.style.borderColor=borderColors[Number(state.act)]||'#d4af37';
  for(let act=1;act<=Math.min(4,Number(state.act)||1);act++)unlock(world,act);

  function advance(next,startAct){
    transitionTo({ink,line},quotes[next],()=>{unlock(world,next);rig.setAct(next);sound.setAct(next);sound.chime('gold');border.style.borderColor=borderColors[next];startAct()});
  }

  function goldFlood(){
    const horizontal=box(118,.14,1.1,COLORS.gold),vertical=box(1.1,.14,118,COLORS.gold);horizontal.position.y=.42;vertical.position.y=.43;horizontal.material.transparent=vertical.material.transparent=true;horizontal.material.opacity=vertical.material.opacity=.78;world.traces.add(horizontal,vertical);
  }

  async function showFinale(){
    if(inFinale)return;inFinale=true;active=false;state.act='finale';saveState(state);
    await transitionTo({ink,line},'',()=>{for(let act=1;act<=4;act++)unlock(world,act);goldFlood();player.visible=false;rig.finale();sound.setAct(5);sound.chime('give');border.style.borderColor='#d4af37'});
    setTimeout(()=>finale.classList.add('show'),1300);
  }

  enter.addEventListener('click',async()=>{
    opening.classList.add('hidden');active=true;sound.start(Number(state.act)||1);
    if(state.act==='finale'){showFinale();return}
    const act=Number(state.act)||1;await transitionTo({ink,line},quotes[act],()=>{rig.setAct(act);border.style.borderColor=borderColors[act]});
  });

  async function exportPainting(){
    const oldSize=renderer.getSize(new THREE.Vector2()),oldRatio=renderer.getPixelRatio(),aspect=oldSize.x/oldSize.y,exportWidth=Math.max(2160,Math.round(oldSize.x*2)),exportHeight=Math.round(exportWidth/aspect);
    finale.classList.remove('show');renderer.setPixelRatio(1);renderer.setSize(exportWidth,exportHeight,false);rig.resize(exportWidth,exportHeight);renderer.render(scene,camera);
    const dataUrl=canvas.toDataURL('image/png',1),binary=atob(dataUrl.split(',')[1]),bytes=new Uint8Array(binary.length);for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);const blob=new Blob([bytes],{type:'image/png'});
    renderer.setSize(oldSize.x,oldSize.y,false);renderer.setPixelRatio(oldRatio);rig.resize(oldSize.x,oldSize.y);finale.classList.add('show');
    const file=new File([blob],'chaharbagh.png',{type:'image/png'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='chaharbagh.png';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
    if(navigator.canShare?.({files:[file]})){try{await navigator.share({title:'My Chaharbagh',text:'A garden shaped by my choices.',files:[file]})}catch(error){if(error.name!=='AbortError')console.warn(error)}}
  }
  keep.addEventListener('click',exportPainting);again.addEventListener('click',()=>{clearState();location.reload()});

  const resize=()=>{const rect=canvas.parentElement.getBoundingClientRect();renderer.setSize(rect.width,rect.height,false);rig.resize(rect.width,rect.height)};new ResizeObserver(resize).observe(canvas.parentElement);resize();
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting},{threshold:.02}).observe(canvas);

  function render(now){
    requestAnimationFrame(render);if(!visible)return;const dt=Math.min(.04,(now-last)/1000);last=now;dayClock+=dt;
    if(active&&!inFinale)runner.update(dt);if(inFinale){scene.background.setHSL(.63+Math.sin(dayClock*.08)*.025,.3,.13+Math.sin(dayClock*.08)*.025)}
    updateWorld(world,now/1000);rig.update(dt);renderer.render(scene,camera);
  }
  requestAnimationFrame(render);
}catch(error){
  console.error('Chaharbagh could not start',error);fallback.textContent='This garden needs WebGL. Your browser has kept the manuscript safely closed.';opening.querySelector('button').hidden=true;
}
