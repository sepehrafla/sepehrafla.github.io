import * as THREE from '../../assets/three.module.min.js';

export const COLORS={lapis:0x1f3a93,turquoise:0x40c4b7,saffron:0xf4a300,gold:0xd4af37,vermilion:0xc0392b,paper:0xf5edd8,ink:0x1a1a22,green:0x2e7d4f,locked:0x77736b};
const toon=color=>new THREE.MeshToonMaterial({color});
const basic=(color,options={})=>new THREE.MeshBasicMaterial({color,...options});

function box(w,h,d,color){return new THREE.Mesh(new THREE.BoxGeometry(w,h,d),toon(color))}
function cylinder(rt,rb,h,segments,color){return new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,segments),toon(color))}

export function makeCypress(height=7,color=COLORS.green){
  const tree=new THREE.Group();
  const trunk=cylinder(.18,.28,height*.55,7,0x79542f);trunk.position.y=height*.28;tree.add(trunk);
  for(let i=0;i<4;i++){
    const crown=new THREE.Mesh(new THREE.ConeGeometry(1.25-i*.15,height*.45,9),toon(color));
    crown.position.y=height*.35+i*height*.12;tree.add(crown);
  }
  return tree;
}

function makeFlower(color,scale=1){
  const flower=new THREE.Group();
  const stem=cylinder(.035,.045,.55,5,COLORS.green);stem.position.y=.27;flower.add(stem);
  for(let i=0;i<5;i++){
    const petal=new THREE.Mesh(new THREE.SphereGeometry(.18*scale,6,4),basic(color));
    petal.scale.set(1,.35,.65);petal.position.set(Math.cos(i*1.257)*.18,.62,Math.sin(i*1.257)*.18);flower.add(petal);
  }
  return flower;
}

function makeFigure(color=COLORS.lapis,seated=false){
  const figure=new THREE.Group();
  const robe=new THREE.Mesh(new THREE.ConeGeometry(.72,1.7,8),toon(color));robe.position.y=.85;figure.add(robe);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.34,10,7),toon(0xc98f68));head.position.y=1.95;figure.add(head);
  const turban=new THREE.Mesh(new THREE.TorusGeometry(.31,.09,5,12),toon(COLORS.paper));turban.rotation.x=Math.PI/2;turban.position.y=2.08;figure.add(turban);
  if(seated){figure.scale.y=.82;figure.rotation.x=-.08}
  return figure;
}

function makeStructure(type){
  const group=new THREE.Group();
  const stone=toon(COLORS.paper),blue=toon(COLORS.lapis),gold=toon(COLORS.gold);
  if(type==='pavilion'){
    group.add(box(7,.45,6,COLORS.paper));
    for(const x of [-2.5,2.5])for(const z of [-2,2]){const col=cylinder(.23,.3,4,8,COLORS.paper);col.position.set(x,2.2,z);group.add(col)}
    const roof=new THREE.Mesh(new THREE.ConeGeometry(5,2.3,8),blue);roof.position.y=5.2;roof.rotation.y=Math.PI/8;group.add(roof);
  }else if(type==='orchard'){
    for(let x=-3;x<=3;x+=2)for(let z=-2;z<=2;z+=2){const tree=makeCypress(3.4,0x3c945d);tree.position.set(x,0,z);group.add(tree)}
  }else if(type==='library'){
    const wall=new THREE.Mesh(new THREE.BoxGeometry(7,4.6,1),stone);wall.position.y=2.3;group.add(wall);
    for(const x of [-2.2,0,2.2]){const arch=new THREE.Mesh(new THREE.TorusGeometry(.65,.16,7,14,Math.PI),blue);arch.position.set(x,2.1,.56);group.add(arch)}
  }else{
    const tower=cylinder(2.2,2.8,7,8,COLORS.paper);tower.position.y=3.5;group.add(tower);
    const crown=new THREE.Mesh(new THREE.ConeGeometry(3.2,2.1,8),gold);crown.position.y=8;group.add(crown);
  }
  group.userData.fullScale=group.scale.clone();return group;
}

