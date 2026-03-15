/**
 * Programmatic usage of 402-mcp subpath exports.
 *
 * 402-mcp exposes its internals via subpath exports so you can use
 * individual components outside the MCP server — in scripts, tests,
 * or custom integrations.
 *
 * Run with:  npx tsx examples/programmatic-usage.ts
 */

// --- Spend tracking ---
import { SpendTracker } from '402-mcp/spend-tracker'

const tracker = new SpendTracker()
const recorded = tracker.tryRecord(50, 10_000)
console.log('Recorded 50 sats spend:', recorded) // true

// --- Credential store ---
import { CredentialStore } from '402-mcp/store/credentials'

const store = new CredentialStore('~/.402-mcp/credentials.json')
await store.init()
console.log('Credential store initialised')

// --- L402 protocol utilities ---
import { parseL402Challenge } from '402-mcp/l402/parse'

// Parse an L402 WWW-Authenticate header
const challenge = parseL402Challenge(
  'L402 macaroon="abc123", invoice="lnbc1..."',
)
console.log('Parsed challenge:', challenge)

// --- Resilient fetch (SSRF-guarded, retry, timeout) ---
import { createResilientFetch } from '402-mcp/fetch/resilient-fetch'

const resilientFetch = createResilientFetch(fetch, {
  timeoutMs: 10_000,
  retries: 2,
  ssrfAllowPrivate: false,
})

// Use like regular fetch — with built-in SSRF protection, retry, and timeout
const response = await resilientFetch('https://example.com/api')
console.log('Fetch status:', response.status)
