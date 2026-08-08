import {Vector2} from 'three';

export class Input{
  keys=new Set<string>();movement=new Vector2();pointer=new Vector2();actionDown=false;actionPressed=false;actionReleased=false;drag?:{x:number;y:number;lastX:number;lastY:number};
  constructor(canvas:HTMLCanvasElement){
    addEventListener('keydown',event=>{if(['Space','Enter','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code))event.preventDefault();if(['Space','Enter','KeyE'].includes(event.code)&&!this.actionDown)this.actionPressed=true;this.keys.add(event.code);this.actionDown=['Space','Enter','KeyE'].some(key=>this.keys.has(key))},{passive:false});
    addEventListener('keyup',event=>{this.keys.delete(event.code);const next=['Space','Enter','KeyE'].some(key=>this.keys.has(key));if(this.actionDown&&!next)this.actionReleased=true;this.actionDown=next});
    canvas.addEventListener('pointerdown',event=>{canvas.setPointerCapture(event.pointerId);this.drag={x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY};this.actionPressed=true;this.actionDown=true;this.setPointer(event,canvas)});
    canvas.addEventListener('pointermove',event=>{this.setPointer(event,canvas);if(this.drag){this.drag.lastX=event.clientX;this.drag.lastY=event.clientY}});
    canvas.addEventListener('pointerup',event=>{canvas.releasePointerCapture(event.pointerId);this.drag=undefined;this.actionDown=false;this.actionReleased=true});
  }
  setPointer(event:PointerEvent,canvas:HTMLCanvasElement){const rect=canvas.getBoundingClientRect();this.pointer.set((event.clientX-rect.left)/rect.width*2-1,-((event.clientY-rect.top)/rect.height*2-1))}
  readMovement(){let x=0,y=0;if(this.keys.has('KeyA')||this.keys.has('ArrowLeft'))x--;if(this.keys.has('KeyD')||this.keys.has('ArrowRight'))x++;if(this.keys.has('KeyW')||this.keys.has('ArrowUp'))y--;if(this.keys.has('KeyS')||this.keys.has('ArrowDown'))y++;if(this.drag){x+=(this.drag.lastX-this.drag.x)/55;y+=(this.drag.lastY-this.drag.y)/55}this.movement.set(x,y);if(this.movement.length()>1)this.movement.normalize();return this.movement}
  endFrame(){this.actionPressed=false;this.actionReleased=false}
}