function waterMaterial(){
  return new THREE.ShaderMaterial({transparent:true,uniforms:{uTime:{value:0}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`uniform float uTime;varying vec2 vUv;void main(){float ripple=sin((vUv.x+vUv.y)*48.-uTime*2.)*.055;vec3 a=vec3(.10,.55,.63),b=vec3(.25,.77,.72);gl_FragColor=vec4(mix(a,b,vUv.y+ripple),.94);}`});
}

export function createGarden(scene,state){
  const root=new THREE.Group();scene.add(root);
  const quadrants={},palette=[COLORS.lapis,COLORS.saffron,COLORS.green,COLORS.vermilion];
  [['nw',-30,-30],['ne',30,-30],['sw',-30,30],['se',30,30]].forEach(([name,x,z],index)=>{
    const group=new THREE.Group();group.position.set(x,0,z);root.add(group);quadrants[name]=group;
    const ground=box(52,1.1,52,index+1<=Number(state.act)||state.act==='finale'?palette[index]:COLORS.locked);ground.position.y=-.65;ground.userData={palette:palette[index],index:index+1};group.add(ground);
    const terrace=box(44,.32,44,COLORS.paper);terrace.position.y=.06;group.add(terrace);
    for(let i=0;i<12;i++){
      const edge=i%4,step=(i%3-1)*14,tree=makeCypress(4.2+(i%2)*.7,index+1<=Number(state.act)||state.act==='finale'?COLORS.green:COLORS.locked);
      tree.position.set(edge<2?step:edge===2?-20:20,0,edge<2?(edge?20:-20):step);group.add(tree);
    }
  });

  const waterMat=waterMaterial(),channelX=new THREE.Mesh(new THREE.PlaneGeometry(120,7),waterMat),channelZ=new THREE.Mesh(new THREE.PlaneGeometry(120,7),waterMat.clone());
  channelX.rotation.x=channelZ.rotation.x=-Math.PI/2;channelX.position.y=0;channelZ.position.y=.02;channelZ.rotation.z=Math.PI/2;root.add(channelX,channelZ);
  const rim=cylinder(8.2,8.2,.42,8,COLORS.gold);rim.position.y=.05;root.add(rim);
  const pool=cylinder(7.5,7.5,.5,8,COLORS.turquoise);pool.position.y=.32;root.add(pool);

  const barbell=new THREE.Group(),bar=box(7,.36,.36,COLORS.gold);bar.position.y=1.05;barbell.add(bar);
  const heavy=new THREE.Mesh(new THREE.DodecahedronGeometry(1.55,0),toon(0x403a3b));heavy.position.set(-3.6,1.1,0);barbell.add(heavy);
  const volatile=new THREE.Mesh(new THREE.IcosahedronGeometry(1.35,1),basic(COLORS.gold));volatile.position.set(3.6,1.1,0);volatile.userData.volatile=true;barbell.add(volatile);
  barbell.position.set(-32,0,-36);barbell.userData={id:'barbell',kind:'barbell',heavy,volatile};root.add(barbell);

  const middles=[];
  for(let i=0;i<7;i++){
    const item=i%3===0?cylinder(.7,.85,1.7,8,[COLORS.turquoise,COLORS.saffron,COLORS.vermilion][i%3]):box(1.5,1.45,1.5,[COLORS.saffron,COLORS.turquoise,COLORS.lapis][i%3]);
    item.position.set(-48+(i%4)*10,.75,-47+Math.floor(i/4)*13);item.userData={id:`middle-${i}`,kind:'middle'};middles.push(item);root.add(item);
  }

  const foundationData=[['pavilion',17,-42],['orchard',43,-42],['library',17,-18],['watchtower',43,-18]];
  const structures={};
  foundationData.forEach(([id,x,z])=>{
    const slab=box(11,.5,9,0xa59a83);slab.position.set(x,.2,z);root.add(slab);
    const structure=makeStructure(id);structure.position.set(x,.5,z);const amount=state.act2.vesselsPoured[id]||0;structure.scale.y=Math.max(.03,amount/100);structure.visible=amount>0;structure.userData={id,amount};structures[id]=structure;root.add(structure);
  });

  const plots=[[-44,18],[-18,18],[-44,42],[-18,42],[-30,30]];
  const plotMeshes=plots.map(([x,z],index)=>{const ring=new THREE.Mesh(new THREE.RingGeometry(2.5,3,32),basic(index===0?COLORS.turquoise:index===4?COLORS.gold:0xa16f43,{transparent:true,opacity:.65,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.set(x,.16,z);ring.userData={id:index,x,z};root.add(ring);return ring});
  const preview=makeCypress(8,COLORS.gold);preview.visible=false;preview.traverse(o=>{if(o.material){o.material=o.material.clone();o.material.transparent=true;o.material.opacity=.28}});root.add(preview);

  const figures={},figureColors={saffron:COLORS.saffron,lapis:COLORS.lapis,turquoise:COLORS.turquoise,vermilion:COLORS.vermilion};
  Object.entries(figureColors).forEach(([id,color],index)=>{
    const angle=index*Math.PI/2+.4,figure=makeFigure(color,true);figure.position.set(30+Math.cos(angle)*14,0,30+Math.sin(angle)*14);figure.userData={id};figures[id]=figure;root.add(figure);
  });

  return{root,quadrants,water:[waterMat,channelZ.material],pool,barbell,middles,structures,plots:plotMeshes,preview,figures,traces:new THREE.Group()};
}

export function applyTraces(world,state){
  world.root.add(world.traces);
  state.act1.shattered.forEach((id,index)=>{
    const pile=new THREE.Group();
    for(let i=0;i<7;i++){const shard=box(.32,.08,.55,[COLORS.turquoise,COLORS.saffron,COLORS.vermilion][i%3]);shard.position.set((i%3)*.35,.1,Math.floor(i/3)*.3);shard.rotation.y=i*.8;pile.add(shard)}
    pile.position.set(-47+(index%4)*9,0,-46+Math.floor(index/4)*10);world.traces.add(pile);
  });
  if(state.act1.barbellIntact){world.barbell.position.set(0,.35,-12);world.barbell.rotation.y=Math.PI/2;if(state.act1.volatileOutcome==='grew')world.barbell.userData.volatile.scale.setScalar(1.7);if(state.act1.volatileOutcome==='exploded')world.barbell.userData.volatile.scale.setScalar(.22)}
  if(state.act3.plantSpot){const tree=makeCypress(10,COLORS.green);tree.position.set(state.act3.plantSpot.x,0,state.act3.plantSpot.z);tree.userData.traceTree=true;world.traces.add(tree);addRoots(world,state.act3.plantSpot)}
  Object.entries(state.act4.gifts).forEach(([id,gifts])=>bloomPlot(world,world.figures[id].position,gifts.length));
}

export function addRoots(world,spot){
  const gold=basic(COLORS.gold);
  for(let i=0;i<9;i++){
    const angle=i/9*Math.PI*2,length=4+(i%3)*2,points=[new THREE.Vector3(spot.x,.18,spot.z),new THREE.Vector3(spot.x+Math.cos(angle)*length*.55,.2,spot.z+Math.sin(angle)*length*.55),new THREE.Vector3(spot.x+Math.cos(angle)*length,.2,spot.z+Math.sin(angle)*length)];
    world.traces.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),12,.055,5,false),gold));
  }
}

