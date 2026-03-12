import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ResilientFetchOptions } from '../fetch/resilient-fetch.js'

export interface RedeemCashuDeps {
  fetchFn: (url: string | URL, init?: RequestInit, options?: ResilientFetchOptions) => Promise<Response>
  storeCredential: (origin: string, macaroon: string, preimage: string, paymentHash: string) => void
  removeToken: (tokenStr: string) => void
}

export async function handleRedeemCashu(
  args: { url: string; token: string },
  deps: RedeemCashuDeps,
) {
  const origin = new URL(args.url).origin

  try {
    // Step 1: Create invoice to get paymentHash and statusToken
    const invoiceResponse = await deps.fetchFn(`${origin}/create-invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    if (!invoiceResponse.ok) {
      const err = await invoiceResponse.json() as Record<string, unknown>
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ error: `Failed to create invoice: ${err.error ?? 'Unknown error'}` }),
        }],
        isError: true as const,
      }
    }

    const invoiceData = await invoiceResponse.json() as Record<string, unknown>
    const paymentHash = invoiceData.payment_hash as string
    const macaroon = invoiceData.macaroon as string

    // Extract statusToken from payment_url query param
    const paymentUrl = invoiceData.payment_url as string
    const statusToken = new URL(paymentUrl, origin).searchParams.get('token') ?? ''

    // Step 2: Redeem Cashu token
    const redeemResponse = await deps.fetchFn(`${origin}/cashu-redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: args.token,
        paymentHash,
        statusToken,
      }),
    })

    if (!redeemResponse.ok) {
      const err = await redeemResponse.json() as Record<string, unknown>
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ error: `Cashu redemption failed: ${err.error ?? 'Unknown error'}` }),
        }],
        isError: true as const,
      }
    }

    const redeemData = await redeemResponse.json() as Record<string, unknown>
    const tokenSuffix = redeemData.token_suffix as string
    const creditSats = redeemData.credited as number

    // Store credential and remove spent token
    deps.storeCredential(origin, macaroon, tokenSuffix, paymentHash)
    deps.removeToken(args.token)

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          redeemed: true,
          creditsReceived: creditSats,
          credentialsStored: true,
        }, null, 2),
      }],
    }
  } catch (err) {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ error: String(err) }),
      }],
      isError: true as const,
    }
  }
}

export function registerRedeemCashuTool(server: McpServer, deps: RedeemCashuDeps): void {
  server.registerTool(
    'l402_redeem_cashu',
    {
      description: 'Redeem Cashu ecash tokens directly on a toll-booth server, avoiding the Lightning round-trip. Handles the two-step flow automatically (create invoice then redeem token). Only works with toll-booth servers.',
      inputSchema: {
        url: z.url().describe('The toll-booth server URL'),
        token: z.string().describe('Cashu token string to redeem (e.g. cashuAey...)'),
      },
    },
    async (args) => handleRedeemCashu(args, deps),
  )
}
