export class GardenAudio{
  constructor(){this.context=null;this.master=null;this.voices=[];this.act=1}
  start(act=1){
    if(!this.context){
      this.context=new (window.AudioContext||window.webkitAudioContext)();this.master=this.context.createGain();this.master.gain.value=.055;this.master.connect(this.context.destination);
    }
    this.context.resume();this.setAct(act);
  }
  setAct(act){
    this.act=act;if(!this.context)return;const now=this.context.currentTime;this.voices.forEach(voice=>{voice.gain.gain.cancelScheduledValues(now);voice.gain.gain.linearRampToValueAtTime(0,now+.8);setTimeout(()=>voice.osc.stop(),900)});this.voices=[];
    const roots={1:146.83,2:164.81,3:130.81,4:196,5:220},root=roots[act]||roots[5],ratios=[1,1.2,1.5];
    ratios.forEach((ratio,index)=>{
      const osc=this.context.createOscillator(),gain=this.context.createGain(),filter=this.context.createBiquadFilter(),lfo=this.context.createOscillator(),lfoGain=this.context.createGain();
      osc.type=index?'sine':'triangle';osc.frequency.value=root*ratio;filter.type='lowpass';filter.frequency.value=650+index*280;gain.gain.value=0;lfo.frequency.value=.035+index*.018;lfoGain.gain.value=2.5;lfo.connect(lfoGain);lfoGain.connect(osc.detune);osc.connect(filter);filter.connect(gain);gain.connect(this.master);osc.start();lfo.start();gain.gain.linearRampToValueAtTime(index?0.18:.26,now+2.4);this.voices.push({osc,gain,lfo});
    });
  }
  chime(kind='gold'){
    if(!this.context)return;const now=this.context.currentTime,notes={gold:[440,660],water:[392,587],root:[261.63,392],storm:[82.41,73.42],give:[523.25,659.25]}[kind]||[440,660];
    notes.forEach((frequency,index)=>{const osc=this.context.createOscillator(),gain=this.context.createGain();osc.type=kind==='storm'?'sawtooth':'sine';osc.frequency.setValueAtTime(frequency,now);osc.frequency.exponentialRampToValueAtTime(frequency*(kind==='storm'?0.72:1.01),now+.55);gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(kind==='storm'?0.055:0.12,now+.025+index*.03);gain.gain.exponentialRampToValueAtTime(.0001,now+.7);osc.connect(gain);gain.connect(this.master);osc.start(now+index*.04);osc.stop(now+.75)});
  }
}
