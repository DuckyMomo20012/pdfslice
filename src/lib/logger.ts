import winston from 'winston'

export type LoggerOptions = {
  verbose?: boolean
  quiet?: boolean
  logFile?: string
}

export function createLogger(opts: LoggerOptions = {}): winston.Logger {
  const level = opts.quiet ? 'error' : opts.verbose ? 'debug' : 'info'

  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level: lvl, message, ...meta }) => {
          const extra = Object.keys(meta).length
            ? ` ${JSON.stringify(meta)}`
            : ''
          // eslint-disable-next-line ts/restrict-template-expressions
          return `${lvl}: ${message}${extra}`
        }),
      ),
    }),
  ]

  if (opts.logFile !== undefined) {
    transports.push(
      new winston.transports.File({
        filename: opts.logFile,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        ),
      }),
    )
  }

  return winston.createLogger({ level, transports })
}
