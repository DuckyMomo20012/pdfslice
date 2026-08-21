import { buildApplication, buildRouteMap } from '@stricli/core'
import { checkCommand } from './commands/check/command'
import { gatherCommand } from './commands/gather/command'
import { splitCommand } from './commands/split/command'

const routes = buildRouteMap({
  routes: {
    split: splitCommand,
    gather: gatherCommand,
    check: checkCommand,
  },
  docs: {
    brief: 'Split PDFs into page images, then gather or check them back',
  },
})

export const app = buildApplication(routes, {
  name: 'pdfslice',
  versionInfo: {
    currentVersion: '0.1.0',
  },
})
