export type Act=1|2|3|4|'finale';
export interface GardenState{
  act:Act;
  act1:{gatesBroken:string[];stormsSurvived:number;burstsRidden:number;shattered:string[];furrows:{x:number;z:number}[]};
  act2:{poured:Record<string,number>;built:string[];stains:{x:number;z:number,size:number}[];waste:number};
  act3:{tested:string[];hollow:string[];plant:{x:number;z:number;tilted:boolean;lush:boolean}|null;cracks:{x:number;z:number}[];stormDamage:number;time:number;path:{x:number;z:number}[]};
  act4:{gifts:Record<string,number>;wildflowers:{x:number;z:number}[];bankShots:number};
  palette:'dawn'|'noon'|'dusk'|'night';
}
const key='chaharbagh-physics-v2';
export const freshState=():GardenState=>({act:1,act1:{gatesBroken:[],stormsSurvived:0,burstsRidden:0,shattered:[],furrows:[]},act2:{poured:{pavilion:0,orchard:0,library:0,watchtower:0},built:[],stains:[],waste:0},act3:{tested:[],hollow:[],plant:null,cracks:[],stormDamage:0,time:0,path:[]},act4:{gifts:{saffron:0,lapis:0,turquoise:0,vermilion:0},wildflowers:[],bankShots:0},palette:'dawn'});
export function loadState():GardenState{try{const data=JSON.parse(localStorage.getItem(key)||'null');return data?Object.assign(freshState(),data):freshState()}catch{return freshState()}}
export function saveState(state:GardenState){try{localStorage.setItem(key,JSON.stringify(state))}catch{}}
export function clearState(){localStorage.removeItem(key)}
export const giftBudget=(state:GardenState)=>Math.max(3,state.act1.gatesBroken.length+state.act2.built.length+(state.act3.plant?1:0));
export const giftsUsed=(state:GardenState)=>Object.values(state.act4.gifts).reduce((sum,value)=>sum+value,0)+state.act4.wildflowers.length;
