import type { StricliProcess } from '@stricli/core'

/** Command context available to every command implementation via `this`. */
export type AppContext = {
  readonly process: StricliProcess
}

export function buildContext(process: NodeJS.Process): AppContext {
  return { process }
}
