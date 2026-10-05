/** Hides the credentials of every connection string in a text: `mongodb://user:pass@host` */
export function redactUri(text: string): string {
  return text.replace(/(mongodb(?:\+srv)?:\/\/)[^@/\s]*@/gi, '$1***@')
}

/**
 * The database could not be reached. The message is written to be printed as it is: it names the
 * reason the driver gave, with any connection string it repeats stripped of its credentials.
 */
export class DatabaseConnectionError extends Error {
  constructor(reason: unknown) {
    const detail = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason)
    super(`Could not connect to MongoDB. ${redactUri(detail)}`)
    this.name = 'DatabaseConnectionError'
  }
}
