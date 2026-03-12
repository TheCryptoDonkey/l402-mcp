export class SsrfError extends Error {
  override readonly name = 'SsrfError'

  constructor(reason: string, url: string) {
    super(`SSRF blocked: ${reason} (${url})`)
  }
}

export class TimeoutError extends Error {
  override readonly name = 'TimeoutError'

  constructor(ms: number, url: string) {
    super(`Request timed out after ${ms}ms (${url})`)
  }
}

export class RetryExhaustedError extends Error {
  override readonly name = 'RetryExhaustedError'

  constructor(attempts: number, url: string, cause: Error) {
    super(`Request failed after ${attempts} attempts (${url}): ${cause.message}`, { cause })
  }
}
