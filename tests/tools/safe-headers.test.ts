import { describe, it, expect } from 'vitest'
import { filterResponseHeaders } from '../../src/tools/safe-headers.js'

describe('filterResponseHeaders', () => {
  it('passes through whitelisted headers', () => {
    const headers = new Headers({
      'content-type': 'application/json',
      'x-credit-balance': '42',
      'date': 'Wed, 11 Mar 2026 12:00:00 GMT',
    })

    const filtered = filterResponseHeaders(headers)
    expect(filtered['content-type']).toBe('application/json')
    expect(filtered['x-credit-balance']).toBe('42')
    expect(filtered['date']).toBeDefined()
  })

  it('strips sensitive headers', () => {
    const headers = new Headers({
      'content-type': 'text/plain',
      'set-cookie': 'session=abc123; HttpOnly',
      'authorization': 'Bearer secret-token',
      'x-internal-trace-id': 'trace-12345',
      'server': 'nginx/1.18.0',
    })

    const filtered = filterResponseHeaders(headers)
    expect(filtered['content-type']).toBe('text/plain')
    expect(filtered['set-cookie']).toBeUndefined()
    expect(filtered['authorization']).toBeUndefined()
    expect(filtered['x-internal-trace-id']).toBeUndefined()
    expect(filtered['server']).toBeUndefined()
  })

  it('returns empty object for no matching headers', () => {
    const headers = new Headers({
      'x-custom-internal': 'value',
    })

    const filtered = filterResponseHeaders(headers)
    expect(Object.keys(filtered)).toHaveLength(0)
  })
})
