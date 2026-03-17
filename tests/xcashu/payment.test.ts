import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { StoredToken } from '../../src/store/cashu-tokens.js'

// Mock cashu-ts before imports
const mockSend = vi.fn()

vi.mock('@cashu/cashu-ts', () => {
  class MockWallet { send = mockSend }
  return {
    Wallet: MockWallet,
    getDecodedToken: vi.fn(() => ({
      proofs: [{ id: 'k1', amount: 100, secret: 's1', C: 'c1' }],
      unit: 'sat',
    })),
    getEncodedTokenV4: vi.fn(() => 'cashuBencoded'),
  }
})

import { attemptXCashuPayment } from '../../src/xcashu/payment.js'
import type { XCashuChallenge } from '../../src/xcashu/parse.js'

function mockTokenStore(tokens: StoredToken[]) {
  const data = [...tokens]
  return {
    listByMint(mintUrl: string) {
      const norm = mintUrl.replace(/\/+$/, '')
      return data.filter(t => t.mint.replace(/\/+$/, '') === norm)
    },
    removeTokens(toRemove: StoredToken[]) {
      const set = new Set(toRemove.map(t => t.token))
      for (let i = data.length - 1; i >= 0; i--) {
        if (set.has(data[i].token)) data.splice(i, 1)
      }
    },
    add(t: StoredToken) { data.push(t) },
    list() { return [...data] },
    totalBalance() { return data.reduce((s, t) => s + t.amountSats, 0) },
  } as any
}

const challenge: XCashuChallenge = {
  amount: 5,
  unit: 'sat',
  mints: ['https://mint.example.com'],
}

describe('attemptXCashuPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSend.mockResolvedValue({
      send: [{ id: 'k1', amount: 5, secret: 's2', C: 'c2' }],
      keep: [{ id: 'k1', amount: 95, secret: 's3', C: 'c3' }],
    })
  })

  it('returns null when no tokens match any accepted mint', async () => {
    const store = mockTokenStore([{
      token: 'cashuBxxx', mint: 'https://other-mint.com', amountSats: 100, addedAt: '',
    }])

    const result = await attemptXCashuPayment({ challenge, tokenStore: store })
    expect(result).toBeNull()
  })

  it('returns null when matching tokens have insufficient balance', async () => {
    const store = mockTokenStore([{
      token: 'cashuBxxx', mint: 'https://mint.example.com', amountSats: 2, addedAt: '',
    }])

    const result = await attemptXCashuPayment({ challenge, tokenStore: store })
    expect(result).toBeNull()
  })

  it('returns cashuB token when tokens match with sufficient balance', async () => {
    const store = mockTokenStore([{
      token: 'cashuBxxx', mint: 'https://mint.example.com', amountSats: 100, addedAt: '',
    }])

    const result = await attemptXCashuPayment({ challenge, tokenStore: store })

    expect(result).not.toBeNull()
    expect(result!.header).toBe('cashuBencoded')
    expect(result!.amountSats).toBe(5)
  })

  it('restores change proofs to the token store', async () => {
    const store = mockTokenStore([{
      token: 'cashuBxxx', mint: 'https://mint.example.com', amountSats: 100, addedAt: '',
    }])

    await attemptXCashuPayment({ challenge, tokenStore: store })

    // Original token removed, change token added back
    const remaining = store.list()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].amountSats).toBe(95)
    expect(remaining[0].mint).toBe('https://mint.example.com')
  })

  it('removes matching tokens from store before payment', async () => {
    const store = mockTokenStore([{
      token: 'cashuBxxx', mint: 'https://mint.example.com', amountSats: 100, addedAt: '',
    }])

    // Verify token is removed during payment (in case of concurrent access)
    const originalList = store.list()
    expect(originalList).toHaveLength(1)

    await attemptXCashuPayment({ challenge, tokenStore: store })

    // Only change token remains (not the original)
    const after = store.list()
    expect(after.every((t: StoredToken) => t.token !== 'cashuBxxx')).toBe(true)
  })

  it('restores original tokens on wallet.send failure', async () => {
    mockSend.mockRejectedValue(new Error('mint unreachable'))

    const store = mockTokenStore([{
      token: 'cashuBxxx', mint: 'https://mint.example.com', amountSats: 100, addedAt: '',
    }])

    const result = await attemptXCashuPayment({ challenge, tokenStore: store })

    expect(result).toBeNull()
    // Original token restored
    expect(store.list()).toHaveLength(1)
    expect(store.list()[0].token).toBe('cashuBxxx')
  })

  it('aggregates proofs from multiple tokens for the same mint', async () => {
    const store = mockTokenStore([
      { token: 'cashuB1', mint: 'https://mint.example.com', amountSats: 3, addedAt: '' },
      { token: 'cashuB2', mint: 'https://mint.example.com', amountSats: 4, addedAt: '' },
    ])

    // Total is 7, challenge needs 5 — should work
    const result = await attemptXCashuPayment({ challenge, tokenStore: store })
    expect(result).not.toBeNull()

    // wallet.send should have been called with aggregated proofs
    expect(mockSend).toHaveBeenCalledWith(5, expect.any(Array), { includeFees: true })
  })

  it('tries mints in order and uses first with sufficient balance', async () => {
    const multiMintChallenge: XCashuChallenge = {
      amount: 5,
      unit: 'sat',
      mints: ['https://mint-a.com', 'https://mint-b.com'],
    }

    const store = mockTokenStore([
      { token: 'cashuB_b', mint: 'https://mint-b.com', amountSats: 100, addedAt: '' },
    ])

    const result = await attemptXCashuPayment({ challenge: multiMintChallenge, tokenStore: store })
    expect(result).not.toBeNull()
  })
})
