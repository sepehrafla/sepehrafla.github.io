import * as THREE from '../../assets/three.module.min.js';
import {saveState,giftCount,giftsGiven,derivePalette} from './state.js';
import {nearest,movePlayer,confinePlayer} from './core.js';
import {COLORS,makeCypress,addRoots,bloomPlot,basic,box} from './world.js';

const starts={1:[-48,-48],2:[10,-48],3:[-48,10],4:[10,48]};
const gates={1:new THREE.Vector3(-8,0,-30),2:new THREE.Vector3(30,0,-8)};

export class ActRunner{
  constructor({state,world,player,input,onAdvance,onFinale,touch,sound}){
    Object.assign(this,{state,world,player,input,onAdvance,onFinale,touch,sound});this.act=Number(state.act)||1;this.elapsed=0;this.carrying=null;this.storms=0;this.plotTime=0;this.activePlot=null;this.plantHold=0;this.growth=0;this.energy=this.getEnergy();this.giftTotal=giftCount(state);this.finishing=false;
    this.start(this.act,true);
  }
  getEnergy(){const poured=Object.values(this.state.act2.vesselsPoured).reduce((a,b)=>a+b,0),factor=this.state.act1.volatileOutcome==='grew'?1.5:this.state.act1.volatileOutcome==='exploded'?0.7:1;return Math.max(0,Math.round(200*factor)-poured)}
  start(act,resume=false){
    this.act=act;this.elapsed=0;this.finishing=false;this.player.position.set(...[starts[act][0],0,starts[act][1]]);this.player.userData.velocity.set(0,0,0);
    if(act===1){this.world.barbell.visible=!this.state.act1.barbellIntact;this.world.middles.forEach(item=>item.visible=!this.state.act1.shattered.includes(item.userData.id))}
    if(act===2)this.energy=this.getEnergy();
    if(act===3&&this.state.act3.plantSpot)this.growth=20;
    if(act===4)this.giftTotal=giftCount(this.state);
    if(resume&&this.state.act==='finale')this.onFinale();
  }
  update(dt){
    if(this.finishing)return;this.elapsed+=dt;const speed=this.carrying?.userData.kind==='barbell'?5.4:9;
    movePlayer(this.player,this.input,dt,speed);confinePlayer(this.player,this.act);
    if(this.carrying){this.carrying.position.set(0,3.4,0);this.carrying.rotation.y+=dt*.5}
    if(this.act===1)this.updateCarry(dt);if(this.act===2)this.updatePour(dt);if(this.act===3)this.updatePlant(dt);if(this.act===4)this.updateGive(dt);
  }
  setTouch(target,color=COLORS.gold){
    if(!target){this.touch.classList.remove('show');return}
    const vector=target.position.clone().project(this.player.parent.userData.camera);const rect=this.touch.parentElement.getBoundingClientRect();this.touch.style.left=`${(vector.x*.5+.5)*rect.width}px`;this.touch.style.top=`${(-vector.y*.5+.5)*rect.height}px`;this.touch.style.borderColor=`#${color.toString(16).padStart(6,'0')}`;this.touch.classList.add('show');
  }
  updateCarry(){
    const choices=[this.world.barbell,...this.world.middles],near=nearest(this.player.position,choices,4.6);this.setTouch(this.carrying||near);
    if(this.input.consume()){
      if(this.carrying)this.drop();else if(near)this.pick(near);
    }
    if(this.elapsed>24&&this.storms===0){this.storms=1;this.storm('dust')}
    if(this.elapsed>52&&this.storms===1){this.storms=2;this.storm('tremor')}
    if(this.player.position.distanceTo(gates[1])<4){
      if(this.carrying?.userData.kind==='barbell')this.completeAct1();
      else{this.player.userData.velocity.x=-8;this.world.barbell.userData.volatile.scale.setScalar(1.45);setTimeout(()=>this.world.barbell.userData.volatile.scale.setScalar(1),350)}
    }
  }
  pick(object){
    if(this.carrying)this.drop();this.carrying=object;this.player.attach(object);object.position.set(0,3.4,0);this.state.act1.carried.push(object.userData.id);this.sound?.chime('gold');saveState(this.state);
  }
  drop(){
    if(!this.carrying)return;const object=this.carrying;this.world.root.attach(object);object.position.copy(this.player.position).add(new THREE.Vector3(Math.sin(this.player.rotation.y)*2,0,Math.cos(this.player.rotation.y)*2));this.state.act1.dropped.push(object.userData.id);this.carrying=null;saveState(this.state);
  }
  storm(kind){
    document.body.animate([{filter:'none'},{filter:kind==='dust'?'sepia(.8) brightness(.75)':'contrast(1.4)'},{filter:'none'}],{duration:1500});this.sound?.chime('storm');
    const victims=this.world.middles.filter(item=>item.visible).slice(0,kind==='dust'?3:5);
    if(this.carrying?.userData.kind==='middle'&&!victims.includes(this.carrying))victims.push(this.carrying);
    victims.forEach(item=>this.shatter(item));
  }
  shatter(item){
    if(!item.visible)return;item.visible=false;if(item===this.carrying)this.carrying=null;this.state.act1.shattered.push(item.userData.id);
    const pile=new THREE.Group();for(let i=0;i<8;i++){const shard=box(.35,.08,.5,[COLORS.turquoise,COLORS.saffron,COLORS.vermilion][i%3]);shard.position.set((Math.random()-.5)*1.8,.1,(Math.random()-.5)*1.8);shard.rotation.y=Math.random()*6;pile.add(shard)}pile.position.copy(item.getWorldPosition(new THREE.Vector3()));this.world.traces.add(pile);saveState(this.state);
  }
  completeAct1(){
    this.finishing=true;this.state.act1.barbellIntact=true;this.state.act1.heavyEndKept=true;this.world.root.attach(this.carrying);this.carrying.position.set(0,.35,-12);this.carrying.rotation.y=Math.PI/2;
    const volatile=this.carrying.userData.volatile;if(this.state.act1.volatileOutcome==='grew')volatile.scale.setScalar(1.7);else volatile.scale.setScalar(.22);this.carrying=null;this.advance(2);
  }
  updatePour(dt){
    const foundations=Object.values(this.world.structures),near=nearest(this.player.position,foundations,5.6);this.setTouch(near,COLORS.saffron);
    if(near&&this.input.actionDown&&this.energy>0){
      const id=near.userData.id,current=this.state.act2.vesselsPoured[id]||0,amount=Math.min(dt*28,this.energy,100-current);if(amount>0){this.energy-=amount;this.state.act2.vesselsPoured[id]=current+amount;near.visible=true;near.scale.y=Math.max(.03,(current+amount)/100);this.pourSpark(near);if(Math.floor(current/20)!==Math.floor((current+amount)/20))this.sound?.chime('water');if(current+amount>=99&&!this.state.act2.structuresBuilt.includes(id))this.state.act2.structuresBuilt.push(id);saveState(this.state)}
    }
    this.input.consume();
    if(this.energy<=.05&&this.player.position.distanceTo(gates[2])<5)this.advance(3);
  }
  pourSpark(target){
    if(Math.random()>.35)return;const spark=new THREE.Mesh(new THREE.SphereGeometry(.12,6,4),basic(COLORS.gold));spark.position.copy(this.player.position).add(new THREE.Vector3(0,2.5,0));this.world.traces.add(spark);const destination=target.position.clone().add(new THREE.Vector3(0,2,0)),started=performance.now();const tick=()=>{const t=Math.min(1,(performance.now()-started)/450);spark.position.lerpVectors(this.player.position.clone().add(new THREE.Vector3(0,2.5,0)),destination,t);spark.position.y+=Math.sin(t*Math.PI)*3;if(t<1)requestAnimationFrame(tick);else{this.world.traces.remove(spark);spark.geometry.dispose()}};tick();
  }
  updatePlant(dt){
    if(this.state.act3.plantSpot){this.updateGrowth(dt);return}
    this.state.act3.timeToDecide+=dt;this.state.palette=derivePalette(this.state);if(Math.floor(this.elapsed)%2===0)saveState(this.state);
    if(this.state.act3.wanderPath.length===0||this.player.position.distanceTo(new THREE.Vector3(this.state.act3.wanderPath.at(-1).x,0,this.state.act3.wanderPath.at(-1).z))>3){this.state.act3.wanderPath.push({x:+this.player.position.x.toFixed(1),z:+this.player.position.z.toFixed(1)});saveState(this.state)}
    const near=nearest(this.player.position,this.world.plots,4.5);if(near===this.activePlot)this.plotTime+=dt;else{this.activePlot=near;this.plotTime=0;this.plantHold=0}
    this.world.preview.visible=Boolean(near&&this.plotTime>2);if(this.world.preview.visible)this.world.preview.position.set(near.userData.x,0,near.userData.z);this.setTouch(near,COLORS.green);
    if(near&&this.input.actionDown){this.plantHold+=dt;near.scale.setScalar(.88+Math.sin(this.plantHold*7)*.08);if(this.plantHold>=3)this.plant(near)}else if(near){this.plantHold=Math.max(0,this.plantHold-dt*.8);near.scale.lerp(new THREE.Vector3(1,1,1),dt*5)}this.input.consume();
  }
  plant(plot){
    this.state.act3.plantSpot={x:plot.userData.x,z:plot.userData.z};this.state.palette=derivePalette(this.state);saveState(this.state);this.sound?.chime('root');this.world.preview.visible=false;this.tree=makeCypress(10,COLORS.green);this.tree.position.set(plot.userData.x,0,plot.userData.z);this.tree.scale.y=.03;this.world.traces.add(this.tree);addRoots(this.world,this.state.act3.plantSpot);this.growth=.01;
  }
  updateGrowth(dt){
    if(!this.tree)this.tree=this.world.traces.children.find(child=>child.userData.traceTree);this.growth=Math.min(20,this.growth+dt);if(this.tree)this.tree.scale.y=Math.min(1,this.growth/20);this.setTouch(null);if(this.growth>=20)this.advance(4);
  }
  updateGive(){
    const figures=Object.values(this.world.figures),near=nearest(this.player.position,figures,4.5);this.setTouch(near,COLORS.gold);
    if(near&&this.input.consume()&&giftsGiven(this.state)<this.giftTotal){const id=near.userData.id;this.state.act4.gifts[id].push(`gift-${giftsGiven(this.state)+1}`);this.state.act4.quadrantsBloomedForOthers=Object.values(this.state.act4.gifts).filter(g=>g.length).length;near.rotation.x=0;near.scale.y=1;this.sound?.chime('give');bloomPlot(this.world,near.position,this.state.act4.gifts[id].length);saveState(this.state);if(giftsGiven(this.state)>=this.giftTotal){this.finishing=true;setTimeout(()=>this.onFinale(),1400)}}
  }
  advance(next){this.finishing=true;this.state.act=next;saveState(this.state);this.onAdvance(next,()=>this.start(next))}
}
