import '@dimforge/rapier3d-compat';

declare module '@dimforge/rapier3d-compat' {
  interface Collider { userData?: unknown }
}
