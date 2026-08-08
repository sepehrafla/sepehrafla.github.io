export class Sound{
  context?:AudioContext;master?:GainNode;roar?:{osc:OscillatorNode;gain:GainNode};
  start(){if(!this.context){this.context=new AudioContext();this.master=this.context.createGain();this.master.gain.value=.09;this.master.connect(this.context.destination)}this.context.resume()}
  tone(frequency:number,duration=.45,gain=.12,type:OscillatorType='sine',endScale=1.01){if(!this.context||!this.master)return;const now=this.context.currentTime,osc=this.context.createOscillator(),amp=this.context.createGain();osc.type=type;osc.frequency.setValueAtTime(frequency,now);osc.frequency.exponentialRampToValueAtTime(frequency*endScale,now+duration);amp.gain.setValueAtTime(.0001,now);amp.gain.exponentialRampToValueAtTime(gain,now+.018);amp.gain.exponentialRampToValueAtTime(.0001,now+duration);osc.connect(amp);amp.connect(this.master);osc.start();osc.stop(now+duration+.03)}
  impact(mass:number){const frequency=180/Math.max(1,Math.sqrt(mass))*(.9+Math.random()*.2);this.tone(frequency,.18,Math.min(.2,.045+mass*.012),'triangle',.62)}
  chime(index=0){const scale=[261.63,293.66,392,440,523.25];this.tone(scale[index%scale.length],.72,.11,'sine',1.01);setTimeout(()=>this.tone(scale[(index+2)%scale.length],.55,.065),55)}
  crack(){this.impact(9);setTimeout(()=>this.impact(5),70)}
  whoosh(){this.tone(95,.4,.08,'sawtooth',2.4)}
  bloom(){[392,523.25,659.25].forEach((note,index)=>setTimeout(()=>this.tone(note,.9,.07),index*60))}
  telegraph(amount:number){if(!this.context||!this.master)return;this.tone(280+amount*240,.1,.025,'sine',1.04)}
}
