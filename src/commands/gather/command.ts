import { buildCommand } from '@stricli/core'

export type GatherFlags = {
  dryRun: boolean
  backup: boolean
  verbose: boolean
  quiet: boolean
  logFile?: string
}

export const gatherCommand = buildCommand({
  loader: async () => (await import('./impl')).gatherImpl,
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
      dryRun: {
        kind: 'boolean',
        brief: 'Preview actions without writing any files',
        default: false,
      },
      backup: {
        kind: 'boolean',
        brief: 'Back up the existing PDF before overwriting it',
        default: true,
      },
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
    brief:
      'Gather page images back into a PDF, reporting any missing pages',
  },
})