export function bloomPlot(world,position,count){
  const existing=world.traces.children.filter(o=>o.userData.bloomAt===`${position.x}:${position.z}`).length;
  for(let i=existing;i<count*12;i++){
    const flower=makeFlower([COLORS.saffron,COLORS.turquoise,COLORS.vermilion,COLORS.gold][i%4],.7);const angle=i*2.4,radius=2+(i%4)*.55;flower.position.set(position.x+Math.cos(angle)*radius,0,position.z+Math.sin(angle)*radius);flower.scale.setScalar(.75+count*.1);flower.userData.bloomAt=`${position.x}:${position.z}`;world.traces.add(flower);
  }
}

export function unlock(world,act){
  const key=['nw','ne','sw','se'][act-1],ground=world.quadrants[key].children[0];ground.material.color.setHex(ground.userData.palette);
  world.quadrants[key].traverse(o=>{if(o.material&&o!==ground&&o.material.color?.getHex()===COLORS.locked)o.material.color.setHex(COLORS.green)});
}

export function updateWorld(world,time){
  world.water.forEach(material=>material.uniforms.uTime.value=time);
  world.pool.rotation.y=time*.05;
  world.barbell.userData.volatile.rotation.y=time*1.5;
  world.barbell.userData.volatile.scale.multiplyScalar(1+Math.sin(time*4)*.0007);
}

export {makeFigure,makeStructure,makeFlower,box,basic,toon};
