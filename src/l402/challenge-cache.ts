export interface CachedChallenge {
  invoice: string
  macaroon: string
  paymentHash: string
  costSats: number | null
  expiresAt: number
  url?: string
}

export class ChallengeCache {
  private cache = new Map<string, CachedChallenge>()

  set(challenge: CachedChallenge): void {
    this.cache.set(challenge.paymentHash, challenge)
  }

  get(paymentHash: string): CachedChallenge | undefined {
    const entry = this.cache.get(paymentHash)
    if (!entry) return undefined

    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(paymentHash)
      return undefined
    }

    return entry
  }

  delete(paymentHash: string): void {
    this.cache.delete(paymentHash)
  }
}
