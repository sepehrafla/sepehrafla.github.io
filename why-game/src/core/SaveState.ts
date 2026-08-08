export type RideMode='free'|'daily';
export interface SaveState{sparks:number;paint:Record<string,number>;tier:number;bestDaily:Record<string,{time:number;sparks:number}>;streak:number;lastDaily:string}
const key='why-ride-v1';
export const fresh=():SaveState=>({sparks:0,paint:{},tier:0,bestDaily:{},streak:0,lastDaily:''});
export function load(){try{return Object.assign(fresh(),JSON.parse(localStorage.getItem(key)||'null')||{})}catch{return fresh()}}
export function save(state:SaveState){try{localStorage.setItem(key,JSON.stringify(state))}catch{}}
export const tierFor=(sparks:number)=>sparks>=24?4:sparks>=15?3:sparks>=8?2:sparks>=3?1:0;

