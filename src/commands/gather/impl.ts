import type { AppContext } from '../../context'
import type { GatherFlags } from './command'
import { gatherAll } from '../../lib/gather'
import { createLogger } from '../../lib/logger'

export async function gatherImpl(
  this: AppContext,
  flags: GatherFlags,
  input: string,
): Promise<void> {
  const logger = createLogger({
    verbose: flags.verbose,
    quiet: flags.quiet,
    logFile: flags.logFile,
  })

  const reports = await gatherAll({
    input,
    dryRun: flags.dryRun,
    checkOnly: false,
    logger,
  })

  const withMissing = reports.filter(r => r.missingPages.length > 0)
  if (withMissing.length > 0) {
    logger.warn(`${withMissing.length} unit(s) have missing pages`)
  }
  logger.info(`Done. Processed ${reports.length} unit folder(s).`)
}
