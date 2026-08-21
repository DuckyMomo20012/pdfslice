import type { AppContext } from '../../context'
import type { CheckFlags } from './command'
import process from 'node:process'
import { gatherAll } from '../../lib/gather'
import { createLogger } from '../../lib/logger'

export async function checkImpl(
  this: AppContext,
  flags: CheckFlags,
  input: string,
): Promise<void> {
  const logger = createLogger({
    verbose: flags.verbose,
    quiet: flags.quiet,
    logFile: flags.logFile,
  })

  const reports = await gatherAll({
    input,
    checkOnly: true,
    logger,
  })

  const withMissing = reports.filter(r => r.missingPages.length > 0)
  if (withMissing.length > 0) {
    logger.warn(`${withMissing.length} unit(s) have missing pages`)
    process.exitCode = 1
  }
  else {
    logger.info(`All ${reports.length} unit(s) complete.`)
  }
}
