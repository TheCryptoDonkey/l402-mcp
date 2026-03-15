import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dns.promises.lookup and nostr-tools
const mockLookup = vi.fn()
vi.mock('node:dns', () => ({
  promises: { lookup: (...args: unknown[]) => mockLookup(...args) },
}))

const mockConnect = vi.fn()
const mockVerifyEvent = vi.fn().mockReturnValue(true)
vi.mock('nostr-tools/relay', () => ({
  Relay: { connect: (...args: unknown[]) => mockConnect(...args) },
}))
vi.mock('nostr-tools/pure', () => ({
  verifyEvent: (...args: unknown[]) => mockVerifyEvent(...args),
}))

const { createNostrSubscriber } = await import('../../src/tools/nostr-subscribe.js')

beforeEach(() => {
  mockLookup.mockReset()
  mockConnect.mockReset()
})

describe('createNostrSubscriber', () => {
  it('blocks relay URLs that resolve to private IPs', async () => {
    // DNS resolves to a private IP
    mockLookup.mockResolvedValue([{ address: '192.168.1.1', family: 4 }])

    const subscriber = createNostrSubscriber(false)
    const events = await subscriber(['wss://evil-relay.example.com'], [31402], 3000)

    // Relay.connect should NOT be called because SSRF guard blocked it
    expect(mockConnect).not.toHaveBeenCalled()
    expect(events).toEqual([])
  })

  it('allows relay URLs that resolve to public IPs', async () => {
    mockLookup.mockResolvedValue([{ address: '1.2.3.4', family: 4 }])

    const mockSub = {
      close: vi.fn(),
    }
    const mockRelay = {
      subscribe: vi.fn().mockImplementation((_filters: unknown, opts: { oneose: () => void }) => {
        // Simulate immediate EOSE
        setTimeout(() => opts.oneose(), 10)
        return mockSub
      }),
      close: vi.fn(),
    }
    mockConnect.mockResolvedValue(mockRelay)

    const subscriber = createNostrSubscriber(false)
    const events = await subscriber(['wss://public-relay.example.com'], [31402], 3000)

    expect(mockConnect).toHaveBeenCalled()
    expect(events).toEqual([])
  })

  it('skips SSRF check when ssrfAllowPrivate is true', async () => {
    const mockSub = {
      close: vi.fn(),
    }
    const mockRelay = {
      subscribe: vi.fn().mockImplementation((_filters: unknown, opts: { oneose: () => void }) => {
        setTimeout(() => opts.oneose(), 10)
        return mockSub
      }),
      close: vi.fn(),
    }
    mockConnect.mockResolvedValue(mockRelay)

    const subscriber = createNostrSubscriber(true)
    await subscriber(['ws://localhost:7777'], [31402], 3000)

    // DNS lookup should not be called when allowPrivate is true
    expect(mockLookup).not.toHaveBeenCalled()
    expect(mockConnect).toHaveBeenCalled()
  })

  it('rejects non-websocket protocols', async () => {
    const subscriber = createNostrSubscriber(false)
    const events = await subscriber(['http://relay.example.com'], [31402], 3000)

    expect(mockConnect).not.toHaveBeenCalled()
    expect(events).toEqual([])
  })
})
