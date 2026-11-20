export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'usage-left': { limits: Shaped<Limit[]>; warned: string[] }
  }
}
