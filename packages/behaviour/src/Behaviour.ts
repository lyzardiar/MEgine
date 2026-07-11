/** Unity-like script component base. Extend and register with @RegisterBehaviour. */
export class Behaviour {
  /** Scene JSON key — set by @RegisterBehaviour. */
  static readonly typeName: string = '';

  onEnable(_ctx: import('./types.js').BehaviourContext): void {}
  onUpdate(_ctx: import('./types.js').BehaviourContext): void {}
  onDisable(_ctx: import('./types.js').BehaviourContext): void {}
}
