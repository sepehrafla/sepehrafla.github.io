// gasTorque/brakeTorque are configureMotorVelocity's "factor" (max impulse-per-step scale for
// this Rapier build's velocity-motor solver), NOT literal N*m -- verified empirically: factor=22
// (a plausible torque value) produced ~0 angular velocity change even in free air with zero
// ground contact, while factor=3000 reaches the target speed within ~2s of held gas.
export const T={step:1/60,gasTorque:1250,brakeTorque:1300,leanTorque:7.4,airLean:12,maxWheelSpeed:24,wheelRadius:.65,chassisMass:6.5,wheelMass:1.15,friction:1.55,respawn:1.05,wipeForce:26,checkpoint:40,cameraLead:7,paintRegion:30} as const;
