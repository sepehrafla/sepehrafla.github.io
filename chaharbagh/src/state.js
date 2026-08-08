const STORAGE_KEY='chaharbagh-garden-v1';

export const newState=()=>({
  act:1,
  act1:{carried:[],dropped:[],barbellIntact:false,heavyEndKept:false,volatileOutcome:Math.random()<.5?'exploded':'grew',shattered:[]},
  act2:{vesselsPoured:{pavilion:0,orchard:0,library:0,watchtower:0},structuresBuilt:[]},
  act3:{plantSpot:null,wanderPath:[],timeToDecide:0},
  act4:{gifts:{saffron:[],lapis:[],turquoise:[],vermilion:[]},quadrantsBloomedForOthers:0},
  palette:'dawn'
});

export function loadState(){
  try{
    const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY));
    return parsed&&parsed.act?Object.assign(newState(),parsed):newState();
  }catch{return newState()}
}

export function saveState(state){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}catch{}
}

export function clearState(){
  try{localStorage.removeItem(STORAGE_KEY)}catch{}
}

export function giftCount(state){
  return Math.max(3,state.act2.structuresBuilt.length+2);
}

export function giftsGiven(state){
  return Object.values(state.act4.gifts).reduce((total,gifts)=>total+gifts.length,0);
}

export function derivePalette(state){
  if(state.act3.timeToDecide>150)return'night';
  if(state.act3.timeToDecide>95)return'dusk';
  if(state.act1.volatileOutcome==='grew'&&state.act2.structuresBuilt.length>=2)return'noon';
  return'dawn';
}
