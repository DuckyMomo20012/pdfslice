import { buildCommand } from '@stricli/core'

export type CheckFlags = {
  verbose: boolean
  quiet: boolean
  logFile?: string
}

export const checkCommand = buildCommand({
  loader: async () => (await import('./impl')).checkImpl,
  parameters: {
    positional: {
      kind: 'tuple',
      parameters: [
        {
          brief:
            'Folder from a split run (a single unit, or a folder containing many units)',
          parse: String,
          placeholder: 'input',
        },
      ],
    },
    flags: {
      verbose: {
        kind: 'boolean',
        brief: 'Enable debug logging',
        default: false,
      },
      quiet: {
        kind: 'boolean',
        brief: 'Only log errors',
        default: false,
      },
      logFile: {
        kind: 'parsed',
        parse: String,
        brief: 'Path to also write logs as JSON',
        optional: true,
      },
    },
  },
  docs: {
    brief: 'Report missing page images without writing any PDF (read-only)',
  },
})
