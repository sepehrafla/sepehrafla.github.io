import {AdditiveBlending,BufferAttribute,BufferGeometry,Color,Points,PointsMaterial,Scene,Vector3} from 'three';

const MAX=2048;
export class Particles{
  points:Points;positions=new Float32Array(MAX*3);velocities=new Float32Array(MAX*3);colors=new Float32Array(MAX*3);life=new Float32Array(MAX);cursor=0;dirty=false;
  constructor(scene:Scene){const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(this.positions,3));geometry.setAttribute('color',new BufferAttribute(this.colors,3));const material=new PointsMaterial({size:.24,vertexColors:true,transparent:true,opacity:.88,depthWrite:false,blending:AdditiveBlending});this.points=new Points(geometry,material);scene.add(this.points)}
  emit(position:Vector3,color:number,count:number,speed=3,up=2){const shade=new Color(color);for(let n=0;n<count;n++){const i=this.cursor++%MAX,j=i*3,angle=Math.random()*Math.PI*2,power=speed*(.35+Math.random()*.65);this.positions[j]=position.x;this.positions[j+1]=position.y;this.positions[j+2]=position.z;this.velocities[j]=Math.cos(angle)*power;this.velocities[j+1]=Math.random()*up;this.velocities[j+2]=Math.sin(angle)*power;this.colors[j]=shade.r;this.colors[j+1]=shade.g;this.colors[j+2]=shade.b;this.life[i]=.45+Math.random()*.65}this.dirty=true}
  update(dt:number){for(let i=0;i<MAX;i++){if(this.life[i]<=0)continue;const j=i*3;this.life[i]-=dt;this.velocities[j+1]-=5*dt;this.positions[j]+=this.velocities[j]*dt;this.positions[j+1]+=this.velocities[j+1]*dt;this.positions[j+2]+=this.velocities[j+2]*dt;if(this.life[i]<=0)this.positions[j+1]=-999}const attribute=this.points.geometry.getAttribute('position') as BufferAttribute;attribute.needsUpdate=true;(this.points.geometry.getAttribute('color') as BufferAttribute).needsUpdate=this.dirty;this.dirty=false}
}
