export const TUNING={
  step:1/60,walkSpeed:9.5,turnResponse:13,ropeRest:2.1,ropeStiffness:82,ropeDamping:9,
  heavyMass:8,volatileMass:1,rodMass:.7,heavyDamping:2.8,volatileDamping:.25,
  swingImpulse:2.4,smashThreshold:62,burstImpulse:20,burstMin:4,burstMax:7,
  stormForce:45,stormRadius:15,stormPeriod:45,projectileGravity:-14,projectileMin:10,
  projectileMax:25,chargeSeconds:1.4,hitstopFrames:4,traumaDecay:1.7
} as const;

export type Tuning=typeof TUNING;
